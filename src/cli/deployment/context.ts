import { resolveWorkersDevSubdomain } from "../cloudflare/workers.ts";
import {
	createDeploymentConfig,
	type DeploymentConfig,
	loadUserConfig,
	readCompatibilityDate,
} from "../core/config.ts";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { configurationError } from "../core/error.ts";
import { logger } from "../core/logger.ts";
import { projectPaths, resolveProjectPath } from "../core/paths.ts";

export async function loadDeploymentContext(
	configPath = projectPaths.config,
): Promise<DeploymentConfig> {
	const resolvedConfigPath = resolveProjectPath(configPath);
	const [userConfig, compatibilityDate] = await Promise.all([
		loadUserConfig(resolvedConfigPath),
		readCompatibilityDate(),
	]);
	const accountId = userConfig.cloudflare?.account_id;
	if (!accountId) {
		throw configurationError(
			"missing_cloudflare_config",
			"config.toml에 Cloudflare 연결 정보가 없습니다.",
			"pnpm cli deploy를 실행해 account와 route를 확정하세요.",
		);
	}
	let workersDevSubdomain: string | undefined;
	if (userConfig.routing === "workers-dev") {
		const token = resolveCloudflareApiToken(accountId);
		if (!token) {
			throw configurationError(
				"missing_cloudflare_token",
				"workers.dev 주소를 확인할 Cloudflare token이 없습니다.",
				"인터랙티브 deploy로 token을 저장하거나 CLOUDFLARE_API_TOKEN을 설정하세요.",
			);
		}
		workersDevSubdomain = await resolveWorkersDevSubdomain(accountId, token);
	}
	return createDeploymentConfig(
		userConfig,
		accountId,
		compatibilityDate,
		workersDevSubdomain,
	);
}

export function printDeploymentSummary(config: DeploymentConfig): void {
	logger.box({
		title: "Cloudflare deployment",
		message: [
			`Name:    ${config.name}`,
			`Worker:  ${config.workerName}`,
			`URL:     https://${config.hostname}`,
			`Owner:   ${config.bootstrapOwnerEmail}`,
		].join("\n"),
	});
}
