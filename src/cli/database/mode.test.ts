import { describe, expect, it, vi } from "vitest";
import {
	type ModeDependencies,
	resolveDevelopmentDatabaseMode,
} from "./mode.ts";

function dependencies(overrides: Partial<ModeDependencies> = {}) {
	return {
		loadLifecycle: vi.fn(async () => ({
			schemaVersion: 1 as const,
			production: "predeploy" as const,
		})),
		...overrides,
	};
}

describe("development database mode", () => {
	it("honors an explicit recovery mode without inspecting Cloudflare", async () => {
		const deps = dependencies();
		await expect(
			resolveDevelopmentDatabaseMode("local", deps),
		).resolves.toEqual({ mode: "local", reason: "explicit" });
		expect(deps.loadLifecycle).not.toHaveBeenCalled();
	});

	it("uses remote D1 when the tracked lifecycle is deployed", async () => {
		const deps = dependencies({
			loadLifecycle: vi.fn(async () => ({
				schemaVersion: 1 as const,
				production: "deployed" as const,
			})),
		});
		await expect(resolveDevelopmentDatabaseMode("auto", deps)).resolves.toEqual(
			{ mode: "remote", reason: "lifecycle-deployed" },
		);
	});

	it("uses local D1 before the first successful deployment", async () => {
		const deps = dependencies();
		await expect(resolveDevelopmentDatabaseMode("auto", deps)).resolves.toEqual(
			{ mode: "local", reason: "pre-deploy" },
		);
	});
});
