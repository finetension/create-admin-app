interface CloudflareEnvelope<T> {
	success: boolean;
	result: T;
	errors?: Array<{ message?: string }>;
}

export interface CloudflareAccount {
	id: string;
	name: string;
}

export interface CloudflareZone {
	id: string;
	name: string;
	status: string;
}

async function request<T>(path: string, token: string): Promise<T> {
	const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const payload = (await response.json()) as CloudflareEnvelope<T>;
	if (!response.ok || !payload.success) {
		const message =
			payload.errors
				?.map((error) => error.message)
				.filter(Boolean)
				.join("; ") || `HTTP ${response.status}`;
		throw new Error(`Cloudflare API 요청 실패: ${message}`);
	}
	return payload.result;
}

export async function verifyCloudflareToken(token: string): Promise<void> {
	await request<{ status: string }>("/user/tokens/verify", token);
}

export async function listCloudflareAccounts(
	token: string,
): Promise<CloudflareAccount[]> {
	return request<CloudflareAccount[]>("/accounts?per_page=50", token);
}

export async function listCloudflareZones(
	token: string,
	accountId: string,
): Promise<CloudflareZone[]> {
	const query = new URLSearchParams({
		"account.id": accountId,
		per_page: "50",
	});
	const zones = await request<CloudflareZone[]>(`/zones?${query}`, token);
	return zones.filter((zone) => zone.status === "active");
}
