import type {
	AccessMembers,
	ApiErrorBody,
	AuditLogPage,
	CurrentUser,
	UpdateAccessMemberInput,
} from "../../../shared/contracts";
import { accessBoundaryForPath } from "./accessBoundary";

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
	const boundary = accessBoundaryForPath(globalThis.location?.pathname ?? "/");
	let response: Response;
	try {
		response = await fetch(`/api${boundary}${path}`, {
			...init,
			headers,
			credentials: "same-origin",
			redirect: "manual",
		});
	} catch {
		throw new ApiError(
			0,
			"NETWORK_ERROR",
			"네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
		);
	}

	if (response.type === "opaqueredirect") {
		throw new ApiError(
			401,
			"ACCESS_SESSION_REQUIRED",
			"로그인 세션을 다시 확인해야 합니다.",
		);
	}

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
	accessMembers: {
		list: () => request<AccessMembers>("/members"),
		setRole: (email: string, input: UpdateAccessMemberInput) =>
			request<AccessMembers>(`/members/${encodeURIComponent(email)}`, {
				method: "PUT",
				body: JSON.stringify(input),
			}),
		remove: (email: string) =>
			request<AccessMembers>(`/members/${encodeURIComponent(email)}`, {
				method: "DELETE",
			}),
	},
	auditLogs: {
		list: (cursor?: string) =>
			request<AuditLogPage>(
				`/audit-logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
			),
	},
};
