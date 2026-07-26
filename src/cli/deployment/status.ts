import { type AccessInspection, inspectAccess } from "../cloudflare/access.ts";
import {
	type D1Resource,
	inspectD1,
	inspectWorker,
	type WorkerResource,
} from "../cloudflare/resources.ts";
import type { DeploymentConfig } from "../core/config.ts";
import {
	type InfrastructureLifecycle,
	loadInfrastructureLifecycle,
} from "../core/lifecycle.ts";
import { logger } from "../core/logger.ts";
import {
	inspectDeploymentEndpoint,
	type VerificationResult,
} from "./verify.ts";

export type DeploymentCheckStatus = "ok" | "warning" | "error";

export interface DeploymentStatusCheck {
	id: "worker" | "d1" | "access" | "route" | "lifecycle";
	status: DeploymentCheckStatus;
	code: string;
	message: string;
	hint?: string;
	details?: Record<string, unknown>;
}

export interface DeploymentStatus {
	checks: DeploymentStatusCheck[];
	summary: {
		ok: number;
		warning: number;
		error: number;
	};
	drift: string[];
}

interface Probe<T> {
	value?: T;
	error?: string;
}

export interface DeploymentStatusDependencies {
	inspectWorker: typeof inspectWorker;
	inspectD1: typeof inspectD1;
	inspectAccess: typeof inspectAccess;
	inspectEndpoint: typeof inspectDeploymentEndpoint;
	loadLifecycle: typeof loadInfrastructureLifecycle;
}

const defaultDependencies: DeploymentStatusDependencies = {
	inspectWorker,
	inspectD1,
	inspectAccess,
	inspectEndpoint: inspectDeploymentEndpoint,
	loadLifecycle: loadInfrastructureLifecycle,
};

async function probe<T>(task: () => Promise<T>): Promise<Probe<T>> {
	try {
		return { value: await task() };
	} catch (error) {
		return {
			error: (error instanceof Error ? error.message : String(error))
				.replace(/\s+/g, " ")
				.trim(),
		};
	}
}

function check(
	id: DeploymentStatusCheck["id"],
	status: DeploymentCheckStatus,
	code: string,
	message: string,
	hint?: string,
	details?: Record<string, unknown>,
): DeploymentStatusCheck {
	return {
		id,
		status,
		code,
		message,
		...(hint ? { hint } : {}),
		...(details ? { details } : {}),
	};
}

