import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadUserConfig, resolveLocalConfigPath } from "../core/config.ts";
import { logger } from "../core/logger.ts";
import { projectPaths, resolveProjectPath } from "../core/paths.ts";
import { runWrangler } from "../core/process.ts";

function sqlLiteral(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

export async function seedLocalDatabase(configPath?: string): Promise<void> {
	const resolvedConfigPath = resolveLocalConfigPath(configPath);
	const config = await loadUserConfig(resolvedConfigPath);
	const email = config.allowedEmails[0];
	if (!email) {
		throw new Error("allowedEmails에는 최소 한 명의 이메일이 필요합니다.");
	}

	const template = await readFile(resolveProjectPath("db/seed.sql"), "utf8");
	const generated = template.replaceAll(
		"__ALLOWED_EMAIL_SQL__",
		sqlLiteral(email),
	);
	const generatedPath = resolve(projectPaths.localDirectory, "seed.sql");
	await mkdir(projectPaths.localDirectory, { recursive: true });
	await writeFile(generatedPath, generated);

	logger.start(`로컬 D1을 시드합니다: ${email}`);
	await runWrangler([
		"d1",
		"execute",
		"APP_DB",
		"--local",
		"--file",
		generatedPath,
	]);
	logger.success("로컬 D1 시드가 완료됐습니다");
}
