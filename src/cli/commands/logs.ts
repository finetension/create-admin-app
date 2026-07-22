import { defineCommand } from "citty";
import { loadDeploymentContext } from "../deployment/context.ts";
import { tailWorkerLogs } from "../deployment/logs.ts";

export default defineCommand({
	meta: {
		name: "logs",
		description: "배포한 Worker의 실시간 로그를 조회합니다.",
	},
	args: {
		config: {
			type: "string",
			alias: "c",
			description: "배포 설정 파일",
			default: "./deploy.config.json",
			valueHint: "path",
		},
		format: {
			type: "string",
			description: "로그 형식: pretty 또는 json",
			default: "pretty",
		},
		status: {
			type: "string",
			description: "쉼표로 구분한 상태 필터: ok,error,canceled",
		},
		header: {
			type: "string",
			description: "HTTP header 필터",
		},
		method: {
			type: "string",
			description: "쉼표로 구분한 HTTP method 필터",
		},
		"sampling-rate": {
			type: "string",
			description: "0보다 크고 1 이하인 요청 sampling 비율. 1은 전체 요청",
		},
		search: {
			type: "string",
			description: "console.log 텍스트 검색어",
		},
		ip: {
			type: "string",
			description: "쉼표로 구분한 요청 IP 필터 또는 self",
		},
		"version-id": {
			type: "string",
			description: "Worker version ID 필터",
		},
	},
	async run({ args }) {
		const config = await loadDeploymentContext(args.config);
		await tailWorkerLogs(config, {
			format: args.format,
			status: args.status,
			header: args.header,
			method: args.method,
			samplingRate: args["sampling-rate"],
			search: args.search,
			ip: args.ip,
			versionId: args["version-id"],
		});
	},
});
