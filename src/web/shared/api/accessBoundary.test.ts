import { describe, expect, it } from "vitest";
import {
	accessBoundaryForPath,
	pathWithAccessBoundary,
	pathWithoutAccessBoundary,
} from "./accessBoundary";

describe("web Access path boundary", () => {
	it.each([
		["/", ""],
		["/team", ""],
		["/admin", "/admin"],
		["/admin/menu", "/admin"],
		["/owner", "/owner"],
		["/owner/team", "/owner"],
	] as const)("resolves %s to %s", (pathname, boundary) => {
		expect(accessBoundaryForPath(pathname)).toBe(boundary);
	});

	it("moves a page between role boundaries without nesting prefixes", () => {
		expect(pathWithoutAccessBoundary("/owner/team")).toBe("/team");
		expect(pathWithAccessBoundary("/admin", "/owner/menu")).toBe("/admin/menu");
		expect(pathWithAccessBoundary("/owner", "/admin")).toBe("/owner");
		expect(pathWithAccessBoundary("", "/admin/menu")).toBe("/menu");
	});
});
