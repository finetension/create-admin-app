import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listCloudflareAccounts: vi.fn(),
	listCloudflareZones: vi.fn(),
	spinnerStart: vi.fn(),
	spinnerStop: vi.fn(),
	verifyCloudflareToken: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
	spinner: () => ({
		start: mocks.spinnerStart,
		stop: mocks.spinnerStop,
	}),
}));

vi.mock("./api.js", () => ({
	listCloudflareAccounts: mocks.listCloudflareAccounts,
	listCloudflareZones: mocks.listCloudflareZones,
	verifyCloudflareToken: mocks.verifyCloudflareToken,
}));

import { resolveCloudflareSetup } from "./setup.js";

afterEach(() => {
	vi.clearAllMocks();
	delete process.env.CLOUDFLARE_API_TOKEN;
});

describe("Cloudflare setup", () => {
	it("resolves and verifies an account-owned token after account discovery", async () => {
		process.env.CLOUDFLARE_API_TOKEN = "cfat_secret-token";
		mocks.listCloudflareAccounts.mockResolvedValue([
			{ id: "account-id", name: "Fine Tension" },
		]);
		mocks.listCloudflareZones.mockResolvedValue([]);
		mocks.verifyCloudflareToken.mockResolvedValue(undefined);

		await expect(
			resolveCloudflareSetup({
				interactive: false,
				explicit: true,
				projectName: "admin",
			}),
		).resolves.toMatchObject({
			accountId: "account-id",
			accountName: "Fine Tension",
			token: "cfat_secret-token",
		});
		expect(mocks.verifyCloudflareToken).toHaveBeenCalledWith(
			"cfat_secret-token",
			"account-id",
		);
		expect(mocks.spinnerStop).toHaveBeenCalledWith(
			"Cloudflare token을 확인했습니다",
		);
	});

	it("stops the spinner when account discovery fails", async () => {
		process.env.CLOUDFLARE_API_TOKEN = "invalid-token";
		mocks.listCloudflareAccounts.mockRejectedValue(new Error("invalid token"));

		await expect(
			resolveCloudflareSetup({
				interactive: false,
				explicit: true,
				projectName: "admin",
			}),
		).rejects.toThrow("invalid token");
		expect(mocks.spinnerStop).toHaveBeenCalledWith(
			"Cloudflare token을 확인하지 못했습니다",
		);
	});
});
