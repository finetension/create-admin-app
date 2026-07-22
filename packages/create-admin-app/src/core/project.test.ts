import { describe, expect, it } from "vitest";
import {
	displayNameFromPackageName,
	normalizeEmails,
	packageNameFromDirectory,
	subdomainFromPackageName,
	validateSubdomain,
} from "./project.js";

describe("project inputs", () => {
	it("derives stable package and display names", () => {
		expect(packageNameFromDirectory("/tmp/My Company Admin")).toBe(
			"my-company-admin",
		);
		expect(displayNameFromPackageName("my-company_admin")).toBe(
			"My Company Admin",
		);
	});

	it("falls back to stable package and subdomain names", () => {
		expect(packageNameFromDirectory("/tmp/---")).toBe("admin-app");
		expect(subdomainFromPackageName("___")).toBe("admin");
	});

	it("normalizes and deduplicates allowed emails", () => {
		expect(
			normalizeEmails(
				" Admin@Example.com,owner@example.com\nadmin@example.com ",
			),
		).toBe("admin@example.com,owner@example.com");
	});

	it("rejects invalid emails and subdomains", () => {
		expect(() => normalizeEmails("not-an-email")).toThrow("이메일");
		expect(validateSubdomain("admin-console")).toBeUndefined();
		expect(validateSubdomain("Admin Console")).toContain("영문 소문자");
	});
});
