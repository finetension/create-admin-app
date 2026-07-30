import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("./api.ts", () => ({
	CloudflareApi: class {
		request = request;
	},
	CloudflareApiError: class CloudflareApiError extends Error {},
}));

const { ensureAccess, findApplications, findManagedGoogleIdentityProvider } =
	await import("./access.ts");

function deploymentConfig(): DeploymentConfig {
	return {
		accountId: "a".repeat(32),
		hostname: "management.example.com",
		bootstrapOwnerEmail: "founder@example.com",
		access: {
			sessionDuration: "24h",
			identityProviderName: "One-time PIN login",
			googleIdentityProviderName: "Google login",
			googleLogin: false,
			teamName: "management",
			bootstrapOwnerEmail: "founder@example.com",
			groupNames: {
				owner: "Management · Owners",
				admin: "Management · Admins",
				member: "Management · Members",
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
	delete process.env.GOOGLE_OAUTH_CLIENT_ID;
	delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
	request.mockReset();
});

describe("Access convergence", () => {
	it("finds existing path applications by destinations after a safe rename", () => {
		const applications = findApplications(
			[
				{
					id: "legacy-admin",
					name: "Previous admin name",
					type: "self_hosted",
					aud: "admin-audience",
					destinations: [
						{ type: "public", uri: "management.example.com/admin" },
						{ type: "public", uri: "management.example.com/admin/*" },
						{ type: "public", uri: "management.example.com/api/admin" },
						{ type: "public", uri: "management.example.com/api/admin/*" },
					],
				},
			],
			deploymentConfig(),
		);

		expect(applications.admin?.id).toBe("legacy-admin");
	});

	it("does not adopt an unrelated Google provider", () => {
		expect(
			findManagedGoogleIdentityProvider(
				[{ id: "unrelated", name: "Company Google", type: "google" }],
				"Google login",
			),
		).toBeUndefined();
		expect(
			findManagedGoogleIdentityProvider(
				[
					{ id: "unrelated", name: "Company Google", type: "google" },
					{ id: "current", name: "Google login", type: "google" },
				],
				"Google login",
			)?.id,
		).toBe("current");
	});

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
						: String(body.name).includes("Members")
							? "member"
							: "owner";
					return {
						id:
							path === "/access/groups"
								? `${role}-group`
								: path.split("/").at(-1),
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
			member: "member-group",
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
		const adminApplication = request.mock.calls.find(
			([path, options]) =>
				path === "/access/apps" && options.body?.name === "Management · Admin",
		);
		expect(adminApplication?.[1].body?.allowed_idps).toEqual(["otp"]);
		expect(adminApplication?.[1].body?.auto_redirect_to_identity).toBe(true);
		expect(adminApplication?.[1].body?.custom_deny_url).toBe(
			"https://management.example.com/public/access-denied",
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
		expect(publicApplication?.[1].body).not.toHaveProperty("custom_deny_url");
	});

	it("updates the managed Google provider and allows both login methods", async () => {
		process.env.CLOUDFLARE_API_TOKEN = "test-token";
		process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
		process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
		const config = deploymentConfig();
		config.access.googleLogin = true;
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
				if (
					path === "/access/identity_providers?per_page=100" &&
					options.method === undefined
				) {
					return [
						{ id: "otp", name: "OTP", type: "onetimepin" },
						{ id: "google", name: "Google login", type: "google" },
					];
				}
				if (
					path === "/access/identity_providers/google" &&
					options.method === "PUT"
				) {
					return { id: "google", ...body };
				}
				if (path === "/access/groups?per_page=100") return [];
				if (path === "/access/groups" && options.method === "POST") {
					const role = String(body.name).includes("Admins")
						? "admin"
						: String(body.name).includes("Members")
							? "member"
							: "owner";
					return { id: `${role}-group`, ...body };
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

		await ensureAccess(config);

		const googleWrite = request.mock.calls.find(
			([path, options]) =>
				path === "/access/identity_providers/google" &&
				options.method === "PUT",
		);
		expect(googleWrite?.[1].body).toMatchObject({
			name: "Google login",
			type: "google",
			config: {
				client_id: "google-client-id",
				client_secret: "google-client-secret",
			},
		});
		const applicationWrites = request.mock.calls.filter(
			([path, options]) => path === "/access/apps" && options.method === "POST",
		);
		expect(applicationWrites).toHaveLength(4);
		for (const [, options] of applicationWrites) {
			expect(options.body?.allowed_idps).toEqual(["otp", "google"]);
			expect(options.body?.auto_redirect_to_identity).toBe(false);
		}
	});
});
