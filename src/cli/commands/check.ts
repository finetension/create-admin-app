import { defineCommand } from "citty";
import {
	loadDeploymentContext,
	printDeploymentSummary,
} from "../deployment/context.ts";

export default defineCommand({
	meta: {
		name: "check",
		description: "설정과 Cloudflare 계정 선택을 검증합니다.",
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
		const config = await loadDeploymentContext(args.config);
		printDeploymentSummary(config);
	},
});
