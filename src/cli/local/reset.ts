import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { extractJson } from "../core/json.ts";
import { logger } from "../core/logger.ts";
import { projectPaths } from "../core/paths.ts";
import { runWrangler } from "../core/process.ts";
import { migrateDatabase } from "../database/migrations.ts";
import { sortTablesForDrop } from "../database/schema.ts";
import { seedLocalDatabase } from "./seed.ts";

export { sortTablesForDrop } from "../database/schema.ts";

interface ResetLocalDatabaseOptions {
	seed?: boolean;
}

const queryResultSchema = z.array(
	z.object({
		results: z.array(z.object({ name: z.string() })),
		success: z.boolean(),
	}),
);

const relationshipResultSchema = z.array(
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

async function clearLocalDatabase(): Promise<void> {
	const result = await runWrangler(
		[
			"d1",
			"execute",
			"APP_DB",
			"--local",
			"--command",
			"SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 4) != '_cf_'",
			"--json",
		],
		{ capture: true },
	);
	const tables = queryResultSchema
		.parse(extractJson(result.stdout, "로컬 D1 테이블 목록"))
		.flatMap((batch) => batch.results.map((row) => row.name));
	if (tables.length === 0) return;
	const relationshipResult = await runWrangler(
		[
			"d1",
			"execute",
			"APP_DB",
			"--local",
			"--command",
			"SELECT m.name AS child, fk.[table] AS parent FROM sqlite_schema AS m JOIN pragma_foreign_key_list(m.name) AS fk WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND substr(m.name, 1, 4) != '_cf_'",
			"--json",
		],
		{ capture: true },
	);
	const relationships = relationshipResultSchema
		.parse(extractJson(relationshipResult.stdout, "로컬 D1 foreign key 목록"))
		.flatMap((batch) => batch.results);
	const orderedTables = sortTablesForDrop(tables, relationships);

	const sql = [
		...orderedTables.map(
			(table) => `DROP TABLE IF EXISTS "${table.replaceAll('"', '""')}";`,
		),
		"",
	].join("\n");
	const resetPath = resolve(projectPaths.localDirectory, "reset.sql");
	await mkdir(projectPaths.localDirectory, { recursive: true });
	await writeFile(resetPath, sql);
	await runWrangler([
		"d1",
		"execute",
		"APP_DB",
		"--local",
		"--file",
		resetPath,
	]);
}

export async function resetLocalDatabase(
	options: ResetLocalDatabaseOptions = {},
): Promise<void> {
	logger.start("로컬 D1 데이터를 초기화합니다");
	await clearLocalDatabase();
	logger.success("로컬 D1 데이터를 제거했습니다");

	await migrateDatabase();
	if (options.seed ?? true) {
		await seedLocalDatabase();
	}
	logger.success("로컬 D1 reset이 완료됐습니다");
}
