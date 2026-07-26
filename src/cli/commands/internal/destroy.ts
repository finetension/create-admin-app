import { defineCommand } from "citty";
import { assertGitHubActionsCapability } from "../../core/ci-guard.ts";
import { configurationError } from "../../core/error.ts";
import { markProductionDestroyed } from "../../core/lifecycle.ts";
import { commonOutputArgs, writeCliResult } from "../../core/runtime.ts";
import { loadDeploymentContext } from "../../deployment/context.ts";
import { destroyDeployment } from "../../deployment/destroy.ts";

export default defineCommand({
	meta: {
		name: "destroy",
		description: "Actions에서 Worker, Access와 선택적으로 D1을 삭제합니다.",
		hidden: true,
	},
	args: {
		...commonOutputArgs,
		confirm: {
			type: "string",
			required: true,
			description: "config.toml project.slug와 정확히 같은 확인값",
		},
		"include-data": {
			type: "boolean",
			default: false,
			description: "D1까지 복구 보장 없이 삭제합니다.",
		},
	},
	async run({ args }) {
		assertGitHubActionsCapability("destroy");
		if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
			throw configurationError(
				"missing_cloudflare_token",
				"CLOUDFLARE_API_TOKEN repository secret이 없습니다.",
				"대상 GitHub repository의 Actions secret을 다시 설정하세요.",
			);
		}
		const config = await loadDeploymentContext();
		await destroyDeployment(config, {
			confirm: args.confirm,
			includeData: args["include-data"],
		});
		const lifecycleChanged = await markProductionDestroyed();
		writeCliResult({
			destroyed: true,
			data_preserved: !args["include-data"],
			lifecycle_changed: lifecycleChanged,
		});
	},
});
