import { z } from "zod";
import type { DeploymentConfig } from "../core/config.ts";
import { extractJson } from "../core/json.ts";
import { logger } from "../core/logger.ts";
import { runWrangler } from "../core/process.ts";

const d1DatabaseSchema = z.object({
	name: z.string(),
	uuid: z.string(),
});

const workerDeploymentSchema = z.object({
	id: z.string(),
	created_on: z.string(),
});

export interface D1Resource {
	name: string;
	id: string;
}

export interface WorkerResource {
	name: string;
	deploymentId: string;
	createdOn: string;
}

async function listD1Databases(accountId: string) {
	const result = await runWrangler(["d1", "list", "--json"], {
		accountId,
		capture: true,
	});
	return z.array(d1DatabaseSchema).parse(extractJson(result.stdout, "D1 목록"));
}

export async function inspectWorker(
	config: DeploymentConfig,
): Promise<WorkerResource | null> {
	const result = await runWrangler(
		["deployments", "list", "--name", config.workerName, "--json"],
		{
			accountId: config.accountId,
			capture: true,
			allowFailure: true,
		},
	);
	if (result.exitCode !== 0) return null;
	const deployments = z
		.array(workerDeploymentSchema)
		.parse(extractJson(result.stdout, "Worker deployment 목록"));
	const latest = deployments.reduce<z.output<
		typeof workerDeploymentSchema
	> | null>(
		(current, deployment) =>
			!current || deployment.created_on > current.created_on
				? deployment
				: current,
		null,
	);
	return latest
		? {
				name: config.workerName,
				deploymentId: latest.id,
				createdOn: latest.created_on,
			}
		: null;
}

export async function inspectD1(
	config: DeploymentConfig,
): Promise<D1Resource | null> {
	const databaseName = `${config.resourcePrefix}-db`;
	const database = (await listD1Databases(config.accountId)).find(
		(item) => item.name === databaseName,
	);
	return database ? { name: database.name, id: database.uuid } : null;
}

export async function ensureD1(config: DeploymentConfig): Promise<D1Resource> {
	const databaseName = `${config.resourcePrefix}-db`;
	let database = await inspectD1(config);
	if (!database) {
		logger.start(`D1 데이터베이스를 생성합니다: ${databaseName}`);
		await runWrangler(["d1", "create", databaseName], {
			accountId: config.accountId,
		});
		database = await inspectD1(config);
	} else {
		logger.info(`D1 reuse: ${databaseName}`);
	}
	if (!database) {
		throw new Error(`D1 데이터베이스 ID를 찾지 못했습니다: ${databaseName}`);
	}
	return database;
}
