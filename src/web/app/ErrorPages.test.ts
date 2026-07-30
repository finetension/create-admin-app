import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ApiError } from "../shared/api";
import { AccessDeniedPage, NotFoundPage, SessionErrorPage } from "./ErrorPages";

describe("application error pages", () => {
	it("offers home and account switching when the account is not assigned", () => {
		const html = renderToStaticMarkup(
			createElement(MemoryRouter, null, createElement(AccessDeniedPage)),
		);

		expect(html).toContain("이 계정에는 접근 권한이 없습니다");
		expect(html).toContain("홈으로 이동");
		expect(html).toContain("로그아웃하고 다시 로그인");
	});

	it("offers home and account switching when a role path is forbidden", () => {
		const html = renderToStaticMarkup(
			createElement(
				MemoryRouter,
				null,
				createElement(SessionErrorPage, {
					error: new ApiError(403, "FORBIDDEN", "권한이 없습니다."),
					onRetry: () => undefined,
				}),
			),
		);

		expect(html).toContain("이 화면을 볼 권한이 없습니다");
		expect(html).toContain("홈으로 이동");
		expect(html).toContain("로그아웃하고 다시 로그인");
	});

	it("distinguishes an expired Access session from a network error", () => {
		const sessionHtml = renderToStaticMarkup(
			createElement(
				MemoryRouter,
				null,
				createElement(SessionErrorPage, {
					error: new ApiError(
						401,
						"ACCESS_SESSION_REQUIRED",
						"로그인이 필요합니다.",
					),
					onRetry: () => undefined,
				}),
			),
		);
		const networkHtml = renderToStaticMarkup(
			createElement(
				MemoryRouter,
				null,
				createElement(SessionErrorPage, {
					error: new ApiError(0, "NETWORK_ERROR", "연결할 수 없습니다."),
					onRetry: () => undefined,
				}),
			),
		);

		expect(sessionHtml).toContain("로그인이 다시 필요합니다");
		expect(sessionHtml).toContain("로그인 다시 하기");
		expect(networkHtml).toContain("서버에 연결할 수 없습니다");
		expect(networkHtml).toContain("다시 시도");
	});

	it("renders an explicit not-found destination", () => {
		const html = renderToStaticMarkup(
			createElement(
				MemoryRouter,
				null,
				createElement(NotFoundPage, { homePath: "/admin" }),
			),
		);

		expect(html).toContain("페이지를 찾을 수 없습니다");
		expect(html).toContain("홈으로 이동");
	});
});
