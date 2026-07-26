import * as prompts from "@clack/prompts";
import { defineCommand } from "citty";
import { answer, loadAuthContext } from "../../auth/cloudflare.ts";
import { writeUserDefaults } from "../../core/config.ts";
import { deleteStoredCloudflareCredentials } from "../../core/credentials.ts";
import {
	CliError,
	configurationError,
	externalError,
} from "../../core/error.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../../core/runtime.ts";

export default defineCommand({
	meta: {
		name: "logout",
		description: "Cloudflare credential을 OS credential store에서 삭제합니다.",
	},
	args: {
		...commonOutputArgs,
		"cloudflare-account-id": {
			type: "string",
			description: "삭제할 Cloudflare account ID",
			valueHint: "account-id",
		},
		"reset-defaults": {
			type: "boolean",
			description:
				"저장된 GitHub owner와 Cloudflare account 기본값도 제거합니다.",
			default: false,
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "credential 삭제를 승인합니다.",
			default: false,
		},
	},
	async run({ args }) {
		const context = await loadAuthContext(args["cloudflare-account-id"]);
		const accountId = context.preferredAccountId;
		if (!accountId) {
			throw configurationError(
				"cloudflare_auth_missing",
				"삭제할 Cloudflare credential을 찾지 못했습니다.",
				"--cloudflare-account-id를 지정하거나 먼저 auth status를 확인하세요.",
			);
		}
		if (!context.stored) {
			throw configurationError(
				"cloudflare_auth_missing",
				`${accountId}에 저장된 Cloudflare credential이 없습니다.`,
				"pnpm cli auth status로 현재 credential을 확인하세요.",
			);
		}
		if (cliRuntime().machine && !args.yes) {
			throw new CliError(
				"approval_required",
				"machine auth logout에는 --yes가 필요합니다.",
				`--yes --cloudflare-account-id ${accountId}`,
				"safety",
			);
		}
		if (
			!cliRuntime().machine &&
			!answer(
				await prompts.confirm({
					message: `${accountId} credential을 OS credential store에서 삭제할까요?`,
					initialValue: false,
				}),
			)
		) {
			return;
		}
		const deletion = deleteStoredCloudflareCredentials(accountId);
		if (!deletion.deleted) {
			throw externalError(
				"cloudflare_credential_delete_failed",
				"OS credential store에서 Cloudflare credential을 삭제하지 못했습니다.",
				"OS credential store 접근 권한을 확인한 뒤 auth logout을 다시 실행하세요.",
			);
		}
		const { cloudflare: _cloudflare, ...defaultsWithoutCloudflare } =
			context.defaults;
		const defaults = args["reset-defaults"]
			? {}
			: context.defaults.cloudflare?.account_id === accountId
				? defaultsWithoutCloudflare
				: context.defaults;
		await writeUserDefaults(defaults);
		const result = {
			authenticated: false,
			account_id: accountId,
			deleted: deletion.deleted,
			defaults_reset: args["reset-defaults"],
			note: "Cloudflare Dashboard token과 GitHub repository secret은 별도로 폐기하거나 교체하세요.",
		};
		if (cliRuntime().machine) writeCliResult(result);
		else prompts.outro("로컬 Cloudflare credential을 삭제했습니다.");
	},
});
