import { ofetch } from "ofetch";
import { z } from "zod";
import { CloudflareApiError } from "./api.ts";

const zoneSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.enum(["initializing", "pending", "active", "moved"]),
});

const zoneListSchema = z.object({
	success: z.boolean(),
	result: z.array(zoneSchema).optional(),
	errors: z
		.array(
			z.object({
				message: z.string().optional(),
			}),
		)
		.optional(),
});

export type ZoneResource = z.output<typeof zoneSchema>;

export async function inspectZone(
	domain: string,
	accountId: string,
	token: string,
): Promise<ZoneResource | null> {
	const payload = zoneListSchema.parse(
		await ofetch("https://api.cloudflare.com/client/v4/zones", {
			query: {
				name: domain,
				"account.id": accountId,
				per_page: 5,
			},
			headers: { Authorization: `Bearer ${token}` },
			ignoreResponseError: true,
			timeout: 30_000,
		}),
	);
	if (!payload.success) {
		const message =
			payload.errors
				?.map((error) => error.message)
				.filter(Boolean)
				.join("; ") || "알 수 없는 오류";
		throw new CloudflareApiError("/zones", message);
	}
	return payload.result?.find((zone) => zone.name === domain) ?? null;
}
