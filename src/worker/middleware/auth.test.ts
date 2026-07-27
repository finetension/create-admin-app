import { describe, expect, it, vi } from "vitest";
import {
	accessJwtVerificationOptions,
	type IdentityBindings,
	resolveIdentity,
	resolveUser,
	verifyAccessIdentity,
} from "./auth";

const sharedBindings = {
	ACCESS_ACCOUNT_ID: "a".repeat(32),
	ACCESS_GROUP_OWNER_ID: "owner-group",
	ACCESS_GROUP_ADMIN_ID: "admin-group",
	ACCESS_GROUP_MEMBER_ID: "member-group",
	ACCESS_BOOTSTRAP_OWNER_EMAIL: "founder@example.com",
	ACCESS_MANAGEMENT_TOKEN: "test-token",
	ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
	ACCESS_AUD_BASE: "base-audience",
	ACCESS_AUD_ADMIN: "admin-audience",
	ACCESS_AUD_OWNER: "owner-audience",
};

const productionBindings = {
	...sharedBindings,
	ENVIRONMENT: "production",
} satisfies IdentityBindings;

const developmentBindings = {
	...sharedBindings,
	ENVIRONMENT: "development",
	DEV_USER_EMAIL: "founder@example.com",
	DEV_ACCESS_ROLE: "owner",
	DEV_ACCESS_PUBLIC: "false",
} satisfies IdentityBindings;

describe("Access identity boundary", () => {
	it("resolves production email and role through verified boundaries", async () => {
		const verifyIdentity = vi.fn(async () => "member@example.com");
		const resolveRole = vi.fn(async () => "admin" as const);

		await expect(
			resolveIdentity(
				new Request("https://admin.example.com/api/me"),
				productionBindings,
				verifyIdentity,
				resolveRole,
			),
		).resolves.toEqual({ email: "member@example.com", role: "admin" });
		expect(verifyIdentity).toHaveBeenCalledOnce();
		expect(resolveRole).toHaveBeenCalledWith(
			"member@example.com",
			productionBindings,
		);
	});

	it("requires an Access assertion in production", async () => {
		await expect(
			verifyAccessIdentity(
				new Request("https://admin.example.com/api/me"),
				productionBindings,
			),
		).rejects.toMatchObject({
			status: 401,
			code: "UNAUTHENTICATED",
		});
	});

	it("pins Access verification to the configured issuer and route audience", async () => {
		expect(
			accessJwtVerificationOptions(
				"https://team.cloudflareaccess.com/",
				"application-audience",
			),
		).toEqual({
			issuer: "https://team.cloudflareaccess.com",
			audience: "application-audience",
		});
		const verifyJwt = vi.fn(async () => ({
			payload: { email: "owner@example.com" },
		}));
		await verifyAccessIdentity(
			new Request("https://admin.example.com/api/owner/members", {
				headers: { "Cf-Access-Jwt-Assertion": "valid-token" },
			}),
			productionBindings,
			verifyJwt,
		);
		expect(verifyJwt).toHaveBeenCalledWith(
			"valid-token",
			expect.any(Function),
			expect.objectContaining({ audience: "owner-audience" }),
		);
	});

	it("rejects invalid signatures, issuers, or audiences", async () => {
		await expect(
			verifyAccessIdentity(
				new Request("https://admin.example.com/api/me", {
					headers: { "Cf-Access-Jwt-Assertion": "invalid-token" },
				}),
				productionBindings,
				async () => {
					throw new Error("signature verification failed");
				},
			),
		).rejects.toMatchObject({
			status: 401,
			code: "INVALID_ACCESS_ASSERTION",
		});
	});

	it("uses explicit role bindings locally and ignores request headers", async () => {
		await expect(
			resolveIdentity(
				new Request("http://localhost/api/me", {
					headers: {
						"X-Dev-User": "outsider@example.com",
						"X-Dev-Role": "member",
					},
				}),
				developmentBindings,
			),
		).resolves.toEqual({
			email: "founder@example.com",
			role: "owner",
		});
	});

	it("represents public local development as unauthenticated", async () => {
		await expect(
			resolveIdentity(new Request("http://localhost/api/me"), {
				...developmentBindings,
				DEV_ACCESS_PUBLIC: "true",
			}),
		).rejects.toMatchObject({
			status: 401,
			code: "UNAUTHENTICATED",
		});
	});

	it("uses an idempotent insert before resolving the audit identity", async () => {
		const run = vi.fn(async () => ({}));
		const first = vi.fn(async () => ({
			id: "user-id",
			email: "founder@example.com",
		}));
		const prepare = vi.fn((sql: string) => ({
			bind: vi.fn(() =>
				sql.includes("INSERT OR IGNORE") ? { run } : { first },
			),
		}));

		await expect(
			resolveUser({ prepare } as unknown as D1Database, {
				email: "founder@example.com",
				role: "owner",
			}),
		).resolves.toEqual({
			id: "user-id",
			email: "founder@example.com",
			role: "owner",
		});
		expect(prepare.mock.calls[0]?.[0]).toContain("INSERT OR IGNORE");
		expect(run).toHaveBeenCalledOnce();
		expect(first).toHaveBeenCalledOnce();
	});
});
