import { describe, expect, it, vi } from "vitest";
import {
	accessJwtVerificationOptions,
	type IdentityBindings,
	parseDevelopmentEmails,
	resolveIdentityEmail,
	resolveUser,
	verifyAccessIdentity,
} from "./auth";

const productionBindings = {
	ENVIRONMENT: "production",
	ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
	ACCESS_AUD: "application-audience",
} satisfies IdentityBindings;

const developmentBindings = {
	ENVIRONMENT: "development",
	DEV_ALLOWED_EMAILS: JSON.stringify([
		"founder@example.com",
		"teammate@example.com",
	]),
	ACCESS_TEAM_DOMAIN: "",
	ACCESS_AUD: "",
} satisfies IdentityBindings;

describe("Access identity boundary", () => {
	it("delegates production identity to the Access assertion verifier", async () => {
		const verifyIdentity = vi.fn(async () => "member@example.com");

		await expect(
			resolveIdentityEmail(
				new Request("https://admin.example.com/api/me"),
				productionBindings,
				verifyIdentity,
			),
		).resolves.toBe("member@example.com");
		expect(verifyIdentity).toHaveBeenCalledOnce();
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

	it("pins Access verification to the configured issuer and audience", () => {
		expect(
			accessJwtVerificationOptions(
				"https://team.cloudflareaccess.com/",
				"application-audience",
			),
		).toEqual({
			issuer: "https://team.cloudflareaccess.com",
			audience: "application-audience",
		});
	});

	it("rejects invalid signatures, issuers, or audiences as authentication errors", async () => {
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

	it("uses only configured development identities locally", async () => {
		await expect(
			resolveIdentityEmail(
				new Request("http://localhost/api/me"),
				developmentBindings,
			),
		).resolves.toBe("founder@example.com");
		await expect(
			resolveIdentityEmail(
				new Request("http://localhost/api/me", {
					headers: { "X-Dev-User": "Teammate@Example.com" },
				}),
				developmentBindings,
			),
		).resolves.toBe("teammate@example.com");
		await expect(
			resolveIdentityEmail(
				new Request("http://localhost/api/me", {
					headers: { "X-Dev-User": "outsider@example.com" },
				}),
				developmentBindings,
			),
		).rejects.toMatchObject({
			status: 403,
			code: "USER_NOT_ALLOWED",
		});
	});

	it("normalizes and deduplicates development emails", () => {
		expect(
			parseDevelopmentEmails(
				JSON.stringify([" Founder@Example.com ", "founder@example.com"]),
			),
		).toEqual(["founder@example.com"]);
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
			resolveUser({ prepare } as unknown as D1Database, "founder@example.com"),
		).resolves.toEqual({
			id: "user-id",
			email: "founder@example.com",
		});
		expect(prepare.mock.calls[0]?.[0]).toContain("INSERT OR IGNORE");
		expect(run).toHaveBeenCalledOnce();
		expect(first).toHaveBeenCalledOnce();
	});
});
