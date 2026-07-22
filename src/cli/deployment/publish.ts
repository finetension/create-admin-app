import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { DeploymentConfig } from "../core/config.ts";
import { readJsonc } from "../core/json.ts";
import { logger } from "../core/logger.ts";
import { projectPaths } from "../core/paths.ts";
import { runPnpm, runWrangler } from "../core/process.ts";

const buildRedirectSchema = z.object({
	configPath: z.string(),
});

export async function publishWorker(
	config: DeploymentConfig,
	generatedConfigPath: string,
): Promise<void> {
	logger.start("정적 검증과 테스트를 실행합니다");
	await runPnpm(["run", "check"], {
		accountId: config.accountId,
		env: { VITE_APP_NAME: config.name },
	});

	logger.start("운영 D1 migration을 적용합니다");
	await runWrangler(
		[
			"d1",
			"migrations",
			"apply",
			"APP_DB",
			"--remote",
			"--config",
			generatedConfigPath,
		],
		{ accountId: config.accountId },
	);

	logger.start("운영 설정으로 Worker 번들을 빌드합니다");
	await runPnpm(["run", "build"], {
		accountId: config.accountId,
		env: {
			WRANGLER_CONFIG_PATH: generatedConfigPath,
			VITE_APP_NAME: config.name,
		},
	});

	const redirectPath = resolve(
		projectPaths.localDirectory,
		"deploy/config.json",
	);
	const redirect = buildRedirectSchema.parse(await readJsonc(redirectPath));
	const builtConfigPath = resolve(dirname(redirectPath), redirect.configPath);

	logger.start(`Worker를 배포합니다: ${config.hostname}`);
	await runWrangler(["deploy", "--config", builtConfigPath], {
		accountId: config.accountId,
	});
}
