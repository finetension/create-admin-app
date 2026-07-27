import { request as httpsRequest } from "node:https";
import { ofetch } from "ofetch";
import { inspectWorker } from "../cloudflare/resources.ts";
import type { DeploymentConfig } from "../core/config.ts";
import { logger } from "../core/logger.ts";

interface VerificationResponse {
	status: number;
	ok: boolean;
	headers: { get(name: string): string | null };
	data: unknown;
}

export interface VerificationResult {
	status: number;
	location: string;
}

export async function inspectDeploymentEndpoint(
	config: DeploymentConfig,
): Promise<VerificationResult> {
	const response = await requestPath(config.hostname, "/api/me");
	return {
		status: response.status,
		location: response.headers.get("location") ?? "",
	};
}

interface DnsAnswer {
	type: number;
	data: string;
}

interface DnsResponse {
	Answer?: DnsAnswer[];
}

async function resolvePublicIpv4(hostname: string): Promise<string | null> {
	try {
		const payload = await ofetch<DnsResponse>(
			"https://cloudflare-dns.com/dns-query",
			{
				query: { name: hostname, type: "A" },
				headers: { Accept: "application/dns-json" },
				retry: 0,
				timeout: 15_000,
			},
		);
		return payload.Answer?.find((answer) => answer.type === 1)?.data ?? null;
	} catch {
		return null;
	}
}

function requestViaIp(
	hostname: string,
	address: string,
	path: string,
): Promise<VerificationResponse> {
	return new Promise((resolveRequest, rejectRequest) => {
		const request = httpsRequest(
			{
				hostname: address,
				port: 443,
				path,
				method: "GET",
				servername: hostname,
				headers: { Host: hostname },
				timeout: 15_000,
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("end", () => {
					const body = Buffer.concat(chunks).toString("utf8");
					const status = response.statusCode ?? 0;
					resolveRequest({
						status,
						ok: status >= 200 && status < 300,
						data: (() => {
							try {
								return JSON.parse(body);
							} catch {
								return body;
							}
						})(),
						headers: {
							get(name) {
								const value = response.headers[name.toLowerCase()];
								return Array.isArray(value)
									? (value[0] ?? null)
									: (value ?? null);
							},
						},
					});
				});
			},
		);
		request.on("timeout", () =>
			request.destroy(new Error("HTTPS request timed out")),
		);
		request.on("error", rejectRequest);
		request.end();
	});
}

async function requestPath(
	hostname: string,
	path: string,
): Promise<VerificationResponse> {
	try {
		const response = await ofetch.raw(`https://${hostname}${path}`, {
			redirect: "manual",
			ignoreResponseError: true,
			retry: 0,
			timeout: 15_000,
		});
		return {
			status: response.status,
			ok: response.ok,
			headers: response.headers,
			data: response._data,
		};
	} catch (error) {
		const address = await resolvePublicIpv4(hostname);
		if (!address) throw error;
		return requestViaIp(hostname, address, path);
	}
}

export async function verifyDeployment(
	config: DeploymentConfig,
): Promise<VerificationResult> {
	logger.start("배포된 호스트의 Access 보호 상태를 확인합니다");
	const attempts = 12;
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const worker = await inspectWorker(config);
			if (!worker) {
				throw new Error(
					`Cloudflare API에서 active Worker deployment를 확인하지 못했습니다: ${config.workerName}`,
				);
			}
			const result = await inspectDeploymentEndpoint(config);
			const privateProtected = [301, 302, 303, 307, 308, 401, 403].includes(
				result.status,
			);
			const publicHealth = await requestPath(
				config.hostname,
				"/api/public/health",
			);
			const publicPayload = publicHealth.ok
				? (publicHealth.data as { status?: unknown })
				: undefined;
			if (privateProtected && publicPayload?.status === "ok") {
				logger.success(`Access gate verified: HTTP ${result.status}`);
				logger.success("Public health verified: HTTP 200");
				return result;
			}
			lastError = new Error(
				`배포 경계를 확인하지 못했습니다. private=${result.status}, public=${publicHealth.status}`,
			);
		} catch (error) {
			lastError = error;
		}

		if (attempt < attempts) {
			logger.info(`Custom Domain 전파 대기 중 (${attempt}/${attempts})`);
			await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
		}
	}

	throw new Error(
		`배포 검증이 제한 시간 안에 완료되지 않았습니다: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
	);
}
