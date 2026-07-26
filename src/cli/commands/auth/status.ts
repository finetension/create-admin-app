import * as prompts from "@clack/prompts";
import { defineCommand } from "citty";
import {
	loadAuthContext,
	verifyTokenAndAccount,
} from "../../auth/cloudflare.ts";
import { configurationError } from "../../core/error.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../../core/runtime.ts";

export default defineCommand({
	meta: {
		name: "status",
		description:
			"저장된 Cloudflare credential 상태를 token 노출 없이 확인합니다.",
	},
	args: {
		...commonOutputArgs,
		"cloudflare-account-id": {
			type: "string",
			description: "확인할 Cloudflare account ID",
			valueHint: "account-id",
		},
	},
	async run({ args }) {
		const context = await loadAuthContext(args["cloudflare-account-id"]);
		if (!context.stored) {
			throw configurationError(
				"cloudflare_auth_missing",
				"저장된 Cloudflare credential이 없습니다.",
				"pnpm cli auth login을 실행하세요.",
			);
		}
		const account = await verifyTokenAndAccount(
			context.stored.token,
			context.preferredAccountId,
		);
		const result = {
			authenticated: true,
			account: { id: account.id, name: account.name },
			storage: "os-credential-store",
			defaults: context.defaults,
		};
		if (cliRuntime().machine) writeCliResult(result);
		else
			prompts.note(
				`Account: ${account.name} (${account.id})\nStorage: OS credential store`,
				"Cloudflare auth",
			);
	},
});
