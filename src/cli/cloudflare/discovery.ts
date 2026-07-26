import { ofetch } from "ofetch";
import { z } from "zod";
import { configurationError, externalError } from "../core/error.ts";

const apiBase = "https://api.cloudflare.com/client/v4";
export const accountTokenPage =
	"https://dash.cloudflare.com/?to=/:account/api-tokens";

const envelopeSchema = z.object({
	success: z.boolean(),
	result: z.unknown(),
	errors: z.array(z.object({ message: z.string().optional() })).optional(),
});

const accountSchema = z.object({
	id: z.string().regex(/^[a-f0-9]{32}$/i),
	name: z.string().min(1),
});

const zoneSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	status: z.string(),
});

const organizationSchema = z.object({
	auth_domain: z.string().min(1),
});

const identityProviderSchema = z.object({
	type: z.string(),
});

export type CloudflareAccount = z.output<typeof accountSchema>;
export type CloudflareZone = z.output<typeof zoneSchema>;
export interface ZeroTrustInspection {
	exists: boolean;
	authDomain?: string;
	oneTimePin: boolean;
}

async function request<T>(
	path: string,
	token: string,
	schema: z.ZodType<T>,
): Promise<T> {
	const response = await ofetch.raw(`${apiBase}${path}`, {
		headers: { Authorization: `Bearer ${token}` },
		ignoreResponseError: true,
		retry: 0,
		timeout: 30_000,
	});
	const payload = envelopeSchema.safeParse(response._data);
	if (!payload.success || !response.ok || !payload.data.success) {
		const messages = payload.success
			? payload.data.errors
					?.map((item) => item.message)
					.filter(Boolean)
					.join("; ")
			: undefined;
		throw externalError(
			"cloudflare_api_failed",
			`Cloudflare API 요청이 실패했습니다: ${messages || `HTTP ${response.status}`}`,
			"token 권한과 선택한 account를 확인한 뒤 다시 실행하세요.",
		);
	}
	return schema.parse(payload.data.result);
}

export function assertAccountOwnedToken(token: string): void {
	if (!token.startsWith("cfat_")) {
		throw configurationError(
			"invalid_cloudflare_token_type",
			"Cloudflare Account API Token이 필요합니다.",
			"Dashboard의 Account API Tokens에서 `Write all resources` 템플릿으로 cfat_ token을 생성하세요.",
		);
	}
}

export async function listCloudflareAccounts(
	token: string,
): Promise<CloudflareAccount[]> {
	assertAccountOwnedToken(token);
	return request("/accounts?per_page=50", token, z.array(accountSchema));
}

export async function listCloudflareZones(
	token: string,
	accountId: string,
): Promise<CloudflareZone[]> {
	const query = new URLSearchParams({
		"account.id": accountId,
		per_page: "50",
	});
	const zones = await request(`/zones?${query}`, token, z.array(zoneSchema));
	return zones.filter((zone) => zone.status === "active");
}

export const cloudflareCapabilityProbes = [
	{
		name: "Workers Scripts",
		path: (accountId: string) => `/accounts/${accountId}/workers/scripts`,
	},
	{
		name: "D1",
		path: (accountId: string) =>
			`/accounts/${accountId}/d1/database?per_page=1`,
	},
	{
		name: "Workers KV",
		path: (accountId: string) =>
			`/accounts/${accountId}/storage/kv/namespaces?per_page=1`,
	},
] as const;

export async function verifyCloudflareCapabilities(
	token: string,
	accountId: string,
): Promise<void> {
	await request(
		`/accounts/${accountId}/tokens/verify`,
		token,
		z.object({ status: z.string() }),
	);
	const results = await Promise.allSettled(
		cloudflareCapabilityProbes.map((probe) =>
			request(probe.path(accountId), token, z.unknown()),
		),
	);
	const failures = results.flatMap((result, index) =>
		result.status === "rejected"
			? [cloudflareCapabilityProbes[index]?.name ?? "unknown"]
			: [],
	);
	if (failures.length > 0) {
		throw configurationError(
			"insufficient_cloudflare_token",
			`필수 Cloudflare 조회 권한을 확인하지 못했습니다: ${failures.join(", ")}`,
			"Account API Tokens에서 `Write all resources` 템플릿을 수정 없이 사용하세요.",
		);
	}
}

export async function inspectZeroTrustOrganization(
	token: string,
	accountId: string,
): Promise<ZeroTrustInspection> {
	try {
		const organization = await request(
			`/accounts/${accountId}/access/organizations`,
			token,
			organizationSchema,
		);
		const providers = await request(
			`/accounts/${accountId}/access/identity_providers?per_page=100`,
			token,
			z.array(identityProviderSchema),
		);
		return {
			exists: true,
			authDomain: organization.auth_domain,
			oneTimePin: providers.some((provider) => provider.type === "onetimepin"),
		};
	} catch (error) {
		if (
			error instanceof Error &&
			/Access is not enabled|HTTP 404|code.?1001/i.test(error.message)
		) {
			return { exists: false, oneTimePin: false };
		}
		throw error;
	}
}

export function zeroTrustOnboardingUrl(accountId: string): string {
	return `https://one.dash.cloudflare.com/${accountId}`;
}