export function summarizeRedirectLocation(location: string): string {
	const value = location.trim();
	if (!value) return "";

	const summarizePath = (origin: string, pathname: string) => {
		if (pathname.startsWith("/cdn-cgi/access/login/")) {
			return `${origin}/cdn-cgi/access/login/[redacted]`;
		}
		return `${origin}${pathname}`;
	};

	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.protocol !== "http:") {
			return "[redacted-redirect]";
		}
		return summarizePath(url.origin, url.pathname);
	} catch {
		if (value.startsWith("/") && !value.startsWith("//")) {
			const pathname = value.split(/[?#]/, 1)[0] ?? "";
			return summarizePath("", pathname);
		}
		return "[redacted-redirect]";
	}
}

function failedProbe(
	id: DeploymentStatusCheck["id"],
	resource: string,
	error: string,
): DeploymentStatusCheck {
	return check(
		id,
		"error",
		`${id}_probe_failed`,
		`${resource} 상태를 조회하지 못했습니다: ${error}`,
		"Cloudflare token과 account 설정을 확인한 뒤 pnpm cli status를 다시 실행하세요.",
	);
}

function workerCheck(probeResult: Probe<WorkerResource | null>) {
	if (probeResult.error) {
		return failedProbe("worker", "Worker", probeResult.error);
	}
	if (!probeResult.value) {
		return check(
			"worker",
			"error",
			"worker_missing",
			"설정된 Worker deployment가 없습니다.",
			"pnpm cli deploy를 실행해 production을 배포하세요.",
		);
	}
	return check(
		"worker",
		"ok",
		"worker_ready",
		`Worker ${probeResult.value.name} deployment가 active입니다.`,
		undefined,
		{
			name: probeResult.value.name,
			deployment_id: probeResult.value.deploymentId,
			created_on: probeResult.value.createdOn,
		},
	);
}

function d1Check(probeResult: Probe<D1Resource | null>) {
	if (probeResult.error) return failedProbe("d1", "D1", probeResult.error);
	if (!probeResult.value) {
		return check(
			"d1",
			"error",
			"d1_missing",
			"설정된 기준 D1 database가 없습니다.",
			"pnpm cli deploy를 실행해 기준 D1을 생성하세요.",
		);
	}
	return check(
		"d1",
		"ok",
		"d1_ready",
		`D1 ${probeResult.value.name}을 확인했습니다.`,
		undefined,
		{ name: probeResult.value.name, id: probeResult.value.id },
	);
}

function accessMissingParts(access: AccessInspection): string[] {
	return [
		!access.organization && "Zero Trust organization",
		!access.identityProvider && "One-time PIN identity provider",
		!access.application && "Access application",
		!access.policy && "exact email Allow policy",
	].filter((part): part is string => Boolean(part));
}

function accessCheck(
	probeResult: Probe<AccessInspection>,
	expectedEmails: string[],
) {
	if (probeResult.error) {
		return failedProbe("access", "Access", probeResult.error);
	}
	const access = probeResult.value;
	if (!access?.available) {
		return check(
			"access",
			"error",
			"access_unavailable",
			"Cloudflare Access 상태를 조회하지 못했습니다.",
			"Cloudflare Account API Token을 다시 연결하세요.",
		);
	}
	const missing = accessMissingParts(access);
	if (missing.length > 0) {
		return check(
			"access",
			"error",
			"access_policy_drift",
			`Access 구성이 config.toml과 다릅니다: ${missing.join(", ")}`,
			"pnpm cli deploy를 다시 실행해 OTP, application과 단일 email Allow policy를 동기화하세요.",
			{
				missing,
				expected_emails: [...expectedEmails].sort(),
				actual_emails: access.policyEmails ?? [],
				policy_count: access.policyCount ?? 0,
			},
		);
	}
	return check(
		"access",
		"ok",
		"access_ready",
		"OTP와 config.toml의 단일 email Allow policy가 적용되어 있습니다.",
		undefined,
		{
			team_domain: access.teamDomain,
			application_id: access.appId,
			policy_name: access.policyName,
			emails: access.policyEmails ?? [],
		},
	);
}

function routeCheck(probeResult: Probe<VerificationResult>, hostname: string) {
	if (probeResult.error) {
		return failedProbe("route", `https://${hostname}`, probeResult.error);
	}
	const endpoint = probeResult.value;
	if (
		endpoint &&
		[301, 302, 303, 307, 308, 401, 403].includes(endpoint.status)
	) {
		return check(
			"route",
			"ok",
			"route_access_protected",
			`https://${hostname}이 Access로 보호됩니다 (HTTP ${endpoint.status}).`,
			undefined,
			{
				hostname,
				status: endpoint.status,
				location: summarizeRedirectLocation(endpoint.location),
			},
		);
	}
	return check(
		"route",
		"error",
		"route_unprotected",
		`https://${hostname}이 Access 차단 응답을 반환하지 않습니다 (HTTP ${endpoint?.status ?? 0}).`,
		"pnpm cli deploy를 다시 실행하고 Access application route를 확인하세요.",
		{
			hostname,
			status: endpoint?.status ?? 0,
			location: summarizeRedirectLocation(endpoint?.location ?? ""),
		},
	);
}

function destroyedWorkerCheck(probeResult: Probe<WorkerResource | null>) {
	if (probeResult.error) {
		return failedProbe("worker", "Worker", probeResult.error);
	}
	if (probeResult.value) {
		return check(
			"worker",
			"error",
			"worker_present_after_destroy",
			`lifecycle은 destroyed지만 Worker ${probeResult.value.name}이 남아 있습니다.`,
			"pnpm cli destroy를 다시 실행해 원격 상태를 수렴시키세요.",
			{ name: probeResult.value.name },
		);
	}
	return check(
		"worker",
		"ok",
		"worker_destroyed",
		"철거된 Worker가 존재하지 않습니다.",
	);
}

function destroyedD1Check(probeResult: Probe<D1Resource | null>) {
	if (probeResult.error) return failedProbe("d1", "D1", probeResult.error);
	if (probeResult.value) {
		return check(
			"d1",
			"ok",
			"d1_preserved_after_destroy",
			`D1 ${probeResult.value.name}이 보존되어 있습니다.`,
			undefined,
			{ name: probeResult.value.name, id: probeResult.value.id },
		);
	}
	return check(
		"d1",
		"ok",
		"d1_deleted_after_destroy",
		"철거 과정에서 D1도 삭제되었습니다.",
	);
}

function destroyedAccessCheck(probeResult: Probe<AccessInspection>) {
	if (probeResult.error) {
		return failedProbe("access", "Access", probeResult.error);
	}
	const access = probeResult.value;
	if (!access?.available) {
		return check(
			"access",
			"error",
			"access_unavailable",
			"Cloudflare Access 상태를 조회하지 못했습니다.",
			"Cloudflare Account API Token을 다시 연결하세요.",
		);
	}
	if (access.application || access.policy) {
		return check(
			"access",
			"error",
			"access_present_after_destroy",
			"lifecycle은 destroyed지만 Access application 또는 policy가 남아 있습니다.",
			"pnpm cli destroy를 다시 실행해 원격 상태를 수렴시키세요.",
			{
				application: access.application,
				policy: access.policy,
				application_id: access.appId,
			},
		);
	}
	return check(
		"access",
		"ok",
		"access_destroyed",
		"철거된 Access application과 policy가 존재하지 않습니다.",
	);
}

function destroyedRouteCheck(
	probeResult: Probe<VerificationResult>,
	hostname: string,
) {
	if (probeResult.error) {
		return check(
			"route",
			"ok",
			"route_unreachable_after_destroy",
			`철거된 https://${hostname}에 연결할 수 없습니다.`,
			undefined,
			{ hostname, error: probeResult.error },
		);
	}
	const endpoint = probeResult.value;
	if (
		endpoint &&
		[301, 302, 303, 307, 308, 401, 403].includes(endpoint.status)
	) {
		return check(
			"route",
			"error",
			"route_protected_after_destroy",
			`철거 후에도 https://${hostname}이 Access 차단 응답을 반환합니다 (HTTP ${endpoint.status}).`,
			"pnpm cli destroy를 다시 실행하고 Access application route를 확인하세요.",
			{
				hostname,
				status: endpoint.status,
				location: summarizeRedirectLocation(endpoint.location),
			},
		);
	}
	return check(
		"route",
		"ok",
		"route_released_after_destroy",
		`https://${hostname}이 더 이상 이 앱의 Access 차단 응답을 반환하지 않습니다.`,
		undefined,
		{
			hostname,
			status: endpoint?.status ?? 0,
			location: summarizeRedirectLocation(endpoint?.location ?? ""),
		},
	);
}

function lifecycleCheck(
	probeResult: Probe<InfrastructureLifecycle>,
	hasRemoteResources: boolean,
	hasRemoteErrors: boolean,
	hasDestroyedRuntime: boolean,
) {
	if (probeResult.error) {
		return check(
			"lifecycle",
			"error",
			"lifecycle_invalid",
			`infra/lifecycle.json을 읽지 못했습니다: ${probeResult.error}`,
			"infra/lifecycle.json을 predeploy, deployed 또는 destroyed 상태로 복원하세요.",
		);
	}
	const production = probeResult.value?.production;
	if (production === "predeploy" && hasRemoteResources) {
		return check(
			"lifecycle",
			"warning",
			"lifecycle_predeploy_remote_exists",
			"원격 리소스가 있지만 lifecycle은 predeploy입니다.",
			"성공한 Application Deploy workflow의 lifecycle commit을 git pull --ff-only origin main으로 반영하세요.",
			{ production },
		);
	}
	if (production === "deployed" && hasRemoteErrors) {
		return check(
			"lifecycle",
			"warning",
			"lifecycle_deployed_resource_drift",
			"lifecycle은 deployed지만 원격 production 구성이 완전하지 않습니다.",
			"pnpm cli deploy를 다시 실행해 원격 상태를 config.toml에 수렴시키세요.",
			{ production },
		);
	}
	if (production === "destroyed" && hasDestroyedRuntime) {
		return check(
			"lifecycle",
			"warning",
			"lifecycle_destroyed_resource_drift",
			"lifecycle은 destroyed지만 Worker 또는 Access 리소스가 남아 있습니다.",
			"pnpm cli destroy를 다시 실행해 원격 상태를 수렴시키세요.",
			{ production },
		);
	}
	return check(
		"lifecycle",
		"ok",
		production === "deployed"
			? "lifecycle_deployed"
			: production === "destroyed"
				? "lifecycle_destroyed"
				: "lifecycle_predeploy",
		`lifecycle production은 ${production}입니다.`,
		undefined,
		{ production },
	);
}

export async function inspectDeploymentStatus(
	config: DeploymentConfig,
	overrides: Partial<DeploymentStatusDependencies> = {},
): Promise<DeploymentStatus> {
	const dependencies = { ...defaultDependencies, ...overrides };
	const [worker, d1, access, endpoint, lifecycle] = await Promise.all([
		probe(() => dependencies.inspectWorker(config)),
		probe(() => dependencies.inspectD1(config)),
		probe(() => dependencies.inspectAccess(config)),
		probe(() => dependencies.inspectEndpoint(config)),
		probe(() => dependencies.loadLifecycle()),
	]);
	const destroyed = lifecycle.value?.production === "destroyed";
	const remoteChecks = destroyed
		? [
				destroyedWorkerCheck(worker),
				destroyedD1Check(d1),
				destroyedAccessCheck(access),
				destroyedRouteCheck(endpoint, config.hostname),
			]
		: [
				workerCheck(worker),
				d1Check(d1),
				accessCheck(access, config.allowedEmails),
				routeCheck(endpoint, config.hostname),
			];
	const hasRemoteResources = Boolean(
		worker.value || d1.value || access.value?.application,
	);
	const hasDestroyedRuntime = Boolean(
		worker.value || access.value?.application || access.value?.policy,
	);
	const hasRemoteErrors = remoteChecks.some(
		(result) => result.status === "error",
	);
	const checks = [
		...remoteChecks,
		lifecycleCheck(
			lifecycle,
			hasRemoteResources,
			hasRemoteErrors,
			hasDestroyedRuntime,
		),
	];
	return {
		checks,
		summary: {
			ok: checks.filter((result) => result.status === "ok").length,
			warning: checks.filter((result) => result.status === "warning").length,
			error: checks.filter((result) => result.status === "error").length,
		},
		drift: checks
			.filter((result) => result.status !== "ok")
			.map((result) => result.code),
	};
}

export function formatDeploymentStatus(
	config: DeploymentConfig,
	status: DeploymentStatus,
): string {
	const checks = status.checks.flatMap((result) => [
		`${result.status.toUpperCase()} [${result.code}] ${result.message}`,
		...(result.hint ? [`  해결: ${result.hint}`] : []),
	]);
	return [
		...checks,
		`URL: https://${config.hostname}`,
		`Summary: ${status.summary.ok} ok · ${status.summary.warning} warning · ${status.summary.error} error`,
	].join("\n");
}

export async function printDeploymentStatus(
	config: DeploymentConfig,
): Promise<DeploymentStatus> {
	logger.start("Cloudflare 리소스 상태를 조회합니다");
	const status = await inspectDeploymentStatus(config);
	logger.box({
		title: "Cloudflare status",
		message: formatDeploymentStatus(config, status),
	});
	return status;
}

export function deploymentStatusHasIssues(
	status: DeploymentStatus,
	strict = false,
): boolean {
	return status.summary.error > 0 || (strict && status.summary.warning > 0);
}
