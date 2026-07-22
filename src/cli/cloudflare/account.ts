import { z } from "zod";
import { resolveStoredCloudflareAccountId } from "../core/credentials.ts";
import { extractJson } from "../core/json.ts";
import { runWrangler } from "../core/process.ts";

const identitySchema = z.object({
	loggedIn: z.boolean(),
	authType: z.string().optional(),
	tokenPermissions: z.array(z.string()).default([]),
	accounts: z.array(
		z.object({
			id: z.string().regex(/^[a-f0-9]{32}$/i),
		}),
	),
});

export type CloudflareIdentity = z.output<typeof identitySchema>;

export async function inspectCloudflareIdentity(): Promise<CloudflareIdentity> {
	const result = await runWrangler(["whoami", "--json"], { capture: true });
	return identitySchema.parse(
		extractJson(result.stdout, "Wrangler 로그인 정보"),
	);
}

export async function resolveAccountId(
	identity?: CloudflareIdentity,
	explicitAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),
): Promise<string> {
	explicitAccountId ||= resolveStoredCloudflareAccountId();
	if (explicitAccountId) {
		if (!/^[a-f0-9]{32}$/i.test(explicitAccountId)) {
			throw new Error(
				"CLOUDFLARE_ACCOUNT_ID는 32자리 Cloudflare 계정 ID여야 합니다.",
			);
		}
		return explicitAccountId;
	}

	const resolvedIdentity = identity ?? (await inspectCloudflareIdentity());
	if (!resolvedIdentity.loggedIn || resolvedIdentity.accounts.length === 0) {
		throw new Error(
			"Cloudflare 인증이 필요합니다. wrangler login 또는 API token을 설정하세요.",
		);
	}
	if (resolvedIdentity.accounts.length > 1) {
		throw new Error(
			"Cloudflare 계정이 여러 개입니다. CLOUDFLARE_ACCOUNT_ID로 배포 계정을 선택하세요.",
		);
	}
	const account = resolvedIdentity.accounts[0];
	if (!account) throw new Error("Cloudflare 계정 ID를 확인하지 못했습니다.");
	return account.id;
}
