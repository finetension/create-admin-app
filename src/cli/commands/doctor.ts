import { defineCommand } from "citty";
import {
	doctorHasIssues,
	printDoctorReport,
	runDoctor,
} from "../project/doctor.ts";

export default defineCommand({
	meta: {
		name: "doctor",
		description: "로컬 도구와 Cloudflare 배포 환경을 읽기 전용으로 진단합니다.",
	},
	args: {
		config: {
			type: "string",
			alias: "c",
			description: "진단할 배포 설정 파일",
			default: "./deploy.config.json",
			valueHint: "path",
		},
		port: {
			type: "string",
			alias: "p",
			description: "충돌을 확인할 로컬 개발 port",
			default: "10050",
			valueHint: "port",
		},
		strict: {
			type: "boolean",
			description: "경고도 실패 종료 코드로 처리합니다.",
			default: false,
		},
	},
	async run({ args }) {
		const report = await runDoctor({
			configPath: args.config,
			port: args.port,
		});
		printDoctorReport(report);
		if (doctorHasIssues(report, args.strict)) process.exitCode = 1;
	},
});
