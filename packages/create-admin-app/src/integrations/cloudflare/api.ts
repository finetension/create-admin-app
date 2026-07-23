import { ofetch } from "ofetch";
import { z } from "zod";

const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";

const envelopeSchema = z.object({
	success: z.boolean(),
	result: z.unknown(),
	errors: z
		.array(
			z.object({
				message: z.string().optional(),
			}),
		)
		.optional(),
});

const tokenVerificationSchema = z.object({
	status: z.string(),
});

const accountSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
});

const zoneSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	status: z.enum(["initializing", "pending", "active", "moved"]),
});

export type CloudflareAccount = z.infer<typeof accountSchema>;
export type CloudflareZone = z.infer<typeof zoneSchema>;

async function request<T>(
	path: string,
	token: string,
	resultSchema: z.ZodType<T>,
): Promise<T> {
	const response = await ofetch.raw(`${cloudflareApiBaseUrl}${path}`, {
		headers: { Authorization: `Bearer ${token}` },
		ignoreResponseError: true,
		timeout: 30_000,
	});
	const payload = envelopeSchema.parse(response._data);

	if (!response.ok || !payload.success) {
		const message =
			payload.errors
				?.map((error) => error.message)
				.filter(Boolean)
				.join("; ") || `HTTP ${response.status}`;
		throw new Error(`Cloudflare API 요청 실패: ${message}`);
	}

	return resultSchema.parse(payload.result);
}

export async function verifyCloudflareToken(
	token: string,
	accountId?: string,
): Promise<void> {
	if (token.startsWith("cfat_") && !accountId) {
		throw new Error(
			"계정 소유 Cloudflare token 검증에는 계정 ID가 필요합니다.",
		);
	}
	const verifyUserToken = () =>
		request("/user/tokens/verify", token, tokenVerificationSchema);
	const verifyAccountToken = () =>
		request(
			`/accounts/${accountId}/tokens/verify`,
			token,
			tokenVerificationSchema,
		);

	if (token.startsWith("cfat_")) {
		await verifyAccountToken();
		return;
	}
	if (token.startsWith("cfut_") || !accountId) {
		await verifyUserToken();
		return;
	}

	try {
		await verifyUserToken();
	} catch (userTokenError) {
		try {
			await verifyAccountToken();
		} catch {
			throw userTokenError;
		}
	}
}

export async function listCloudflareAccounts(
	token: string,
): Promise<CloudflareAccount[]> {
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
