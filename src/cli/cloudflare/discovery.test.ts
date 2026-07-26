import { describe, expect, it } from "vitest";
import { cloudflareCapabilityProbes } from "./discovery.ts";

describe("Cloudflare capability probes", () => {
	it("checks deploy capabilities without requiring token-management permission", () => {
		const paths = cloudflareCapabilityProbes.map((probe) =>
			probe.path("account-id"),
		);

		expect(paths).toEqual([
			"/accounts/account-id/workers/scripts",
			"/accounts/account-id/d1/database?per_page=1",
			"/accounts/account-id/storage/kv/namespaces?per_page=1",
		]);
		expect(paths).not.toContain("/accounts/account-id/tokens?per_page=1");
	});
});
