import { resolveAccountId } from "../cloudflare/account.ts";
import { resolveWorkersDevSubdomain } from "../cloudflare/workers.ts";
import {
	createDeploymentConfig,
	type DeploymentConfig,
	loadUserConfig,
	readCompatibilityDate,
} from "../core/config.ts";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { logger } from "../core/logger.ts";
import { resolveProjectPath } from "../core/paths.ts";

export async function loadDeploymentContext(
	configPath: string,
): Promise<DeploymentConfig> {
	const resolvedConfigPath = resolveProjectPath(configPath);
	const [userConfig, accountId, compatibilityDate] = await Promise.all([
		loadUserConfig(resolvedConfigPath),
		resolveAccountId(),
		readCompatibilityDate(),
	]);
	let workersDevSubdomain: string | undefined;
	if (userConfig.routing === "workers-dev") {
		const token = resolveCloudflareApiToken();
		if (!token) {
			throw new Error(
				"workers.dev 주소를 확인하려면 CLOUDFLARE_API_TOKEN이 필요합니다.",
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
			`Access:  ${config.allowedEmails.join(", ")}`,
		].join("\n"),
	});
}
