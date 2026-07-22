import { Entry } from "@napi-rs/keyring";

export const CLOUDFLARE_KEYRING_SERVICE =
	"finetension.create-admin-app.cloudflare";

export function storeCloudflareCredentials(
	projectPath: string,
	accountId: string,
	token: string,
): void {
	const entry = new Entry(CLOUDFLARE_KEYRING_SERVICE, projectPath);
	entry.setPassword(JSON.stringify({ accountId, token }));
}
