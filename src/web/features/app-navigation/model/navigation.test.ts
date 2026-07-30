import { describe, expect, it } from "vitest";
import {
	canRoleAccessPath,
	getMobilePrimaryItems,
	getNavigationSections,
	getRolePath,
	isNavigationItemActive,
} from "./navigation";

describe("application navigation", () => {
	it("maps the primary home into every role boundary", () => {
		expect(getMobilePrimaryItems("member").map((item) => item.to)).toEqual([
			"/",
		]);
		expect(getMobilePrimaryItems("admin").map((item) => item.to)).toEqual([
			"/admin",
		]);
		expect(getMobilePrimaryItems("owner").map((item) => item.to)).toEqual([
			"/owner",
		]);
	});

	it("exposes system management only inside the Owner boundary", () => {
		const ownerItems = getNavigationSections("owner").flatMap(
			(section) => section.items,
		);
		expect(ownerItems.find((item) => item.id === "team")).toMatchObject({
			to: "/owner/team",
		});
		expect(
			getNavigationSections("admin")
				.flatMap((section) => section.items)
				.some((item) => item.id === "team"),
		).toBe(false);
		expect(canRoleAccessPath("member", "/team")).toBe(false);
		expect(canRoleAccessPath("admin", "/admin/team")).toBe(false);
		expect(canRoleAccessPath("owner", "/owner/team")).toBe(true);
	});

	it("keeps the role home inactive on child pages", () => {
		const home = getMobilePrimaryItems("owner")[0];
		expect(home && isNavigationItemActive(home, "/owner")).toBe(true);
		expect(home && isNavigationItemActive(home, "/owner/team")).toBe(false);
	});

	it("maps an existing location into the assigned role boundary", () => {
		expect(getRolePath("member", "/owner/team")).toBe("/team");
		expect(getRolePath("admin", "/")).toBe("/admin");
		expect(getRolePath("owner", "/admin")).toBe("/owner");
	});
});
