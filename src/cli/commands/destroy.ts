import { defineCommand } from "citty";
import { assertGitHubActionsCapability } from "../core/ci-guard.ts";
import { loadDeploymentContext } from "../deployment/context.ts";
import { destroyDeployment } from "../deployment/destroy.ts";

export default defineCommand({
	meta: {
		name: "destroy",
		description: "배포한 Cloudflare 리소스를 확인 후 안전하게 삭제합니다.",
	},
	args: {
		config: {
			type: "string",
			alias: "c",
			description: "배포 설정 파일",
			default: "./deploy.config.json",
			valueHint: "path",
		},
		confirm: {
			type: "string",
			description: "실제 삭제를 허용할 정규화된 서비스 이름",
			valueHint: "service-name",
		},
		"include-data": {
			type: "boolean",
			description: "D1 데이터베이스도 함께 삭제합니다.",
			default: false,
		},
		"skip-access": {
			type: "boolean",
			description:
				"Access 앱이 없거나 이미 삭제된 경우 Access 확인을 건너뜁니다.",
			default: false,
		},
	},
	async run({ args }) {
		assertGitHubActionsCapability("infrastructure destruction");
		const config = await loadDeploymentContext(args.config);
		await destroyDeployment(config, {
			confirm: args.confirm,
			includeData: args["include-data"],
			skipAccess: args["skip-access"],
		});
	},
});
