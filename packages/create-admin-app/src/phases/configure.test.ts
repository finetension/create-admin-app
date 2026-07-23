import { describe, expect, it } from "vitest";
import type { CreateContext } from "../core/context.js";
import { buildInitArgs, createDeployConfig } from "./configure.js";

function fixtureContext(cloudflare = false): CreateContext {
	return {
		args: {
			yes: true,
			skipInstall: false,
			public: false,
			deploy: false,
		},
		interactive: false,
		project: {
			directoryInput: "admin",
			destination: "/tmp/admin",
			packageName: "admin",
			displayName: "Company Admin",
			allowedEmails: "admin@example.com,owner@example.com",
		},
		...(cloudflare
			? {
					cloudflare: {
						accountId: "account-id",
						accountName: "Company",
						token: "token",
						domain: "example.com",
						subdomain: "admin",
					},
				}
			: {}),
	};
}

describe("configure phase", () => {
	it("builds local workers.dev initialization arguments", () => {
		expect(buildInitArgs(fixtureContext())).toEqual([
			"cli",
			"init",
			"--name",
			"Company Admin",
			"--emails",
			"admin@example.com,owner@example.com",
			"--force",
			"--workers-dev",
		]);
	});

	it("builds custom-domain config from the shared context", () => {
		const context = fixtureContext(true);
		expect(buildInitArgs(context)).toContain("example.com");
		expect(createDeployConfig(context)).toEqual({
			domain: "example.com",
			subdomain: "admin",
			name: "Company Admin",
			allowedEmails: ["admin@example.com", "owner@example.com"],
		});
	});
});
