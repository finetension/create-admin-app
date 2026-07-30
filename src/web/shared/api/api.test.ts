import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiError, api } from "./api";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("web API Access boundary", () => {
	it("uses the current role path for every API request", async () => {
		const fetch = vi.fn(async () =>
			Response.json({
				data: {
					id: "admin-id",
					email: "admin@example.com",
					role: "admin",
				},
			}),
		);
		vi.stubGlobal("location", { pathname: "/admin" });
		vi.stubGlobal("fetch", fetch);

		await expect(api.me()).resolves.toMatchObject({ role: "admin" });
		expect(fetch).toHaveBeenCalledWith(
			"/api/admin/me",
			expect.objectContaining({
				credentials: "same-origin",
				redirect: "manual",
			}),
		);
	});

	it("classifies an Access login redirect as a session error", async () => {
		vi.stubGlobal("location", { pathname: "/owner/team" });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ type: "opaqueredirect" }) as Response),
		);

		await expect(api.me()).rejects.toMatchObject({
			status: 401,
			code: "ACCESS_SESSION_REQUIRED",
		});
	});

	it("classifies a failed fetch as a network error", async () => {
		vi.stubGlobal("location", { pathname: "/" });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);

		await expect(api.me()).rejects.toEqual(
			expect.objectContaining<Partial<ApiError>>({
				status: 0,
				code: "NETWORK_ERROR",
			}),
		);
	});

	it("requests the next Owner audit page with an encoded cursor", async () => {
		const fetch = vi.fn(async () =>
			Response.json({ data: { entries: [], nextCursor: null } }),
		);
		vi.stubGlobal("location", { pathname: "/owner/team" });
		vi.stubGlobal("fetch", fetch);

		await api.auditLogs.list("time/id");

		expect(fetch).toHaveBeenCalledWith(
			"/api/owner/audit-logs?cursor=time%2Fid",
			expect.any(Object),
		);
	});
});
