import { defineCommand } from "citty";
import { assertGitHubActionsCapability } from "../../core/ci-guard.ts";
import { logger } from "../../core/logger.ts";
import { importDatabase } from "../../database/transfer.ts";

export default defineCommand({
	meta: {
		name: "import",
		description: "SQL 백업으로 로컬 또는 운영 D1을 교체 복원합니다.",
	},
	args: {
		file: {
			type: "positional",
			description: "복원할 D1 export SQL 파일",
			required: true,
			valueHint: "file",
		},
		remote: {
			type: "boolean",
			description: "운영 D1을 복원합니다.",
			default: false,
		},
		config: {
			type: "string",
			alias: "c",
			description: "서비스 이름과 운영 대상을 결정할 배포 설정 파일",
			valueHint: "path",
		},
		confirm: {
			type: "string",
			description: "운영 복원을 허용할 정규화된 서비스 이름",
			valueHint: "service-name",
		},
		backup: {
			type: "boolean",
			description: "복원 전에 현재 D1을 자동 백업합니다.",
			negativeDescription: "복원 전 자동 백업을 건너뜁니다.",
			default: true,
		},
		"backup-output": {
			type: "string",
			description: "복원 전 자동 백업 파일 경로",
			valueHint: "path",
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "로컬 복원 확인 질문을 건너뜁니다.",
			default: false,
		},
	},
	async run({ args }) {
		if (args.remote) {
			assertGitHubActionsCapability("remote database mutation");
		}
		if (!args.remote && !args.yes) {
			const confirmed = await logger.prompt(
				"로컬 D1을 SQL 백업 내용으로 교체할까요?",
				{
					type: "confirm",
					initial: false,
					cancel: "reject",
				},
			);
			if (!confirmed) {
				logger.info("D1 import를 취소했습니다");
				return;
			}
		}
		await importDatabase({
			file: args.file,
			remote: args.remote,
			configPath: args.config,
			confirm: args.confirm,
			backup: args.backup,
			backupOutput: args["backup-output"],
		});
	},
});
