import type { ApiErrorBody, CurrentUser } from "../../../shared/contracts";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const headers = new Headers(init?.headers);
	if (init?.body && !(init.body instanceof FormData))
		headers.set("content-type", "application/json");
	const response = await fetch(`/api${path}`, { ...init, headers });

	if (!response.ok) {
		const body = (await response.json().catch(() => ({
			error: { code: "UNKNOWN", message: "요청을 처리하지 못했습니다." },
		}))) as ApiErrorBody;
		throw new ApiError(
			response.status,
			body.error.code,
			body.error.message,
			body.error.details,
		);
	}
	if (response.status === 204) return undefined as T;
	const body = (await response.json()) as { data: T };
	return body.data;
}

export const api = {
	me: () => request<CurrentUser>("/me"),
};
