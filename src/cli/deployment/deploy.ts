import { rm } from "node:fs/promises";
import { ensureAccess } from "../cloudflare/access.ts";
import { ensureD1 } from "../cloudflare/resources.ts";
import { assertGitHubActionsCapability } from "../core/ci-guard.ts";
import type { DeploymentConfig } from "../core/config.ts";
import { logger } from "../core/logger.ts";
import { publishWorker } from "./publish.ts";
import { verifyDeployment } from "./verify.ts";
import { writeDeploymentWranglerConfig } from "./wrangler-config.ts";

export async function deploy(config: DeploymentConfig): Promise<void> {
	assertGitHubActionsCapability("deploy");
	assertGitHubActionsCapability("remote database mutation");
	const access = await ensureAccess(config);

	logger.start("계정 리소스를 이름 기준으로 조회합니다");
	const d1 = await ensureD1(config);
	const generatedConfigPath = await writeDeploymentWranglerConfig(
		config,
		access,
		d1,
	);
	logger.info(`CI 임시 Wrangler config: ${generatedConfigPath}`);

	try {
		await publishWorker(config, generatedConfigPath);
		await verifyDeployment(config);
		logger.success(
			`재현 가능한 배포가 완료됐습니다: https://${config.hostname}`,
		);
	} finally {
		await rm(generatedConfigPath, { force: true });
	}
}
