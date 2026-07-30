import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { IdentityPanel } from "./AppShell";

describe("app shell identity panel", () => {
	it("shows the current user and an explicit Access logout action", () => {
		const markup = renderToStaticMarkup(
			createElement(
				MemoryRouter,
				{},
				createElement(IdentityPanel, {
					user: {
						id: "user-1",
						email: "owner@example.com",
						role: "owner",
					},
				}),
			),
		);

		expect(markup).toContain("owner@example.com");
		expect(markup).toContain("소유자");
		expect(markup).toContain("로그아웃");
	});
});
