import { describe, expect, it } from "vitest";
import { sortTablesForDrop } from "./reset.ts";

describe("sortTablesForDrop", () => {
	it("places child tables before their parents", () => {
		const order = sortTablesForDrop(
			["users", "categories", "content", "content_revisions", "settings"],
			[
				{ child: "content", parent: "users" },
				{ child: "content", parent: "categories" },
				{ child: "content_revisions", parent: "content" },
				{ child: "settings", parent: "users" },
			],
		);

		expect(order.indexOf("content_revisions")).toBeLessThan(
			order.indexOf("content"),
		);
		expect(order.indexOf("content")).toBeLessThan(order.indexOf("users"));
		expect(order.indexOf("content")).toBeLessThan(order.indexOf("categories"));
		expect(order.indexOf("settings")).toBeLessThan(order.indexOf("users"));
	});

	it("rejects circular foreign keys before dropping data", () => {
		expect(() =>
			sortTablesForDrop(
				["first", "second"],
				[
					{ child: "first", parent: "second" },
					{ child: "second", parent: "first" },
				],
			),
		).toThrow("순환 foreign key");
	});

	it("allows a table with a self-referencing foreign key", () => {
		expect(
			sortTablesForDrop(
				["categories"],
				[{ child: "categories", parent: "categories" }],
			),
		).toEqual(["categories"]);
	});
});
