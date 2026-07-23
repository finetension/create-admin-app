import { mkdir } from "node:fs/promises";
import type { AccessResult } from "../cloudflare/access.ts";
import type { D1Resource } from "../cloudflare/resources.ts";
import type { DeploymentConfig } from "../core/config.ts";
import { writeJson } from "../core/json.ts";
import { projectPaths } from "../core/paths.ts";

export async function writeDeploymentWranglerConfig(
	config: DeploymentConfig,
	access: AccessResult,
	d1: D1Resource,
): Promise<string> {
	const generatedConfig = createDeploymentWranglerConfig(config, access, d1);
	await mkdir(projectPaths.runtimeDirectory, { recursive: true });
	const path = projectPaths.deploymentWranglerConfig;
	await writeJson(path, generatedConfig);
	return path;
}

export function createDeploymentWranglerConfig(
	config: DeploymentConfig,
	access: AccessResult,
	d1: D1Resource,
) {
	return {
		$schema: "../../node_modules/wrangler/config-schema.json",
		name: config.workerName,
		account_id: config.accountId,
		main: "../../src/worker/index.ts",
		compatibility_date: config.compatibilityDate,
		compatibility_flags: ["nodejs_compat"],
		preview_urls: false,
		...(config.routing === "custom-domain"
			? {
					workers_dev: false,
					routes: [{ pattern: config.hostname, custom_domain: true }],
				}
			: { workers_dev: true }),
		assets: {
			not_found_handling: "single-page-application",
			run_worker_first: ["/api/*"],
		},
		d1_databases: [
			{
				binding: "APP_DB",
				database_name: d1.name,
				database_id: d1.id,
				migrations_dir: "../../db/migrations",
			},
		],
		vars: {
			ENVIRONMENT: "production",
			APP_NAME: config.name,
			ACCESS_TEAM_DOMAIN: access.teamDomain,
			ACCESS_AUD: access.aud,
		},
		observability: {
			enabled: true,
			head_sampling_rate: 1,
		},
	};
}
