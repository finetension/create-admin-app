import { defineCommand } from "citty";
import { migrateDatabase } from "../../database/migrations.ts";

export default defineCommand({
	meta: {
		name: "migrate",
		description: "D1 migration을 적용합니다.",
	},
	args: {
		remote: {
			type: "boolean",
			description: "운영 D1에 적용합니다.",
			default: false,
		},
		config: {
			type: "string",
			alias: "c",
			description: "Wrangler 설정 파일",
			valueHint: "path",
		},
	},
	async run({ args }) {
		await migrateDatabase({
			remote: args.remote,
			configPath: args.config,
		});
	},
});
