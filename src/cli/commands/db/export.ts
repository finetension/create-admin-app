import { defineCommand } from "citty";
import { exportDatabase, parseTableList } from "../../database/transfer.ts";

export default defineCommand({
	meta: {
		name: "export",
		description: "로컬 또는 운영 D1을 SQL 파일로 내보냅니다.",
	},
	args: {
		remote: {
			type: "boolean",
			description: "운영 D1을 내보냅니다.",
			default: false,
		},
		output: {
			type: "string",
			alias: "o",
			description: "출력 SQL 경로. 생략하면 backups/에 자동 생성합니다.",
			valueHint: "path",
		},
		table: {
			type: "string",
			description: "쉼표로 구분한 내보낼 table 목록",
			valueHint: "table,...",
		},
		"schema-only": {
			type: "boolean",
			description: "데이터 없이 schema만 내보냅니다.",
			default: false,
		},
		"data-only": {
			type: "boolean",
			description: "schema 없이 데이터만 내보냅니다.",
			default: false,
		},
		config: {
			type: "string",
			alias: "c",
			description: "서비스 이름을 결정할 배포 설정 파일",
			valueHint: "path",
		},
		force: {
			type: "boolean",
			alias: "f",
			description: "기존 출력 파일을 덮어씁니다.",
			default: false,
		},
		"if-exists": {
			type: "boolean",
			description:
				"운영 D1이 아직 없으면 성공으로 처리합니다. 첫 자동 배포에 사용합니다.",
			default: false,
		},
	},
	async run({ args }) {
		await exportDatabase({
			remote: args.remote,
			output: args.output,
			tables: parseTableList(args.table),
			schemaOnly: args["schema-only"],
			dataOnly: args["data-only"],
			configPath: args.config,
			force: args.force,
			ifExists: args["if-exists"],
		});
	},
});
