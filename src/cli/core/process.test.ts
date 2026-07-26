import { describe, expect, it, vi } from "vitest";
import { resolveWranglerCredentials } from "./process.ts";

describe("Wrangler credential resolution", () => {
	it("does not read the OS credential store when Actions injects a token", () => {
		const readStored = vi.fn();
		expect(
			resolveWranglerCredentials(
				"a".repeat(32),
				{},
				{ CLOUDFLARE_API_TOKEN: "cfat_actions" },
				readStored,
			),
		).toEqual({
			accountId: "a".repeat(32),
			token: "cfat_actions",
		});
		expect(readStored).not.toHaveBeenCalled();
	});

	it("uses the account-scoped OS credential for local read-only commands", () => {
		const readStored = vi.fn(() => ({
			accountId: "a".repeat(32),
			token: "cfat_local",
		}));
		expect(
			resolveWranglerCredentials("a".repeat(32), {}, {}, readStored),
		).toEqual({
			accountId: "a".repeat(32),
			token: "cfat_local",
		});
		expect(readStored).toHaveBeenCalledWith("a".repeat(32));
	});
});
