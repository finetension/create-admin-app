import { z } from "zod";
import { CloudflareApi } from "./api.ts";

const workersSubdomainSchema = z.object({
	subdomain: z
		.string()
		.trim()
		.regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i),
});

export async function resolveWorkersDevSubdomain(
	accountId: string,
	token: string,
): Promise<string> {
	const api = new CloudflareApi(accountId, token);
	const result = await api.request("/workers/subdomain", {
		schema: workersSubdomainSchema,
	});
	return result.subdomain.toLowerCase();
}
