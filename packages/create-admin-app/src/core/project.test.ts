import { describe, expect, it } from "vitest";
import {
	displayNameFromPackageName,
	normalizeDisplayName,
	normalizeEmail,
	packageNameFromDirectory,
} from "./project.js";

describe("project inputs", () => {
	it("derives stable package and display names", () => {
		expect(packageNameFromDirectory("/tmp/My Company Admin")).toBe(
			"my-company-admin",
		);
		expect(packageNameFromDirectory("/tmp/My.Company_Admin")).toBe(
			"my-company-admin",
		);
		expect(
			packageNameFromDirectory(`/tmp/${"company".repeat(20)}`).length,
		).toBe(63);
		expect(displayNameFromPackageName("my-company_admin")).toBe(
			"My Company Admin",
		);
	});

	it("normalizes and validates the service name", () => {
		expect(normalizeDisplayName("  My   Company ")).toBe("My Company");
		expect(() => normalizeDisplayName("   ")).toThrow("서비스 이름");
		expect(() => normalizeDisplayName("a".repeat(101))).toThrow("100자");
	});

	it("normalizes the bootstrap Owner email", () => {
		expect(normalizeEmail(" Admin@Example.com ")).toBe("admin@example.com");
	});

	it("rejects invalid emails", () => {
		expect(() => normalizeEmail("not-an-email")).toThrow("이메일");
	});
});
