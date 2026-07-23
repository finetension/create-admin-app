import { afterEach, describe, expect, it, vi } from "vitest";
import {
	listCloudflareAccounts,
	listCloudflareZones,
	verifyCloudflareToken,
} from "./api.js";

function stubCloudflareResponse(payload: unknown, status = 200) {
	const fetchMock = vi.fn(
		async () =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Cloudflare API", () => {
	it("verifies a token through the authenticated API", async () => {
		const fetchMock = stubCloudflareResponse({
			success: true,
			result: { status: "active" },
		});

		await expect(
			verifyCloudflareToken("secret-token"),
		).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledOnce();
		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(new Headers(init?.headers).get("authorization")).toBe(
			"Bearer secret-token",
		);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://api.cloudflare.com/client/v4/user/tokens/verify",
		);
	});

	it("verifies an account-owned token through its account API", async () => {
		const fetchMock = stubCloudflareResponse({
			success: true,
			result: { status: "active" },
		});

		await expect(
			verifyCloudflareToken("cfat_secret-token", "account-id"),
		).resolves.toBeUndefined();
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://api.cloudflare.com/client/v4/accounts/account-id/tokens/verify",
		);
	});

	it("requires an account ID for an account-owned token", async () => {
		await expect(verifyCloudflareToken("cfat_secret-token")).rejects.toThrow(
			"계정 ID가 필요합니다",
		);
	});

	it("falls back to account verification for a legacy unprefixed token", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						success: false,
						result: null,
						errors: [{ message: "Invalid API Token" }],
					}),
					{
						status: 403,
						headers: { "content-type": "application/json" },
					},
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						success: true,
						result: { status: "active" },
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			verifyCloudflareToken("legacy-token", "account-id"),
		).resolves.toBeUndefined();
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://api.cloudflare.com/client/v4/user/tokens/verify",
			"https://api.cloudflare.com/client/v4/accounts/account-id/tokens/verify",
		]);
	});

	it("validates account results at runtime", async () => {
		stubCloudflareResponse({
			success: true,
			result: [{ id: "account-id", name: "Fine Tension" }],
		});
		await expect(listCloudflareAccounts("token")).resolves.toEqual([
			{ id: "account-id", name: "Fine Tension" },
		]);

		stubCloudflareResponse({
			success: true,
			result: [{ id: "", name: "Invalid" }],
		});
		await expect(listCloudflareAccounts("token")).rejects.toThrow();
	});

	it("returns only active zones", async () => {
		stubCloudflareResponse({
			success: true,
			result: [
				{ id: "active-id", name: "example.com", status: "active" },
				{ id: "pending-id", name: "pending.com", status: "pending" },
			],
		});

		await expect(listCloudflareZones("token", "account-id")).resolves.toEqual([
			{ id: "active-id", name: "example.com", status: "active" },
		]);
	});

	it("surfaces Cloudflare envelope errors", async () => {
		stubCloudflareResponse(
			{
				success: false,
				result: null,
				errors: [{ message: "invalid token" }],
			},
			403,
		);

		await expect(verifyCloudflareToken("bad-token")).rejects.toThrow(
			"invalid token",
		);
	});

	it("rejects unsuccessful HTTP responses even with a successful envelope", async () => {
		stubCloudflareResponse(
			{
				success: true,
				result: { status: "active" },
			},
			503,
		);

		await expect(verifyCloudflareToken("token")).rejects.toThrow("HTTP 503");
	});
});
