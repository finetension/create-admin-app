import { assertGitHubActionsCapability } from "../core/ci-guard.ts";
import { logger } from "../core/logger.ts";
import { projectPaths, resolveProjectPath } from "../core/paths.ts";
import { runWrangler } from "../core/process.ts";

interface MigrateDatabaseOptions {
	remote?: boolean;
	configPath?: string;
}

function resolveWranglerConfig(options: MigrateDatabaseOptions): string {
	if (options.configPath) return resolveProjectPath(options.configPath);
	if (options.remote) {
		throw new Error(
			"운영 migration에는 현재 CI 실행이 생성한 Wrangler --config 경로가 필요합니다.",
		);
	}
	return projectPaths.wranglerConfig;
}

export async function migrateDatabase(
	options: MigrateDatabaseOptions = {},
): Promise<void> {
	const remote = options.remote ?? false;
	if (remote) assertGitHubActionsCapability("remote database mutation");
	logger.start(`${remote ? "운영" : "로컬"} D1 migration을 적용합니다`);
	await runWrangler([
		"d1",
		"migrations",
		"apply",
		"APP_DB",
		remote ? "--remote" : "--local",
		"--config",
		resolveWranglerConfig(options),
	]);
	logger.success("D1 migration이 완료됐습니다");
}
