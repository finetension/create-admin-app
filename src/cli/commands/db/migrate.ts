import { defineCommand } from "citty";
import { safetyError } from "../../core/error.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../../core/runtime.ts";
import { migrateDatabase } from "../../database/migrations.ts";

export default defineCommand({
	meta: {
		name: "migrate",
		description: "첫 배포 전 persistent local D1 migration을 적용합니다.",
	},
	args: {
		...commonOutputArgs,
		remote: {
			type: "boolean",
			description: "지원하지 않는 운영 D1 mutation 요청",
			default: false,
		},
	},
	async run({ args }) {
		if (args.remote) {
			throw safetyError(
				"remote_database_mutation_forbidden",
				"로컬 CLI에서 운영 D1 migration을 실행할 수 없습니다.",
				"운영 migration은 pnpm cli deploy의 protected Actions에서만 실행됩니다.",
			);
		}
		await migrateDatabase();
		if (cliRuntime().machine)
			writeCliResult({ migrated: true, database: "local" });
	},
});
