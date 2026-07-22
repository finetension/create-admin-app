import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
	it("parses non-interactive local generation", () => {
		expect(
			parseArgs([
				"my-admin",
				"--yes",
				"--emails",
				"admin@example.com",
				"--no-github",
				"--no-cloudflare",
			]),
		).toMatchObject({
			directory: "my-admin",
			yes: true,
			emails: "admin@example.com",
			github: false,
			cloudflare: false,
		});
	});

	it("requires a domain when a custom prefix is provided", () => {
		expect(() => parseArgs(["app", "--subdomain", "backoffice"])).toThrow(
			"--domain",
		);
	});

	it("connects Cloudflare when a custom domain is provided", () => {
		expect(parseArgs(["app", "--domain", "example.com"]).cloudflare).toBe(true);
	});

	it("keeps GitHub and Cloudflare decisions unset by default", () => {
		const options = parseArgs(["app"]);
		expect(options.public).toBe(false);
		expect(options.github).toBeUndefined();
		expect(options.cloudflare).toBeUndefined();
	});

	it("keeps explicitly public repositories local-only", () => {
		expect(parseArgs(["app", "--public"])).toMatchObject({
			public: true,
			github: true,
			cloudflare: false,
		});
	});

	it("rejects Cloudflare production setup for public repositories", () => {
		expect(() => parseArgs(["app", "--public", "--cloudflare"])).toThrow(
			"private",
		);
		expect(() => parseArgs(["app", "--public", "--deploy"])).toThrow("private");
	});
});
