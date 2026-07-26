import { safetyError } from "../core/error.ts";
import { loadInfrastructureLifecycle } from "../core/lifecycle.ts";
import { logger } from "../core/logger.ts";
import { projectPaths } from "../core/paths.ts";
import { runWrangler } from "../core/process.ts";

type LifecycleLoader = typeof loadInfrastructureLifecycle;

export async function assertLocalDatabaseMutationAllowed(
	environment: NodeJS.ProcessEnv = process.env,
	loadLifecycle: LifecycleLoader = loadInfrastructureLifecycle,
): Promise<void> {
	if (
		environment.PLATFORM_EPHEMERAL_D1 === "1" ||
		environment.NODE_ENV === "test" ||
		environment.VITEST === "true"
	) {
		return;
	}
	const lifecycle = await loadLifecycle();
	if (lifecycle.production !== "predeploy") {
		throw safetyError(
			"local_database_disabled_after_deploy",
			"첫 배포 이후에는 production 철거 여부와 관계없이 persistent local D1 변경을 지원하지 않습니다.",
			"제품 기능으로 remote D1을 변경하거나 격리된 테스트 D1을 사용하세요.",
		);
	}
}

export async function migrateDatabase(): Promise<void> {
	await assertLocalDatabaseMutationAllowed();
	logger.start("로컬 D1 migration을 적용합니다");
	await runWrangler([
		"d1",
		"migrations",
		"apply",
		"APP_DB",
		"--local",
		"--config",
		projectPaths.wranglerConfig,
	]);
	logger.success("D1 migration이 완료됐습니다");
}
