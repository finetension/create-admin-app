import { type AccessInspection, inspectAccess } from "../cloudflare/access.ts";
import {
	type D1Resource,
	inspectD1,
	inspectWorker,
	type WorkerResource,
} from "../cloudflare/resources.ts";
import type { DeploymentConfig } from "../core/config.ts";
import { logger } from "../core/logger.ts";
import {
	inspectDeploymentEndpoint,
	type VerificationResult,
} from "./verify.ts";

interface Probe<T> {
	value?: T;
	error?: string;
}

export interface DeploymentStatus {
	worker: Probe<WorkerResource | null>;
	d1: Probe<D1Resource | null>;
	access: Probe<AccessInspection>;
	endpoint: Probe<VerificationResult>;
}

async function probe<T>(task: () => Promise<T>): Promise<Probe<T>> {
	try {
		return { value: await task() };
	} catch (error) {
		return {
			error: (error instanceof Error ? error.message : String(error)).replace(
				/\s+/g,
				" ",
			),
		};
	}
}

export async function inspectDeploymentStatus(
	config: DeploymentConfig,
): Promise<DeploymentStatus> {
	const [worker, d1, access, endpoint] = await Promise.all([
		probe(() => inspectWorker(config)),
		probe(() => inspectD1(config)),
		probe(() => inspectAccess(config)),
		probe(() => inspectDeploymentEndpoint(config)),
	]);
	return { worker, d1, access, endpoint };
}

function renderProbe<T>(
	result: Probe<T>,
	render: (value: T) => string,
): string {
	if (result.error) return `unknown · ${result.error}`;
	return result.value === undefined ? "unknown" : render(result.value);
}

function renderAccess(access: AccessInspection): string {
	if (!access.available) return "unknown · Access API token required";
	const missing = [
		!access.organization && "organization",
		!access.identityProvider && "One-time PIN IdP",
		!access.application && "application",
		!access.policy && "policy",
	].filter(Boolean);
	return missing.length === 0
		? `ready${access.teamDomain ? ` · ${access.teamDomain}` : ""}`
		: `incomplete · ${missing.join(", ")}`;
}

function renderEndpoint(endpoint: VerificationResult): string {
	const accessStatuses = [301, 302, 303, 307, 308, 401, 403];
	return accessStatuses.includes(endpoint.status)
		? `ready · Access protected · HTTP ${endpoint.status}`
		: `warning · reachable but unprotected · HTTP ${endpoint.status}`;
}

export function formatDeploymentStatus(
	config: DeploymentConfig,
	status: DeploymentStatus,
): string {
	return [
		`Worker: ${renderProbe(status.worker, (worker) =>
			worker ? `ready · ${worker.name} · ${worker.createdOn}` : "missing",
		)}`,
		`D1:     ${renderProbe(status.d1, (d1) =>
			d1 ? `ready · ${d1.name}` : "missing",
		)}`,
		`Access: ${renderProbe(status.access, renderAccess)}`,
		`Domain: ${renderProbe(status.endpoint, renderEndpoint)}`,
		`URL:    https://${config.hostname}`,
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
