import { realpathSync } from "node:fs";
import { Entry } from "@napi-rs/keyring";
import { z } from "zod";
import { projectRoot } from "./paths.ts";

const CLOUDFLARE_KEYRING_SERVICE = "finetension.create-admin-app.cloudflare";

const storedCredentialsSchema = z.object({
	accountId: z.string().regex(/^[a-f0-9]{32}$/i),
	token: z.string().min(1),
});

function credentialAccount(): string {
	try {
		return realpathSync.native(projectRoot);
	} catch {
		return projectRoot;
	}
}

export interface StoredCloudflareCredentials {
	accountId: string;
	token: string;
}

export function readStoredCloudflareCredentials():
	| StoredCloudflareCredentials
	| undefined {
	try {
		const value = new Entry(
			CLOUDFLARE_KEYRING_SERVICE,
			credentialAccount(),
		).getPassword();
		if (!value) return undefined;
		return storedCredentialsSchema.parse(JSON.parse(value));
	} catch {
		return undefined;
	}
}

export function resolveCloudflareApiToken(
	environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
	return (
		environment.CLOUDFLARE_API_TOKEN?.trim() ||
		readStoredCloudflareCredentials()?.token
	);
}

export function resolveStoredCloudflareAccountId(): string | undefined {
	return readStoredCloudflareCredentials()?.accountId;
}
