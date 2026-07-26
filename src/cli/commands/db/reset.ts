import * as prompts from "@clack/prompts";
import { defineCommand } from "citty";
import { safetyError } from "../../core/error.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../../core/runtime.ts";
import { assertLocalDatabaseMutationAllowed } from "../../database/migrations.ts";
import { resetLocalDatabase } from "../../local/reset.ts";

export default defineCommand({
	meta: {
		name: "reset",
		description: "로컬 D1을 비우고 migration과 seed를 다시 적용합니다.",
	},
	args: {
		...commonOutputArgs,
		seed: {
			type: "boolean",
			description: "reset 후 seed를 적용합니다.",
			negativeDescription: "reset 후 seed를 적용하지 않습니다.",
			default: true,
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "확인 질문 없이 실행합니다.",
			default: false,
		},
	},
	async run({ args }) {
		await assertLocalDatabaseMutationAllowed();
		if (cliRuntime().machine && !args.yes) {
			throw safetyError(
				"approval_required",
				"비인터랙티브 local D1 reset에는 --yes가 필요합니다.",
				"데이터 삭제 계획을 확인한 뒤 --yes를 추가하세요.",
			);
		}
		if (!cliRuntime().machine && !args.yes) {
			const confirmed = await prompts.confirm({
				message: "로컬 D1의 모든 데이터를 삭제할까요?",
				initialValue: false,
			});
			if (prompts.isCancel(confirmed) || !confirmed) return;
		}
		await resetLocalDatabase({ seed: args.seed });
		if (cliRuntime().machine) {
			writeCliResult({ reset: true, seeded: args.seed, database: "local" });
		}
	},
});
