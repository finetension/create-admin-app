import { defineCommand } from "citty";
import { logger } from "../../core/logger.ts";
import { resetLocalDatabase } from "../../local/reset.ts";

export default defineCommand({
	meta: {
		name: "reset",
		description: "로컬 D1을 비우고 migration과 seed를 다시 적용합니다.",
	},
	args: {
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
		if (!args.yes) {
			const confirmed = await logger.prompt(
				"로컬 D1의 모든 데이터를 삭제할까요?",
				{
					type: "confirm",
					initial: false,
					cancel: "reject",
				},
			);
			if (!confirmed) {
				logger.info("D1 reset을 취소했습니다");
				return;
			}
		}
		await resetLocalDatabase({ seed: args.seed });
	},
});
