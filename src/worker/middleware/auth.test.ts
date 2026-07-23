import { describe, expect, it, vi } from "vitest";
import {
	type IdentityBindings,
	parseDevelopmentEmails,
	resolveIdentityEmail,
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
});
