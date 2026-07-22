import { rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { inspectD1 } from "../cloudflare/resources.ts";
import { loadUserConfig, resolveLocalConfigPath } from "../core/config.ts";
import { logger } from "../core/logger.ts";
import { projectPaths } from "../core/paths.ts";
import { runPnpm } from "../core/process.ts";
import { migrateDatabase } from "../database/migrations.ts";
import {
	type DevelopmentDatabaseMode,
	removePersistentLocalD1,
	resolveDevelopmentDatabaseMode,
} from "../database/mode.ts";
import { loadDeploymentContext } from "../deployment/context.ts";
import { seedLocalDatabase } from "../local/seed.ts";

export interface DevelopmentOptions {
	config?: string;
	migrate?: boolean;
	seed?: boolean;
	host?: string;
	port?: string;
	open?: boolean;
	database?: DevelopmentDatabaseMode;
}

export function parsePort(value?: string): number | undefined {
	if (value === undefined) return undefined;
	if (!/^\d+$/.test(value)) {
		throw new Error("port는 1부터 65535 사이의 정수여야 합니다.");
	}
	const port = Number(value);
	if (port < 1 || port > 65_535) {
		throw new Error("port는 1부터 65535 사이의 정수여야 합니다.");
	}
	return port;
}

export function createViteDevArgs(options: DevelopmentOptions): string[] {
	const args = ["exec", "vite"];
	if (options.host) args.push("--host", options.host);
	const port = parsePort(options.port);
	if (port !== undefined) args.push("--port", String(port));
	if (options.open) args.push("--open");
	return args;
}

interface DevelopmentDependencies {
	migrate?: typeof migrateDatabase;
	seed?: typeof seedLocalDatabase;
	run?: typeof runPnpm;
	resolveMode?: typeof resolveDevelopmentDatabaseMode;
	removeLocalD1?: typeof removePersistentLocalD1;
	loadDeployment?: typeof loadDeploymentContext;
	inspectRemoteD1?: typeof inspectD1;
	removeDevelopmentConfig?: () => Promise<void>;
}

export async function startDevelopmentServer(
	options: DevelopmentOptions = {},
	dependencies: DevelopmentDependencies = {},
): Promise<void> {
	const configPath = resolveLocalConfigPath(options.config);
	const config = await loadUserConfig(configPath);
	const migrate = dependencies.migrate ?? migrateDatabase;
	const seed = dependencies.seed ?? seedLocalDatabase;
	const run = dependencies.run ?? runPnpm;
	const resolveMode =
		dependencies.resolveMode ?? resolveDevelopmentDatabaseMode;
	const removeLocalD1 = dependencies.removeLocalD1 ?? removePersistentLocalD1;
	const loadDeployment = dependencies.loadDeployment ?? loadDeploymentContext;
	const inspectRemoteD1 = dependencies.inspectRemoteD1 ?? inspectD1;
	const removeDevelopmentConfig =
		dependencies.removeDevelopmentConfig ??
		(() => rm(projectPaths.developmentWranglerConfig, { force: true }));
	const database = await resolveMode(options.database ?? "auto");
	let remoteEnvironment: NodeJS.ProcessEnv = {};
	let shouldRemoveDevelopmentConfig = false;
	const removeDevelopmentConfigOnSignal = () => {
		rmSync(projectPaths.developmentWranglerConfig, { force: true });
	};

	try {
		if (database.mode === "remote") {
			shouldRemoveDevelopmentConfig = true;
			process.once("SIGINT", removeDevelopmentConfigOnSignal);
			process.once("SIGTERM", removeDevelopmentConfigOnSignal);
			await removeDevelopmentConfig();
			if (options.seed) {
				throw new Error(
					"원격 D1 개발 모드에서는 seed를 실행할 수 없습니다. 데이터 변경은 명시적인 제품 기능이나 검토된 운영 절차로 수행하세요.",
				);
			}
			const deployment = await loadDeployment(configPath);
			const remoteD1 = await inspectRemoteD1(deployment);
			if (!remoteD1) {
				throw new Error(`원격 D1을 찾을 수 없습니다: ${config.serviceName}-db`);
			}
			remoteEnvironment = {
				CLOUDFLARE_ACCOUNT_ID: deployment.accountId,
				PLATFORM_DATABASE_ID: remoteD1.id,
			};
			if (await removeLocalD1()) {
				logger.info(
					"배포 후 단일 데이터 원칙에 따라 persistent local D1을 제거했습니다",
				);
			}
		} else {
			if (options.migrate ?? true) await migrate();
			if (options.seed) await seed(configPath);
		}

		logger.info(`Service: ${config.serviceName}`);
		logger.info(`Database: ${database.mode} · ${database.reason}`);
		logger.info(`Config: ${configPath}`);
		await run(createViteDevArgs(options), {
			ci: false,
			env: {
				PLATFORM_CONFIG_PATH: configPath,
				PLATFORM_DATABASE_MODE: database.mode,
				VITE_APP_NAME: config.name,
				...remoteEnvironment,
			},
		});
	} finally {
		if (shouldRemoveDevelopmentConfig) {
			process.off("SIGINT", removeDevelopmentConfigOnSignal);
			process.off("SIGTERM", removeDevelopmentConfigOnSignal);
			await removeDevelopmentConfig();
		}
	}
}
