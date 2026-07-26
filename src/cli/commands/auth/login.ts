import * as prompts from "@clack/prompts";
import { defineCommand } from "citty";
import {
	loadAuthContext,
	promptForToken,
	verifyTokenAndAccount,
} from "../../auth/cloudflare.ts";
import { writeUserDefaults } from "../../core/config.ts";
import { storeCloudflareCredentials } from "../../core/credentials.ts";
import { configurationError } from "../../core/error.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../../core/runtime.ts";

export default defineCommand({
	meta: {
		name: "login",
		description:
			"Cloudflare token을 검증하고 OS credential store에 교체 저장합니다.",
	},
	args: {
		...commonOutputArgs,
		"cloudflare-account-id": {
			type: "string",
			description: "저장할 Cloudflare account ID",
			valueHint: "account-id",
		},
	},
	async run({ args }) {
		const context = await loadAuthContext(args["cloudflare-account-id"]);
		const environmentToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
		if (!environmentToken && cliRuntime().machine) {
			throw configurationError(
				"missing_cloudflare_token",
				"machine auth login에는 CLOUDFLARE_API_TOKEN이 필요합니다.",
				"token을 process environment로만 전달하고 같은 명령을 다시 실행하세요.",
			);
		}
		const token = environmentToken ?? (await promptForToken());
		const account = await verifyTokenAndAccount(
			token,
			context.preferredAccountId,
		);
		storeCloudflareCredentials(account.id, token);
		await writeUserDefaults({
			...context.defaults,
			cloudflare: { account_id: account.id },
		});
		const result = {
			authenticated: true,
			account: { id: account.id, name: account.name },
			stored: true,
			defaults_saved: true,
		};
		if (cliRuntime().machine) writeCliResult(result);
		else prompts.outro(`Cloudflare credential 저장 완료: ${account.name}`);
	},
});
