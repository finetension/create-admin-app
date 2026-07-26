import { describe, expect, it, vi } from "vitest";
import { assertLocalDatabaseMutationAllowed } from "./migrations.ts";

describe("local D1 mutation guard", () => {
	it("rejects persistent local writes after deployment", async () => {
		await expect(
			assertLocalDatabaseMutationAllowed(
				{},
				vi.fn(async () => ({
					schemaVersion: 1 as const,
					production: "deployed" as const,
				})),
			),
		).rejects.toMatchObject({
			code: "local_database_disabled_after_deploy",
			exitCode: 5,
		});
	});

	it("allows predeploy and explicitly ephemeral test databases", async () => {
		await expect(
			assertLocalDatabaseMutationAllowed(
				{},
				vi.fn(async () => ({
					schemaVersion: 1 as const,
					production: "predeploy" as const,
				})),
			),
		).resolves.toBeUndefined();
		const loadLifecycle = vi.fn();
		await expect(
			assertLocalDatabaseMutationAllowed(
				{ PLATFORM_EPHEMERAL_D1: "1" },
				loadLifecycle,
			),
		).resolves.toBeUndefined();
		expect(loadLifecycle).not.toHaveBeenCalled();
	});

	it("does not recreate a persistent local database after production is destroyed", async () => {
		await expect(
			assertLocalDatabaseMutationAllowed(
				{},
				vi.fn(async () => ({
					schemaVersion: 1 as const,
					production: "destroyed" as const,
				})),
			),
		).rejects.toMatchObject({
			code: "local_database_disabled_after_deploy",
			exitCode: 5,
		});
	});
});
