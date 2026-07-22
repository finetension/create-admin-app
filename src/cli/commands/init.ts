import { defineCommand } from "citty";
import { initializeProject } from "../project/init.ts";

export default defineCommand({
	meta: {
		name: "init",
		description: "플랫폼 배포 설정을 대화형 또는 옵션으로 생성합니다.",
	},
	args: {
		name: {
			type: "string",
			alias: "n",
			description: "사용자에게 표시할 서비스 이름",
			valueHint: "name",
		},
		domain: {
			type: "string",
			alias: "d",
			description: "서브도메인을 붙일 기본 도메인",
			valueHint: "domain",
		},
		subdomain: {
			type: "string",
			description: "서비스 이름 대신 사용할 커스텀 도메인 prefix",
			valueHint: "subdomain",
		},
		workersDev: {
			type: "boolean",
			description: "커스텀 도메인 없이 workers.dev에 배포",
			default: false,
		},
		emails: {
			type: "string",
			alias: "e",
			description: "쉼표로 구분한 접근 허용 이메일",
			valueHint: "email,...",
		},
		config: {
			type: "string",
			alias: "c",
			description: "생성할 배포 설정 파일",
			default: "./deploy.config.json",
			valueHint: "path",
		},
		force: {
			type: "boolean",
			alias: "f",
			description: "기존 설정 파일을 덮어씁니다.",
			default: false,
		},
	},
	async run({ args }) {
		await initializeProject({
			config: args.config,
			name: args.name,
			domain: args.domain,
			subdomain: args.subdomain,
			workersDev: args.workersDev,
			emails: args.emails,
			force: args.force,
		});
	},
});
