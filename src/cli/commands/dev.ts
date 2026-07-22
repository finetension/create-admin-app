import { defineCommand } from "citty";
import { parseDevelopmentDatabaseMode } from "../database/mode.ts";
import { startDevelopmentServer } from "../project/dev.ts";

export default defineCommand({
	meta: {
		name: "dev",
		description:
			"배포 상태에 맞는 D1으로 Vite와 Worker 개발 서버를 실행합니다.",
	},
	args: {
		config: {
			type: "string",
			alias: "c",
			description: "로컬에서 사용할 배포 설정 파일",
			valueHint: "path",
		},
		migrate: {
			type: "boolean",
			description: "서버 실행 전에 로컬 D1 migration을 적용합니다.",
			negativeDescription: "로컬 D1 migration을 건너뜁니다.",
			default: true,
		},
		seed: {
			type: "boolean",
			description: "서버 실행 전에 로컬 D1 seed를 적용합니다.",
			default: false,
		},
		host: {
			type: "string",
			description: "개발 서버가 수신할 host",
			valueHint: "host",
		},
		port: {
			type: "string",
			alias: "p",
			description: "개발 서버 port",
			valueHint: "port",
		},
		open: {
			type: "boolean",
			alias: "o",
			description: "시작할 때 브라우저를 엽니다.",
			default: false,
		},
		database: {
			type: "string",
			description: "D1 모드: auto, local, remote",
			default: "auto",
			valueHint: "mode",
		},
	},
	async run({ args }) {
		await startDevelopmentServer({
			config: args.config,
			migrate: args.migrate,
			seed: args.seed,
			host: args.host,
			port: args.port,
			open: args.open,
			database: parseDevelopmentDatabaseMode(args.database),
		});
	},
});
