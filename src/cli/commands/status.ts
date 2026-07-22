import { defineCommand } from "citty";
import { loadDeploymentContext } from "../deployment/context.ts";
import { printDeploymentStatus } from "../deployment/status.ts";

export default defineCommand({
	meta: {
		name: "status",
		description:
			"Cloudflare 리소스와 Access 보호 상태를 읽기 전용으로 조회합니다.",
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
		await printDeploymentStatus(config);
	},
});
