import { describe, expect, it } from "vitest";
import { createDeploymentConfig, parseUserConfig } from "./config.ts";

describe("parseUserConfig", () => {
	it("normalizes all user-controlled deployment values", () => {
		expect(
			parseUserConfig(
				{
					domain: " EXAMPLE.COM ",
					name: "  Operations   Hub  ",
					allowedEmails: [" Admin@Example.com ", "admin@example.com"],
				},
				"test config",
			),
		).toEqual({
			domain: "example.com",
			name: "Operations Hub",
			allowedEmails: ["admin@example.com"],
			serviceName: "operations-hub",
			routing: "custom-domain",
			hostname: "operations-hub.example.com",
		});
	});

	it("uses workers.dev when the domain is omitted", () => {
		const userConfig = parseUserConfig(
			{
				name: "Operations Hub",
				allowedEmails: ["admin@example.com"],
			},
			"test config",
		);
		expect(userConfig).toEqual({
			name: "Operations Hub",
			allowedEmails: ["admin@example.com"],
			serviceName: "operations-hub",
			routing: "workers-dev",
			hostname: undefined,
		});
		expect(
			createDeploymentConfig(
				userConfig,
				"a".repeat(32),
				"2026-07-22",
				"my-account",
			),
		).toMatchObject({
			hostname: "operations-hub.my-account.workers.dev",
			access: { identityProviderName: "One-time PIN login" },
		});
	});

	it("rejects unknown configuration fields", () => {
		expect(() =>
			parseUserConfig(
				{
					domain: "example.com",
					name: "Platform",
					allowedEmails: ["admin@example.com"],
					workerName: "hard-coded-name",
				},
				"test config",
			),
		).toThrow("Unrecognized key");
	});

	it("rejects names that cannot become a resource identifier", () => {
		expect(() =>
			parseUserConfig(
				{
					domain: "example.com",
					name: "✨",
					allowedEmails: ["admin@example.com"],
				},
				"test config",
			),
		).toThrow("식별자로 변환");
	});
});
