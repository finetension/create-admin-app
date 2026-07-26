import { beforeEach, describe, expect, it, vi } from "vitest";

const passwords = vi.hoisted(() => new Map<string, string>());

vi.mock("@napi-rs/keyring", () => ({
	Entry: class {
		readonly key: string;

		constructor(service: string, account: string) {
			this.key = `${service}:${account}`;
		}

		getPassword() {
			return passwords.get(this.key) ?? null;
		}

		setPassword(value: string) {
			passwords.set(this.key, value);
		}

		deletePassword() {
			return passwords.delete(this.key);
		}
	},
}));

import {
	deleteStoredCloudflareCredentials,
	readStoredCloudflareCredentials,
	resolveCloudflareApiToken,
	storeCloudflareCredentials,
} from "./credentials.ts";

const accountId = "11111111111111111111111111111111";

describe("Cloudflare credentials", () => {
	beforeEach(() => {
		passwords.clear();
	});

	it("stores and removes both account and default credential entries", () => {
		storeCloudflareCredentials(accountId, "cfat_secret");

		expect(readStoredCloudflareCredentials(accountId)).toEqual({
			accountId,
			token: "cfat_secret",
		});
		expect(readStoredCloudflareCredentials()).toEqual({
			accountId,
			token: "cfat_secret",
		});
		expect(deleteStoredCloudflareCredentials(accountId)).toEqual({
			accountId,
			deleted: true,
		});
		expect(readStoredCloudflareCredentials(accountId)).toBeUndefined();
		expect(readStoredCloudflareCredentials()).toBeUndefined();
	});

	it("reports a missing credential without pretending it was deleted", () => {
		expect(deleteStoredCloudflareCredentials(accountId)).toEqual({
			accountId,
			deleted: false,
		});
	});

	it("prefers a process token without persisting it", () => {
		storeCloudflareCredentials(accountId, "cfat_stored");

		expect(
			resolveCloudflareApiToken(accountId, {
				CLOUDFLARE_API_TOKEN: " cfat_process ",
			}),
		).toBe("cfat_process");
		expect(readStoredCloudflareCredentials(accountId)?.token).toBe(
			"cfat_stored",
		);
	});
});
