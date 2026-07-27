import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("./api.ts", () => ({
	CloudflareApi: class {
		request = request;
	},
	CloudflareApiError: class CloudflareApiError extends Error {},
}));

const { ensureAccess } = await import("./access.ts");

function deploymentConfig(): DeploymentConfig {
	return {
		accountId: "a".repeat(32),
		hostname: "management.example.com",
		bootstrapOwnerEmail: "founder@example.com",
		access: {
			sessionDuration: "24h",
			identityProviderName: "One-time PIN login",
			teamName: "management",
			bootstrapOwnerEmail: "founder@example.com",
			groupNames: {
				owner: "Management · Owners",
				admin: "Management · Admins",
				user: "Management · Users",
			},
			applicationNames: {
				base: "Management",
				admin: "Management · Admin",
				owner: "Management · Owner",
				public: "Management · Public",
			},
			policyNames: {
				base: "Allow Management members",
				admin: "Allow Management admins",
				owner: "Allow Management owners",
				public: "Bypass Management public paths",
			},
		},
	} as DeploymentConfig;
}

afterEach(() => {
	delete process.env.CLOUDFLARE_API_TOKEN;
	request.mockReset();
});

describe("Access convergence", () => {
	it("creates fixed groups, path applications, and exact policies", async () => {
		process.env.CLOUDFLARE_API_TOKEN = "test-token";
		let applicationIndex = 0;
		request.mockImplementation(
			async (
				path: string,
				options: { method?: string; body?: Record<string, unknown> },
			) => {
				const body = options.body ?? {};
				if (path === "/access/organizations") {
					return { auth_domain: "team.cloudflareaccess.com" };
				}
				if (path.startsWith("/access/identity_providers")) {
					return [{ id: "otp", name: "OTP", type: "onetimepin" }];
				}
				if (path === "/access/groups?per_page=100") {
					return [
						{
							id: "owner-group",
							name: "Management · Owners",
							include: [{ email: { email: "founder@example.com" } }],
							exclude: [],
							require: [],
						},
					];
				}
				if (path.startsWith("/access/groups/") || path === "/access/groups") {
					const role = String(body.name).includes("Admins")
						? "admin"
						: String(body.name).includes("Users")
							? "user"
							: "owner";
					return {
						id: `${role}-group`,
						...body,
					};
				}
				if (path === "/access/apps?per_page=100") return [];
				if (path === "/access/apps" && options.method === "POST") {
					applicationIndex += 1;
					return {
						id: `app-${applicationIndex}`,
						aud: `aud-${applicationIndex}`,
						...body,
					};
				}
				if (path.endsWith("/policies?per_page=100")) return [];
				if (path.includes("/policies") && options.method === "POST") {
					return { id: `policy-${applicationIndex}`, ...body };
				}
				throw new Error(`Unexpected request: ${path}`);
			},
		);

		const result = await ensureAccess(deploymentConfig());

		expect(result.audiences).toEqual({
			base: "aud-1",
			admin: "aud-2",
			owner: "aud-3",
		});
		expect(result.groupIds).toEqual({
			owner: "owner-group",
			admin: "admin-group",
			user: "user-group",
		});
		const groupWrites = request.mock.calls.filter(
			([path, options]) =>
				(path === "/access/groups" || path.startsWith("/access/groups/")) &&
				options.method !== undefined,
		);
		expect(groupWrites).toHaveLength(3);
		expect(
			groupWrites.find(([, options]) =>
				String(options.body?.name).includes("Admins"),
			)?.[1].body?.include,
		).toEqual([
			{
				email: {
					email: "create-admin-app-unassigned-admin@example.com",
				},
			},
		]);
		const publicApplication = request.mock.calls.find(
			([path, options]) =>
				path === "/access/apps" && options.body?.name === "Management · Public",
		);
		expect(publicApplication?.[1].body?.destinations).toEqual(
			expect.arrayContaining([
				{
					type: "public",
					uri: "management.example.com/assets/*",
				},
				{
					type: "public",
					uri: "management.example.com/api/public/*",
				},
			]),
		);
	});
});
