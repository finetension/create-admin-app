import * as prompts from "@clack/prompts";
import {
	accountTokenPage,
	type CloudflareAccount,
	listCloudflareAccounts,
	verifyCloudflareCapabilities,
} from "../cloudflare/discovery.ts";
import {
	loadOptionalUserDefaults,
	loadProjectConfig,
	type UserDefaults,
} from "../core/config.ts";
import {
	readStoredCloudflareCredentials,
	type StoredCloudflareCredentials,
} from "../core/credentials.ts";
import { configurationError, safetyError } from "../core/error.ts";
import { cliRuntime } from "../core/runtime.ts";

export interface AuthContext {
	defaults: UserDefaults;
	projectAccountId?: string;
	stored?: StoredCloudflareCredentials;
	preferredAccountId?: string;
}

export function answer<T>(value: T | symbol): T {
	if (prompts.isCancel(value)) {
		throw safetyError(
			"auth_cancelled",
			"Cloudflare 인증 작업을 취소했습니다.",
			"준비가 되면 같은 명령을 다시 실행하세요.",
		);
	}
	return value as T;
}

export async function loadAuthContext(
	explicitAccountId?: string,
): Promise<AuthContext> {
	const [project, defaults] = await Promise.all([
		loadProjectConfig(),
		loadOptionalUserDefaults(),
	]);
	const projectAccountId = project.cloudflare?.account_id;
	const stored = readStoredCloudflareCredentials(
		explicitAccountId ?? projectAccountId ?? defaults.cloudflare?.account_id,
	);
	return {
		defaults,
		...(projectAccountId ? { projectAccountId } : {}),
		...(stored ? { stored } : {}),
		preferredAccountId:
			explicitAccountId ??
			projectAccountId ??
			defaults.cloudflare?.account_id ??
			stored?.accountId,
	};
}

export async function resolveAccount(
	accounts: CloudflareAccount[],
	preferredAccountId?: string,
): Promise<CloudflareAccount> {
	const preferred = preferredAccountId
		? accounts.find((account) => account.id === preferredAccountId)
		: undefined;
	if (preferred) return preferred;
	if (preferredAccountId) {
		throw configurationError(
			"cloudflare_account_unavailable",
			`Cloudflare account ${preferredAccountId}를 token으로 조회할 수 없습니다.`,
			"account ID와 token scope를 확인하세요.",
		);
	}
	if (accounts.length === 1 && accounts[0]) return accounts[0];
	if (cliRuntime().machine) {
		throw configurationError(
			"missing_cloudflare_account",
			"Cloudflare account를 결정할 수 없습니다.",
			"--cloudflare-account-id 또는 CREATE_ADMIN_APP_CLOUDFLARE_ACCOUNT_ID를 설정하세요.",
		);
	}
	const selected = answer(
		await prompts.autocomplete({
			message: "Cloudflare account",
			options: accounts.map((account) => ({
				value: account.id,
				label: account.name,
				hint: account.id,
			})),
		}),
	);
	const account = accounts.find((item) => item.id === selected);
	if (!account) {
		throw configurationError(
			"cloudflare_account_unavailable",
			"선택한 Cloudflare account를 찾지 못했습니다.",
			"같은 명령을 다시 실행하세요.",
		);
	}
	return account;
}

export async function verifyTokenAndAccount(
	token: string,
	preferredAccountId?: string,
): Promise<CloudflareAccount> {
	const account = await resolveAccount(
		await listCloudflareAccounts(token),
		preferredAccountId,
	);
	await verifyCloudflareCapabilities(token, account.id);
	return account;
}

export async function promptForToken(): Promise<string> {
	const open = (await import("open")).default;
	await open(accountTokenPage);
	prompts.note(
		[
			"Create Token → Write all resources",
			"권한과 리소스 범위는 그대로 두고 만료일은 비워서 생성",
			"계정과 Zone의 모든 리소스를 변경할 수 있는 강한 권한입니다.",
		].join("\n"),
		"Cloudflare token",
	);
	return answer(
		await prompts.password({
			message: "Cloudflare `Write all resources` account token",
			validate: (value) => (value?.trim() ? undefined : "token을 입력하세요."),
		}),
	).trim();
}
