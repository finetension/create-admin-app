import { describe, expect, it } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";
import {
	createAccessAllowPolicy,
	inspectAccessPolicyBoundary,
} from "./access.ts";

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

	it("accepts only one exact email Allow policy", () => {
		const exactPolicy = {
			id: "policy-id",
			name: "Allow My Company team",
			decision: "allow",
			include: [{ email: { email: "founder@example.com" } }],
		};
		expect(
			inspectAccessPolicyBoundary([exactPolicy], exactPolicy.name, [
				"founder@example.com",
			]).exact,
		).toBe(true);
		expect(
			inspectAccessPolicyBoundary(
				[
					exactPolicy,
					{
						id: "unexpected",
						name: "Allow outsider",
						decision: "allow",
						include: [{ email: { email: "outsider@example.com" } }],
					},
				],
				exactPolicy.name,
				["founder@example.com"],
			).exact,
		).toBe(false);
		expect(
			inspectAccessPolicyBoundary([exactPolicy], exactPolicy.name, [
				"teammate@example.com",
			]).exact,
		).toBe(false);
	});
});
