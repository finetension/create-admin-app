import { Entry } from "@napi-rs/keyring";
import { z } from "zod";

export const CLOUDFLARE_KEYRING_SERVICE =
	"finetension.create-admin-app.cloudflare";
const DEFAULT_CREDENTIAL_ACCOUNT = "default";

const storedCredentialsSchema = z.object({
	accountId: z.string().regex(/^[a-f0-9]{32}$/i),
	token: z.string().min(1),
});

export interface StoredCloudflareCredentials {
	accountId: string;
	token: string;
}

function readEntry(account: string): StoredCloudflareCredentials | undefined {
	try {
		const value = new Entry(CLOUDFLARE_KEYRING_SERVICE, account).getPassword();
		if (!value) return undefined;
		return storedCredentialsSchema.parse(JSON.parse(value));
	} catch {
		return undefined;
	}
}

export function storeCloudflareCredentials(
	accountId: string,
	token: string,
): void {
	const value = JSON.stringify(
		storedCredentialsSchema.parse({ accountId, token }),
	);
	new Entry(CLOUDFLARE_KEYRING_SERVICE, accountId).setPassword(value);
	new Entry(CLOUDFLARE_KEYRING_SERVICE, DEFAULT_CREDENTIAL_ACCOUNT).setPassword(
		value,
	);
}

export function deleteStoredCloudflareCredentials(accountId?: string): {
	accountId?: string;
	deleted: boolean;
} {
	const storedDefault = readEntry(DEFAULT_CREDENTIAL_ACCOUNT);
	const targetAccountId = accountId ?? storedDefault?.accountId;
	if (!targetAccountId) return { deleted: false };
	const storedAccount = readEntry(targetAccountId);
	const defaultMatches = storedDefault?.accountId === targetAccountId;
	if (!storedAccount && !defaultMatches) {
		return { accountId: targetAccountId, deleted: false };
	}
	try {
		const accountDeleted = storedAccount
			? new Entry(CLOUDFLARE_KEYRING_SERVICE, targetAccountId).deletePassword()
			: true;
		const defaultDeleted = defaultMatches
			? new Entry(
					CLOUDFLARE_KEYRING_SERVICE,
					DEFAULT_CREDENTIAL_ACCOUNT,
				).deletePassword()
			: true;
		return {
			accountId: targetAccountId,
			deleted: accountDeleted && defaultDeleted,
		};
	} catch {
		return { accountId: targetAccountId, deleted: false };
	}
}

export function readStoredCloudflareCredentials(
	accountId?: string,
): StoredCloudflareCredentials | undefined {
	return readEntry(accountId ?? DEFAULT_CREDENTIAL_ACCOUNT);
}

export function resolveCloudflareApiToken(
	accountIdOrEnvironment?: string | NodeJS.ProcessEnv,
	environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
	const accountId =
		typeof accountIdOrEnvironment === "string"
			? accountIdOrEnvironment
			: undefined;
	const resolvedEnvironment =
		typeof accountIdOrEnvironment === "object"
			? accountIdOrEnvironment
			: environment;
	return (
		resolvedEnvironment.CLOUDFLARE_API_TOKEN?.trim() ||
		readStoredCloudflareCredentials(accountId)?.token
	);
}

export function resolveStoredCloudflareAccountId(): string | undefined {
	return readStoredCloudflareCredentials()?.accountId;
}

export function resolveActionsCloudflareApiToken(
	environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
	return environment.CLOUDFLARE_API_TOKEN?.trim();
}
