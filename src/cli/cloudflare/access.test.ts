import { describe, expect, it } from "vitest";
import { createAccessPolicy, inspectAccessPolicyBoundary } from "./access.ts";

describe("Cloudflare Access policies", () => {
	it("builds group-backed allow policies", () => {
		expect(
			createAccessPolicy("Allow admins", "allow", [
				"owner-group",
				"admin-group",
			]),
		).toEqual({
			name: "Allow admins",
			decision: "allow",
			include: [
				{ group: { id: "owner-group" } },
				{ group: { id: "admin-group" } },
			],
		});
	});

	it("builds narrowly scoped public bypass policies", () => {
		expect(createAccessPolicy("Bypass public", "bypass", [])).toEqual({
			name: "Bypass public",
			decision: "bypass",
			include: [{ everyone: {} }],
		});
	});

	it("accepts only one exact role-group allow policy", () => {
		const exactPolicy = {
			id: "policy-id",
			name: "Allow owners",
			decision: "allow",
			include: [{ group: { id: "owner-group" } }],
		};
		expect(
			inspectAccessPolicyBoundary([exactPolicy], exactPolicy.name, "allow", [
				"owner-group",
			]),
		).toBe(true);
		expect(
			inspectAccessPolicyBoundary(
				[
					exactPolicy,
					{
						id: "unexpected",
						name: "Allow outsider",
						decision: "allow",
						include: [{ everyone: {} }],
					},
				],
				exactPolicy.name,
				"allow",
				["owner-group"],
			),
		).toBe(false);
		expect(
			inspectAccessPolicyBoundary([exactPolicy], exactPolicy.name, "allow", [
				"admin-group",
			]),
		).toBe(false);
	});
});
