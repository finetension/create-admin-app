import { describe, expect, it } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";
import { createAccessAllowPolicy } from "./access.ts";

describe("Cloudflare Access policy", () => {
	it("uses the configured email list as the production authorization boundary", () => {
		const config = {
			access: {
				policyName: "Allow Management team",
				allowedEmails: ["founder@example.com", "teammate@example.com"],
			},
		} as DeploymentConfig;

		expect(createAccessAllowPolicy(config)).toEqual({
			name: "Allow Management team",
			decision: "allow",
			include: [
				{ email: { email: "founder@example.com" } },
				{ email: { email: "teammate@example.com" } },
			],
		});
	});
});
