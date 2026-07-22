import { ofetch } from "ofetch";
import { z } from "zod";

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

type CloudflareMethod = "GET" | "POST" | "PUT" | "DELETE";

interface CloudflareRequestOptions<T> {
	schema: z.ZodType<T>;
	method?: CloudflareMethod;
	body?: Record<string, unknown>;
}

export class CloudflareApiError extends Error {
	constructor(
		readonly path: string,
		message: string,
	) {
		super(`Cloudflare API ${path} 실패: ${message}`);
		this.name = "CloudflareApiError";
	}
}

export class CloudflareApi {
	readonly #accountId: string;
	readonly #token: string;

	constructor(accountId: string, token: string) {
		this.#accountId = accountId;
		this.#token = token;
	}

	async request<T>(
		path: string,
		options: CloudflareRequestOptions<T>,
	): Promise<T> {
		const payload = envelopeSchema.parse(
			await ofetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.#accountId}${path}`,
				{
					method: options.method ?? "GET",
					body: options.body,
					headers: { Authorization: `Bearer ${this.#token}` },
					ignoreResponseError: true,
					timeout: 30_000,
				},
			),
		);
		if (!payload.success) {
			const message =
				payload.errors
					?.map((error) => error.message)
					.filter(Boolean)
					.join("; ") || "알 수 없는 오류";
			throw new CloudflareApiError(path, message);
		}
		return options.schema.parse(payload.result);
	}
}
