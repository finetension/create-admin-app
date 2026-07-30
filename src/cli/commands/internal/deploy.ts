import { defineCommand } from "citty";
import { assertGitHubActionsCapability } from "../../core/ci-guard.ts";
import { configurationError } from "../../core/error.ts";
import { markProductionDeployed } from "../../core/lifecycle.ts";
import { commonOutputArgs, writeCliResult } from "../../core/runtime.ts";
import {
	loadDeploymentContext,
	printDeploymentSummary,
} from "../../deployment/context.ts";
import { deploy } from "../../deployment/deploy.ts";

export default defineCommand({
	meta: {
		name: "deploy",
		description: "Actions에서 D1 migration, Worker와 Access를 배포합니다.",
		hidden: true,
	},
	args: commonOutputArgs,
	async run() {
		assertGitHubActionsCapability("deploy");
		if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
			throw configurationError(
				"missing_cloudflare_token",
				"CLOUDFLARE_API_TOKEN repository secret이 없습니다.",
				"대상 GitHub repository의 Actions secret을 다시 설정하세요.",
			);
		}
		const config = await loadDeploymentContext();
		if (
			config.access.googleLogin &&
			(!process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
				!process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim())
		) {
			throw configurationError(
				"missing_google_oauth_credentials",
				"Google 로그인용 repository secret이 없습니다.",
				"대상 GitHub repository에 GOOGLE_OAUTH_CLIENT_ID와 GOOGLE_OAUTH_CLIENT_SECRET Actions secret을 설정하세요.",
			);
		}
		printDeploymentSummary(config);
		await deploy(config);
		const lifecycleChanged = await markProductionDeployed();
		writeCliResult({
			deployed: true,
			production_url: `https://${config.hostname}`,
			lifecycle_changed: lifecycleChanged,
		});
	},
});
