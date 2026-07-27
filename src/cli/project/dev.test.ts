import { describe, expect, it, vi } from "vitest";
import {
	createViteDevArgs,
	parseDevelopmentAccessRole,
	parsePort,
	startDevelopmentServer,
} from "./dev.ts";

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

	it("validates explicit local roles", () => {
		expect(parseDevelopmentAccessRole("owner")).toBe("owner");
		expect(parseDevelopmentAccessRole("public")).toBe("public");
		expect(() => parseDevelopmentAccessRole("manager")).toThrow(
			"지원하지 않는 개발 역할",
		);
	});
});

describe("development database lifecycle", () => {
	it("does not open a browser in machine mode", async () => {
		await expect(
			startDevelopmentServer(
				{ open: true },
				{
					machine: () => true,
				},
			),
		).rejects.toMatchObject({
			code: "interactive_browser_required",
			exitCode: 2,
		});
	});

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

	it("passes the selected role to local Vite", async () => {
		const run = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
		await startDevelopmentServer(
			{ migrate: false, database: "local", role: "admin" },
			{
				run,
				resolveMode: async () => ({ mode: "local", reason: "explicit" }),
			},
		);
		expect(run).toHaveBeenCalledWith(
			["exec", "vite"],
			expect.objectContaining({
				env: expect.objectContaining({ PLATFORM_ACCESS_ROLE: "admin" }),
			}),
		);
	});

	it("rejects role simulation with remote D1", async () => {
		await expect(
			startDevelopmentServer(
				{ database: "remote", role: "user" },
				{
					machine: () => false,
					resolveMode: async () => ({ mode: "remote", reason: "explicit" }),
				},
			),
		).rejects.toMatchObject({
			code: "development_role_requires_local_database",
		});
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
				machine: () => false,
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
					machine: () => false,
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
