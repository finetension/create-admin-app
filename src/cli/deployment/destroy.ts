import {
	type AccessInspection,
	deleteAccessApplication,
	inspectAccess,
} from "../cloudflare/access.ts";
import {
	type D1Resource,
	inspectD1,
	inspectWorker,
	type WorkerResource,
} from "../cloudflare/resources.ts";
import { assertGitHubActionsCapability } from "../core/ci-guard.ts";
import type { DeploymentConfig } from "../core/config.ts";
import { configurationError, safetyError } from "../core/error.ts";
import { logger } from "../core/logger.ts";
import { runWrangler } from "../core/process.ts";

export interface DestroyInspection {
	worker: WorkerResource | null;
	d1: D1Resource | null;
	access: AccessInspection;
}

export interface DestroyOptions {
	confirm?: string;
	includeData?: boolean;
}

interface DestroyDependencies {
	inspect(config: DeploymentConfig): Promise<DestroyInspection>;
	assertCapability(): void;
	deleteAccess(config: DeploymentConfig, appId: string): Promise<void>;
	deleteWorker(config: DeploymentConfig, worker: WorkerResource): Promise<void>;
	deleteD1(config: DeploymentConfig, database: D1Resource): Promise<void>;
}

async function inspectDestroyResources(
	config: DeploymentConfig,
): Promise<DestroyInspection> {
	const [worker, d1, access] = await Promise.all([
		inspectWorker(config),
		inspectD1(config),
		inspectAccess(config),
	]);
	return { worker, d1, access };
}

const defaultDependencies: DestroyDependencies = {
	inspect: inspectDestroyResources,
	assertCapability: () => assertGitHubActionsCapability("destroy"),
	deleteAccess: deleteAccessApplication,
	async deleteWorker(config, worker) {
		await runWrangler(["delete", worker.name], {
			accountId: config.accountId,
		});
	},
	async deleteD1(config, database) {
		await runWrangler(["d1", "delete", database.name, "--skip-confirmation"], {
			accountId: config.accountId,
		});
	},
};

export function formatDestroyPlan(
	config: DeploymentConfig,
	inspection: DestroyInspection,
	includeData: boolean,
): string {
	const access = inspection.access.available
		? inspection.access.appId
			? `delete · ${config.hostname}`
			: "missing"
		: "unknown · Access API token required";
	const worker = inspection.worker
		? `delete · ${inspection.worker.name}`
		: "missing";
	const d1 = inspection.d1
		? `${includeData ? "delete" : "keep"} · ${inspection.d1.name}`
		: "missing";

	return [`Access: ${access}`, `Worker: ${worker}`, `D1:     ${d1}`].join("\n");
}

function assertExactConfirmation(
	config: DeploymentConfig,
	confirm: string,
): void {
	if (confirm !== config.serviceName) {
		throw safetyError(
			"destroy_confirmation_mismatch",
			"삭제 확인값이 project slug와 일치하지 않습니다.",
			`--confirm ${config.serviceName}을 정확히 지정하세요.`,
		);
	}
}

export async function destroyDeployment(
	config: DeploymentConfig,
	options: DestroyOptions = {},
	dependencies: DestroyDependencies = defaultDependencies,
): Promise<DestroyInspection> {
	const includeData = options.includeData ?? false;
	logger.start("삭제할 Cloudflare 리소스를 조회합니다");
	const inspection = await dependencies.inspect(config);
	logger.box({
		title: options.confirm
			? "Cloudflare destroy"
			: "Cloudflare destroy · dry run",
		message: formatDestroyPlan(config, inspection, includeData),
	});

	if (!options.confirm) {
		logger.info(
			`실제로 삭제하려면 --confirm ${config.serviceName}${includeData ? " --include-data" : ""} 를 사용하세요.`,
		);
		return inspection;
	}
	assertExactConfirmation(config, options.confirm);
	dependencies.assertCapability();
	if (!inspection.access.available) {
		throw configurationError(
			"access_inspection_unavailable",
			"Access 애플리케이션 상태를 확인하지 못했습니다.",
			"Cloudflare Account API Token을 확인한 뒤 destroy를 다시 실행하세요.",
		);
	}

	if (inspection.access.appId) {
		logger.start(`Access 애플리케이션을 삭제합니다: ${config.hostname}`);
		await dependencies.deleteAccess(config, inspection.access.appId);
	}
	if (inspection.worker) {
		logger.start(`Worker를 삭제합니다: ${inspection.worker.name}`);
		await dependencies.deleteWorker(config, inspection.worker);
	}
	if (includeData && inspection.d1) {
		logger.start(`D1 데이터베이스를 삭제합니다: ${inspection.d1.name}`);
		await dependencies.deleteD1(config, inspection.d1);
	}

	logger.success("Cloudflare 리소스 삭제를 완료했습니다");
	return inspection;
}
