import { describe, expect, it } from "vitest";
import { initializeCliRuntime } from "../core/runtime.ts";
import { resolveAccount } from "./cloudflare.ts";

const firstAccount = {
	id: "11111111111111111111111111111111",
	name: "First account",
};
const secondAccount = {
	id: "22222222222222222222222222222222",
	name: "Second account",
};
const accounts = [firstAccount, secondAccount];

describe("Cloudflare auth account resolution", () => {
	it("uses the only available account without prompting", async () => {
		initializeCliRuntime(["--json"]);
		await expect(resolveAccount([firstAccount])).resolves.toEqual(firstAccount);
	});

	it("uses an explicit preferred account", async () => {
		initializeCliRuntime(["--json"]);
		await expect(resolveAccount(accounts, secondAccount.id)).resolves.toEqual(
			secondAccount,
		);
	});

	it("fails deterministically when the preferred account is unavailable", async () => {
		initializeCliRuntime(["--json"]);
		await expect(
			resolveAccount(accounts, "33333333333333333333333333333333"),
		).rejects.toMatchObject({
			code: "cloudflare_account_unavailable",
			exitCode: 3,
		});
	});
});
