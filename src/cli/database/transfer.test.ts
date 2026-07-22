import { describe, expect, it, vi } from "vitest";
import type { DatabaseTarget, TransferDependencies } from "./transfer.ts";
import {
	buildExportArgs,
	createDefaultBackupPath,
	exportDatabase,
	importDatabase,
	parseTableList,
} from "./transfer.ts";

const accountId = "a".repeat(32);

function result(stdout = "", stderr = "", exitCode = 0) {
	return { stdout, stderr, exitCode };
}

function createDependencies(): Partial<TransferDependencies> & {
	run: ReturnType<typeof vi.fn>;
	unlink: ReturnType<typeof vi.fn>;
	writeFile: ReturnType<typeof vi.fn>;
} {
	const run = vi.fn(async (args: string[]) => {
		const command = args[args.indexOf("--command") + 1];
		if (command?.includes("type IN ('table', 'view')")) {
			return result(
				JSON.stringify([
					{
						success: true,
						results: [
							{ name: "users", type: "table" },
							{ name: "content", type: "table" },
						],
					},
				]),
			);
		}
		if (command?.includes("pragma_foreign_key_list")) {
			return result(
				JSON.stringify([
					{
						success: true,
						results: [{ child: "content", parent: "users" }],
					},
				]),
			);
		}
		return result();
	});
	return {
		exists: vi.fn(() => false),
		loadConfig: vi.fn(async () => ({
			domain: "example.com",
			name: "Operations Hub",
			allowedEmails: ["admin@example.com"],
			serviceName: "operations-hub",
			routing: "custom-domain" as const,
			hostname: "operations-hub.example.com",
		})),
		resolveAccountId: vi.fn(async () => accountId),
		mkdir: vi.fn(async () => {}),
		unlink: vi.fn(async () => {}),
		statSize: vi.fn(async () => 1024),
		readPrefix: vi.fn(
			async () =>
				"PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE users (id TEXT PRIMARY KEY);",
		),
		writeFile: vi.fn(async () => {}),
		run,
		now: vi.fn(() => new Date("2026-07-17T02:45:00.123Z")),
	};
}

describe("database export", () => {
	it("builds local Wrangler arguments with repeatable table filters", () => {
		const target: DatabaseTarget = {
			remote: false,
			serviceName: "operations-hub",
			database: "APP_DB",
			wranglerConfig: "/repo/wrangler.jsonc",
		};
		expect(
			buildExportArgs(target, "/repo/backup.sql", {
				tables: ["content", "categories"],
				schemaOnly: true,
			}),
		).toEqual([
			"d1",
			"export",
			"APP_DB",
			"--local",
			"--config",
			"/repo/wrangler.jsonc",
			"--output",
			"/repo/backup.sql",
			"--skip-confirmation",
			"--table",
			"content",
			"--table",
			"categories",
			"--no-data",
		]);
	});

	it("creates a deterministic default backup path", () => {
		const output = createDefaultBackupPath(
			{ serviceName: "operations-hub", remote: true },
			new Date("2026-07-17T02:45:00.123Z"),
		);
		expect(output).toMatch(
			/backups\/operations-hub-remote-backup-20260717T024500123Z\.sql$/,
		);
	});

	it("exports through the remote database name derived from config", async () => {
		const dependencies = createDependencies();
		const exported = await exportDatabase(
			{ remote: true, output: "backups/manual.sql" },
			dependencies,
		);
		expect(exported.target.database).toBe("operations-hub-db");
		expect(dependencies.run).toHaveBeenCalledWith(
			expect.arrayContaining(["d1", "export", "operations-hub-db", "--remote"]),
			{ accountId },
		);
		expect(exported.skipped).toBe(false);
	});

	it("skips only a missing remote database when requested", async () => {
		const dependencies = createDependencies();
		dependencies.run.mockResolvedValueOnce(result("[]"));
		const exported = await exportDatabase(
			{ remote: true, ifExists: true },
			dependencies,
		);
		expect(exported.skipped).toBe(true);
		expect(dependencies.run).toHaveBeenCalledTimes(1);
		expect(dependencies.run).toHaveBeenCalledWith(["d1", "list", "--json"], {
			accountId,
			capture: true,
		});
	});

	it("does not hide remote database inspection failures", async () => {
		const dependencies = createDependencies();
		dependencies.run.mockRejectedValueOnce(new Error("D1 list forbidden"));
		await expect(
			exportDatabase({ remote: true, ifExists: true }, dependencies),
		).rejects.toThrow("D1 list forbidden");
	});

	it("normalizes a comma-separated table list", () => {
		expect(parseTableList(" content, categories,content ")).toEqual([
			"content",
			"categories",
		]);
	});
});

describe("database import", () => {
	it("requires an exact service name before remote operations", async () => {
		const dependencies = createDependencies();
		await expect(
			importDatabase(
				{ file: "backup.sql", remote: true, confirm: "wrong" },
				dependencies,
			),
		).rejects.toThrow("정확히 입력");
		expect(dependencies.run).not.toHaveBeenCalled();
	});

	it("backs up, clears child tables first, and restores in order", async () => {
		const dependencies = createDependencies();
		const imported = await importDatabase(
			{
				file: "backup.sql",
				remote: true,
				confirm: "operations-hub",
			},
			dependencies,
		);
		const calls = dependencies.run.mock.calls.map(
			(call: unknown[]) => call[0] as string[],
		);
		expect(calls[0]).toContain("export");
		expect(calls[1]?.join(" ")).toContain(
			"SELECT name, type FROM sqlite_schema",
		);
		expect(calls[2]?.join(" ")).toContain(
			"SELECT m.name AS child, fk.[table] AS parent FROM sqlite_schema AS m JOIN pragma_foreign_key_list(m.name) AS fk WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND substr(m.name, 1, 4) != '_cf_'",
		);
		expect(calls[3]?.join(" ")).toContain("import-reset.sql");
		expect(calls[4]?.join(" ")).toContain("backup.sql");
		expect(dependencies.writeFile).toHaveBeenCalledWith(
			expect.stringContaining("import-reset.sql"),
			expect.stringMatching(
				/DROP TABLE IF EXISTS "content";\nDROP TABLE IF EXISTS "users";/,
			),
		);
		expect(dependencies.unlink).toHaveBeenCalledWith(
			expect.stringContaining("import-reset.sql"),
		);
		expect(imported.backupPath).toContain("pre-import");
	});

	it("rejects data-only SQL before creating a safety backup", async () => {
		const dependencies = createDependencies();
		dependencies.readPrefix = vi.fn(
			async () =>
				"PRAGMA defer_foreign_keys=TRUE;\nINSERT INTO users VALUES ('1');",
		);
		await expect(
			importDatabase(
				{
					file: "data-only.sql",
					remote: true,
					confirm: "operations-hub",
				},
				dependencies,
			),
		).rejects.toThrow("schema가 포함된");
		expect(dependencies.run).not.toHaveBeenCalled();
	});
});
