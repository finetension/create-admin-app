import { defineCommand } from "citty";
import { assertGitHubActionsCapability } from "../core/ci-guard.ts";
import {
	loadDeploymentContext,
	printDeploymentSummary,
} from "../deployment/context.ts";
import { deploy } from "../deployment/deploy.ts";

export default defineCommand({
	meta: {
		name: "deploy",
		description: "Cloudflare 관리 시스템을 재현 가능하게 배포합니다.",
	},
	args: {
		config: {
			type: "string",
			alias: "c",
			description: "배포 설정 파일",
			default: "./deploy.config.json",
			valueHint: "path",
		},
	},
	async run({ args }) {
		assertGitHubActionsCapability("deploy");
		assertGitHubActionsCapability("remote database mutation");
		const config = await loadDeploymentContext(args.config);
		printDeploymentSummary(config);
		await deploy(config);
	},
});
