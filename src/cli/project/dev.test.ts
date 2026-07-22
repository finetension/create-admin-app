import { describe, expect, it, vi } from "vitest";
import { createViteDevArgs, parsePort, startDevelopmentServer } from "./dev.ts";

describe("development command", () => {
	it("forwards supported Vite options", () => {
		expect(
			createViteDevArgs({
				host: "0.0.0.0",
				port: "4173",
				open: true,
			}),
		).toEqual([
			"exec",
			"vite",
			"--host",
			"0.0.0.0",
			"--port",
			"4173",
			"--open",
		]);
	});

	it("validates the port range", () => {
		expect(parsePort()).toBeUndefined();
		expect(parsePort("1")).toBe(1);
		expect(parsePort("65535")).toBe(65_535);
		expect(() => parsePort("0")).toThrow("1부터 65535");
		expect(() => parsePort("65536")).toThrow("1부터 65535");
		expect(() => parsePort("vite")).toThrow("1부터 65535");
	});
});

describe("development database lifecycle", () => {
	it("migrates local D1 before starting Vite", async () => {
		const migrate = vi.fn(async () => {});
		const run = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
		await startDevelopmentServer(
			{ migrate: true },
			{
				migrate,
				run,
				resolveMode: async () => ({ mode: "local", reason: "pre-deploy" }),
			},
		);
		expect(migrate).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledWith(
			["exec", "vite"],
			expect.objectContaining({
				env: expect.objectContaining({ PLATFORM_DATABASE_MODE: "local" }),
			}),
		);
	});

	it("removes local D1 and skips migration in remote mode", async () => {
		const migrate = vi.fn(async () => {});
		const removeLocalD1 = vi.fn(async () => true);
		const removeDevelopmentConfig = vi.fn(async () => {});
		const run = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
		await startDevelopmentServer(
			{},
			{
				migrate,
				removeLocalD1,
				removeDevelopmentConfig,
				run,
				loadDeployment: async () => ({ accountId: "a".repeat(32) }) as never,
				inspectRemoteD1: async () => ({
					name: "paper-cms-db",
					id: "database-id",
				}),
				resolveMode: async () => ({
					mode: "remote",
					reason: "lifecycle-deployed",
				}),
			},
		);
		expect(migrate).not.toHaveBeenCalled();
		expect(removeLocalD1).toHaveBeenCalledOnce();
		expect(removeDevelopmentConfig).toHaveBeenCalledTimes(2);
		expect(run).toHaveBeenCalledWith(
			["exec", "vite"],
			expect.objectContaining({
				env: expect.objectContaining({
					CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
					PLATFORM_DATABASE_ID: "database-id",
					PLATFORM_DATABASE_MODE: "remote",
				}),
			}),
		);
	});

	it("fails before deleting local data when the deployed D1 is missing", async () => {
		const removeLocalD1 = vi.fn(async () => true);
		const removeDevelopmentConfig = vi.fn(async () => {});
		const run = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));

		await expect(
			startDevelopmentServer(
				{},
				{
					removeLocalD1,
					removeDevelopmentConfig,
					run,
					loadDeployment: async () => ({ accountId: "a".repeat(32) }) as never,
					inspectRemoteD1: async () => null,
					resolveMode: async () => ({
						mode: "remote",
						reason: "lifecycle-deployed",
					}),
				},
			),
		).rejects.toThrow("원격 D1을 찾을 수 없습니다");
		expect(removeLocalD1).not.toHaveBeenCalled();
		expect(removeDevelopmentConfig).toHaveBeenCalledTimes(2);
		expect(run).not.toHaveBeenCalled();
	});
});
