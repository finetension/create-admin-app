import { defineCommand } from "citty";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { configurationError } from "../core/error.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../core/runtime.ts";
import { loadDeploymentContext } from "../deployment/context.ts";
import {
	deploymentStatusHasIssues,
	inspectDeploymentStatus,
	printDeploymentStatus,
} from "../deployment/status.ts";

export default defineCommand({
	meta: {
		name: "status",
		description:
			"Cloudflare Worker, D1, Access와 route drift를 변경 없이 조회합니다.",
	},
	args: {
		...commonOutputArgs,
		strict: {
			type: "boolean",
			description: "warning도 실패 종료로 처리합니다.",
			default: false,
		},
	},
	async run({ args }) {
		const config = await loadDeploymentContext();
		if (!resolveCloudflareApiToken(config.accountId)) {
			throw configurationError(
				"missing_cloudflare_token",
				"Cloudflare 상태 조회에 필요한 token이 없습니다.",
				"pnpm cli deploy --interactive로 token을 저장하세요.",
			);
		}
		const status = cliRuntime().machine
			? await inspectDeploymentStatus(config)
			: await printDeploymentStatus(config);
		if (cliRuntime().machine) {
			writeCliResult({
				project: config.slug,
				expected_url: `https://${config.hostname}`,
				status,
			});
		}
		if (deploymentStatusHasIssues(status, args.strict)) {
			process.exitCode = 3;
		}
	},
});
