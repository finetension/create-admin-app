import { existsSync } from "node:fs";
import { mkdir, open, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { z } from "zod";
import { resolveAccountId } from "../cloudflare/account.ts";
import {
	loadUserConfig,
	resolveLocalConfigPath,
	type UserConfig,
} from "../core/config.ts";
import { extractJson } from "../core/json.ts";
import { logger } from "../core/logger.ts";
import { projectPaths, resolveProjectPath } from "../core/paths.ts";
import {
	type CommandResult,
	type RunOptions,
	runWrangler,
} from "../core/process.ts";
import { sortTablesForDrop } from "./schema.ts";

const schemaObjectsResult = z.array(
	z.object({
		results: z.array(
			z.object({
				name: z.string(),
				type: z.enum(["table", "view"]),
			}),
		),
		success: z.boolean(),
	}),
);

const relationshipsResult = z.array(
	z.object({
		results: z.array(
			z.object({
				child: z.string(),
				parent: z.string(),
			}),
		),
		success: z.boolean(),
	}),
);

const d1ListResult = z.array(
	z.object({
		name: z.string(),
	}),
);

const schemaObjectsQuery =
	"SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 4) != '_cf_'";
const relationshipsQuery =
	"SELECT m.name AS child, fk.[table] AS parent FROM sqlite_schema AS m JOIN pragma_foreign_key_list(m.name) AS fk WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND substr(m.name, 1, 4) != '_cf_'";

export interface DatabaseTarget {
	remote: boolean;
	serviceName: string;
	database: string;
	accountId?: string;
	wranglerConfig?: string;
}

interface TargetOptions {
	remote?: boolean;
	configPath?: string;
}

export interface ExportDatabaseOptions extends TargetOptions {
	output?: string;
	force?: boolean;
	ifExists?: boolean;
	tables?: string[];
	schemaOnly?: boolean;
	dataOnly?: boolean;
}

export interface ExportDatabaseResult {
	outputPath: string;
	skipped: boolean;
	target: DatabaseTarget;
}

export interface ImportDatabaseOptions extends TargetOptions {
	file: string;
	confirm?: string;
	backup?: boolean;
	backupOutput?: string;
}

export interface ImportDatabaseResult {
	backupPath?: string;
	target: DatabaseTarget;
}

export interface TransferDependencies {
	exists(path: string): boolean;
	loadConfig(path: string): Promise<UserConfig>;
	resolveAccountId(): Promise<string>;
	mkdir(path: string): Promise<void>;
	unlink(path: string): Promise<void>;
	statSize(path: string): Promise<number>;
	readPrefix(path: string, maxBytes: number): Promise<string>;
	writeFile(path: string, contents: string): Promise<void>;
	run(args: string[], options?: RunOptions): Promise<CommandResult>;
	now(): Date;
}

const defaultDependencies: TransferDependencies = {
	exists: existsSync,
	loadConfig: loadUserConfig,
	resolveAccountId,
	async mkdir(path) {
		await mkdir(path, { recursive: true });
	},
	async unlink(path) {
		await unlink(path);
	},
	async statSize(path) {
		return (await stat(path)).size;
	},
	async readPrefix(path, maxBytes) {
		const handle = await open(path, "r");
		try {
			const buffer = Buffer.alloc(maxBytes);
			const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
			return buffer.subarray(0, bytesRead).toString("utf8");
		} finally {
			await handle.close();
		}
	},
	async writeFile(path, contents) {
		await writeFile(path, contents);
	},
	run: runWrangler,
	now: () => new Date(),
};

function targetModeArgs(target: DatabaseTarget): string[] {
	return target.remote
		? ["--remote"]
		: [
				"--local",
				"--config",
				target.wranglerConfig ?? projectPaths.wranglerConfig,
			];
}

function runTarget(
	target: DatabaseTarget,
	args: string[],
	dependencies: TransferDependencies,
	options: RunOptions = {},
): Promise<CommandResult> {
	return dependencies.run([...args, ...targetModeArgs(target)], {
		...options,
		accountId: target.accountId,
	});
}

async function resolveDatabaseTarget(
	options: TargetOptions,
	dependencies: TransferDependencies,
): Promise<DatabaseTarget> {
	const remote = options.remote ?? false;
	const configPath = options.configPath
		? resolveProjectPath(options.configPath)
		: remote
			? projectPaths.deployConfig
			: resolveLocalConfigPath();
	const [config, accountId] = await Promise.all([
		dependencies.loadConfig(configPath),
		remote ? dependencies.resolveAccountId() : Promise.resolve(undefined),
	]);
	return {
		remote,
		serviceName: config.serviceName,
		database: remote ? `${config.serviceName}-db` : "APP_DB",
		accountId,
		wranglerConfig: remote ? undefined : projectPaths.wranglerConfig,
	};
}

function timestamp(date: Date): string {
	return date.toISOString().replaceAll(/[-:.]/g, "");
}

export function createDefaultBackupPath(
	target: Pick<DatabaseTarget, "serviceName" | "remote">,
	date: Date,
	purpose = "backup",
): string {
	const mode = target.remote ? "remote" : "local";
	return resolve(
		projectPaths.root,
		"backups",
		`${target.serviceName}-${mode}-${purpose}-${timestamp(date)}.sql`,
	);
}

export function parseTableList(value?: string): string[] {
	return value
		? [
				...new Set(
					value
						.split(",")
						.map((table) => table.trim())
						.filter(Boolean),
				),
			]
		: [];
}

export function buildExportArgs(
	target: DatabaseTarget,
	outputPath: string,
	options: Pick<ExportDatabaseOptions, "tables" | "schemaOnly" | "dataOnly">,
): string[] {
	if (options.schemaOnly && options.dataOnly) {
		throw new Error("--schema-only과 --data-only은 함께 사용할 수 없습니다.");
	}
	const args = [
		"d1",
		"export",
		target.database,
		...targetModeArgs(target),
		"--output",
		outputPath,
		"--skip-confirmation",
	];
	for (const table of options.tables ?? []) args.push("--table", table);
	if (options.schemaOnly) args.push("--no-data");
	if (options.dataOnly) args.push("--no-schema");
	return args;
}

async function prepareOutput(
	outputPath: string,
	force: boolean,
	dependencies: TransferDependencies,
): Promise<void> {
	await dependencies.mkdir(dirname(outputPath));
	if (!dependencies.exists(outputPath)) return;
	if (!force) {
		throw new Error(
			`백업 파일이 이미 존재합니다: ${outputPath}\n덮어쓰려면 --force를 사용하세요.`,
		);
	}
	await dependencies.unlink(outputPath);
}

async function exportTarget(
	target: DatabaseTarget,
	outputPath: string,
	options: Pick<ExportDatabaseOptions, "tables" | "schemaOnly" | "dataOnly">,
	force: boolean,
	dependencies: TransferDependencies,
): Promise<void> {
	const args = buildExportArgs(target, outputPath, options);
	await prepareOutput(outputPath, force, dependencies);
	await dependencies.run(args, {
		accountId: target.accountId,
	});
}

async function remoteDatabaseExists(
	target: DatabaseTarget,
	dependencies: TransferDependencies,
): Promise<boolean> {
	const result = await dependencies.run(["d1", "list", "--json"], {
		accountId: target.accountId,
		capture: true,
	});
	return d1ListResult
		.parse(extractJson(result.stdout, "D1 목록"))
		.some((database) => database.name === target.database);
}

export async function exportDatabase(
	options: ExportDatabaseOptions = {},
	overrides: Partial<TransferDependencies> = {},
): Promise<ExportDatabaseResult> {
	const dependencies = { ...defaultDependencies, ...overrides };
	const target = await resolveDatabaseTarget(options, dependencies);
	const outputPath = options.output
		? resolveProjectPath(options.output)
		: createDefaultBackupPath(target, dependencies.now());
	if (options.ifExists) {
		if (!target.remote) {
			throw new Error("--if-exists는 운영 D1 export에만 사용할 수 있습니다.");
		}
		if (!(await remoteDatabaseExists(target, dependencies))) {
			logger.info(`운영 D1이 아직 없어 백업을 건너뜁니다: ${target.database}`);
			return { outputPath, skipped: true, target };
		}
	}
	logger.start(
		`${target.remote ? "운영" : "로컬"} D1을 내보냅니다: ${target.database}`,
	);
	await exportTarget(
		target,
		outputPath,
		options,
		options.force ?? false,
		dependencies,
	);
	logger.success(`D1 백업을 생성했습니다: ${outputPath}`);
	return { outputPath, skipped: false, target };
}

function quoteIdentifier(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

async function clearDatabase(
	target: DatabaseTarget,
	dependencies: TransferDependencies,
): Promise<void> {
	const objectsQuery = await runTarget(
		target,
		[
			"d1",
			"execute",
			target.database,
			"--command",
			schemaObjectsQuery,
			"--json",
		],
		dependencies,
		{ capture: true },
	);
	const objects = schemaObjectsResult
		.parse(extractJson(objectsQuery.stdout, "D1 schema 객체 목록"))
		.flatMap((batch) => batch.results);
	if (objects.length === 0) return;

	const tables = objects
		.filter((object) => object.type === "table")
		.map((object) => object.name);
	const relationships =
		tables.length === 0
			? []
			: relationshipsResult
					.parse(
						extractJson(
							(
								await runTarget(
									target,
									[
										"d1",
										"execute",
										target.database,
										"--command",
										relationshipsQuery,
										"--json",
									],
									dependencies,
									{ capture: true },
								)
							).stdout,
							"D1 foreign key 목록",
						),
					)
					.flatMap((batch) => batch.results);
	const sql = [
		...objects
			.filter((object) => object.type === "view")
			.map((view) => `DROP VIEW IF EXISTS ${quoteIdentifier(view.name)};`),
		...sortTablesForDrop(tables, relationships).map(
			(table) => `DROP TABLE IF EXISTS ${quoteIdentifier(table)};`,
		),
		"",
	].join("\n");
	const resetPath = resolve(projectPaths.runtimeDirectory, "import-reset.sql");
	await dependencies.mkdir(dirname(resetPath));
	await dependencies.writeFile(resetPath, sql);
	try {
		await runTarget(
			target,
			["d1", "execute", target.database, "--file", resetPath, "--yes"],
			dependencies,
		);
	} finally {
		await dependencies.unlink(resetPath);
	}
}

async function validateImportFile(
	filePath: string,
	dependencies: TransferDependencies,
): Promise<void> {
	if (extname(filePath).toLowerCase() !== ".sql") {
		throw new Error("D1 import 파일은 .sql 확장자여야 합니다.");
	}
	let size: number;
	try {
		size = await dependencies.statSize(filePath);
	} catch {
		throw new Error(`D1 import 파일을 찾을 수 없습니다: ${filePath}`);
	}
	if (size === 0) throw new Error("빈 SQL 파일은 import할 수 없습니다.");
	const prefix = await dependencies.readPrefix(filePath, 1024 * 1024);
	if (!/CREATE\s+TABLE/i.test(prefix)) {
		throw new Error(
			"교체 복원에는 schema가 포함된 D1 export SQL이 필요합니다. data-only 파일은 사용할 수 없습니다.",
		);
	}
}

export async function importDatabase(
	options: ImportDatabaseOptions,
	overrides: Partial<TransferDependencies> = {},
): Promise<ImportDatabaseResult> {
	const dependencies = { ...defaultDependencies, ...overrides };
	const target = await resolveDatabaseTarget(options, dependencies);
	if (target.remote && options.confirm !== target.serviceName) {
		throw new Error(
			`운영 D1 복원을 확인하려면 --confirm ${target.serviceName}를 정확히 입력하세요.`,
		);
	}
	const filePath = resolveProjectPath(options.file);
	await validateImportFile(filePath, dependencies);

	let backupPath: string | undefined;
	if (options.backup ?? true) {
		backupPath = options.backupOutput
			? resolveProjectPath(options.backupOutput)
			: createDefaultBackupPath(target, dependencies.now(), "pre-import");
		if (backupPath === filePath) {
			throw new Error("import 파일과 사전 백업 파일 경로는 달라야 합니다.");
		}
		logger.start(`현재 D1을 안전 백업합니다: ${target.database}`);
		await exportTarget(target, backupPath, {}, false, dependencies);
		logger.success(`사전 백업을 생성했습니다: ${backupPath}`);
	}

	logger.start(
		`${target.remote ? "운영" : "로컬"} D1 기존 schema를 제거합니다`,
	);
	await clearDatabase(target, dependencies);
	logger.start(`D1 백업을 복원합니다: ${filePath}`);
	await runTarget(
		target,
		["d1", "execute", target.database, "--file", filePath, "--yes"],
		dependencies,
	);
	logger.success(`${target.remote ? "운영" : "로컬"} D1 복원을 완료했습니다`);
	return { backupPath, target };
}
