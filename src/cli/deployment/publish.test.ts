import { describe, expect, it, vi } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";

const { runPnpm, runWrangler, readJsonc, resolveToken } = vi.hoisted(() => ({
	runPnpm: vi.fn(async (_args: string[], _options?: unknown) => ({
		stdout: "",
		stderr: "",
		exitCode: 0,
	})),
	runWrangler: vi.fn(async (_args: string[], _options?: unknown) => ({
		stdout: "",
		stderr: "",
		exitCode: 0,
	})),
	readJsonc: vi.fn(async () => ({ configPath: "built/wrangler.json" })),
	resolveToken: vi.fn(() => "account-wide-token"),
}));

vi.mock("../core/process.ts", () => ({ runPnpm, runWrangler }));
vi.mock("../core/json.ts", () => ({ readJsonc }));
vi.mock("../core/credentials.ts", () => ({
	resolveActionsCloudflareApiToken: resolveToken,
}));

const { publishWorker } = await import("./publish.ts");

describe("Worker publication", () => {
	it("injects the existing repository token through stdin after deploy", async () => {
		await publishWorker(
			{
				accountId: "a".repeat(32),
				name: "Management",
				hostname: "management.example.com",
			} as DeploymentConfig,
			"/tmp/generated-wrangler.json",
		);

		expect(runWrangler).toHaveBeenCalledWith(
			expect.arrayContaining(["deploy", "--config"]),
			expect.objectContaining({ accountId: "a".repeat(32) }),
		);
		expect(runWrangler).toHaveBeenCalledWith(
			expect.arrayContaining([
				"secret",
				"put",
				"ACCESS_MANAGEMENT_TOKEN",
				"--config",
			]),
			expect.objectContaining({
				accountId: "a".repeat(32),
				input: "account-wide-token\n",
			}),
		);
		const serializedArgs = JSON.stringify(
			runWrangler.mock.calls.map(([args]) => args),
		);
		expect(serializedArgs).not.toContain("account-wide-token");
	});
});
