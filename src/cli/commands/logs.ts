import { defineCommand } from "citty";
import { commonOutputArgs } from "../core/runtime.ts";
import { loadDeploymentContext } from "../deployment/context.ts";
import { tailWorkerLogs } from "../deployment/logs.ts";

export default defineCommand({
	meta: {
		name: "logs",
		description: "현재 터미널에서 Worker live log를 읽기 전용으로 조회합니다.",
	},
	args: {
		...commonOutputArgs,
		duration: {
			type: "string",
			description:
				"stream 유지 시간(초). machine mode 기본 30초, TTY 기본 무제한",
			valueHint: "seconds",
		},
		format: {
			type: "enum",
			options: ["pretty", "json"],
			description: "TTY Wrangler log 형식: pretty 또는 json",
			default: "pretty",
		},
		status: {
			type: "string",
			description: "쉼표로 구분한 상태 필터: ok,error,canceled",
		},
		header: { type: "string", description: "HTTP header 필터" },
		method: { type: "string", description: "쉼표로 구분한 HTTP method" },
		"sampling-rate": {
			type: "string",
			description: "0보다 크고 1 이하인 sampling 비율",
		},
		search: { type: "string", description: "console.log 검색어" },
		ip: { type: "string", description: "쉼표로 구분한 IP 또는 self" },
		"version-id": { type: "string", description: "Worker version ID" },
	},
	async run({ args }) {
		const config = await loadDeploymentContext();
		await tailWorkerLogs(config, {
			duration: args.duration,
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
