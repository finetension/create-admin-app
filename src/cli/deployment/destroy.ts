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
import type { DeploymentConfig } from "../core/config.ts";
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
	skipAccess?: boolean;
}

interface DestroyDependencies {
	inspect(
		config: DeploymentConfig,
		options?: { skipAccess?: boolean },
	): Promise<DestroyInspection>;
	deleteAccess(config: DeploymentConfig, appId: string): Promise<void>;
	deleteWorker(config: DeploymentConfig, worker: WorkerResource): Promise<void>;
	deleteD1(config: DeploymentConfig, database: D1Resource): Promise<void>;
}

async function inspectDestroyResources(
	config: DeploymentConfig,
	options: { skipAccess?: boolean } = {},
): Promise<DestroyInspection> {
	const [worker, d1, access] = await Promise.all([
		inspectWorker(config),
		inspectD1(config),
		options.skipAccess
			? Promise.resolve({
					available: false,
					organization: false,
					identityProvider: false,
					application: false,
					policy: false,
				})
			: inspectAccess(config),
	]);
	return { worker, d1, access };
}

const defaultDependencies: DestroyDependencies = {
	inspect: inspectDestroyResources,
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
	skipAccess = false,
): string {
	const access = skipAccess
		? "skip · not checked"
		: inspection.access.available
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
		throw new Error(
			`삭제 확인값이 올바르지 않습니다. --confirm ${config.serviceName} 을 정확히 입력하세요.`,
		);
	}
}

export async function destroyDeployment(
	config: DeploymentConfig,
	options: DestroyOptions = {},
	dependencies: DestroyDependencies = defaultDependencies,
): Promise<DestroyInspection> {
	const includeData = options.includeData ?? false;
	const skipAccess = options.skipAccess ?? false;
	logger.start("삭제할 Cloudflare 리소스를 조회합니다");
	const inspection = await dependencies.inspect(config, { skipAccess });
	logger.box({
		title: options.confirm
			? "Cloudflare destroy"
			: "Cloudflare destroy · dry run",
		message: formatDestroyPlan(config, inspection, includeData, skipAccess),
	});

	if (!options.confirm) {
		logger.info(
			`실제로 삭제하려면 --confirm ${config.serviceName}${includeData ? " --include-data" : ""}${skipAccess ? " --skip-access" : ""} 를 사용하세요.`,
		);
		return inspection;
	}
	assertExactConfirmation(config, options.confirm);
	if (!skipAccess && !inspection.access.available) {
		throw new Error(
			"Access 애플리케이션을 확인하려면 Access API token이 필요합니다. 이미 삭제된 것이 확인된 경우에만 --skip-access를 사용하세요.",
		);
	}

	if (!skipAccess && inspection.access.appId) {
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
