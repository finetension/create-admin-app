import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { parseUserConfig } from "./src/cli/core/config.ts";
import { parseJsonc } from "./src/cli/core/json.ts";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function createDevelopmentWranglerConfig(): string {
	const configuredUserConfigPath = process.env.PLATFORM_CONFIG_PATH;
	const userConfigPath = configuredUserConfigPath
		? resolve(projectRoot, configuredUserConfigPath)
		: existsSync(resolve(projectRoot, "deploy.config.json"))
			? resolve(projectRoot, "deploy.config.json")
			: resolve(projectRoot, "deploy.config.example.json");
	const userConfig = parseUserConfig(
		parseJsonc(readFileSync(userConfigPath, "utf8"), userConfigPath),
		userConfigPath,
	);

	const baseConfig = parseJsonc(
		readFileSync(resolve(projectRoot, "wrangler.jsonc"), "utf8"),
		"wrangler.jsonc",
	) as Record<string, unknown> & {
		d1_databases: Record<string, unknown>[];
		vars: Record<string, unknown>;
	};
	const generatedPath = resolve(projectRoot, ".wrangler/dev-config.jsonc");
	const databaseMode =
		process.env.PLATFORM_DATABASE_MODE === "remote" ? "remote" : "local";
	const remoteDatabaseId = process.env.PLATFORM_DATABASE_ID?.trim();
	const remoteAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
	if (databaseMode === "remote" && (!remoteDatabaseId || !remoteAccountId)) {
		throw new Error(
			"원격 개발 모드에는 CLI가 조회한 CLOUDFLARE_ACCOUNT_ID와 PLATFORM_DATABASE_ID가 필요합니다.",
		);
	}
	const generatedConfig = {
		...baseConfig,
		$schema: "../node_modules/wrangler/config-schema.json",
		name: `${userConfig.serviceName}-${databaseMode === "remote" ? "development" : "local"}`,
		...(databaseMode === "remote" ? { account_id: remoteAccountId } : {}),
		main: "../src/worker/index.ts",
		d1_databases: baseConfig.d1_databases.map(
			(database: Record<string, unknown>) => ({
				...database,
				...(databaseMode === "remote"
					? {
							database_name: `${userConfig.serviceName}-db`,
							database_id: remoteDatabaseId,
							remote: true,
						}
					: {}),
				migrations_dir: "../db/migrations",
			}),
		),
		vars: {
			...baseConfig.vars,
			APP_NAME: userConfig.name,
			DEV_ALLOWED_EMAILS: JSON.stringify(userConfig.allowedEmails),
		},
	};
	mkdirSync(dirname(generatedPath), { recursive: true });
	const serializedConfig = `${JSON.stringify(generatedConfig, null, 2)}\n`;
	if (
		!existsSync(generatedPath) ||
		readFileSync(generatedPath, "utf8") !== serializedConfig
	) {
		writeFileSync(generatedPath, serializedConfig);
	}
	return generatedPath;
}

const wranglerConfigPath =
	process.env.WRANGLER_CONFIG_PATH ?? createDevelopmentWranglerConfig();

export default defineConfig({
	define: {
		"import.meta.env.VITE_APP_NAME": JSON.stringify(
			process.env.VITE_APP_NAME ?? "Management System",
		),
	},
	server: {
		port: 10_050,
		strictPort: true,
	},
	plugins: [
		react(),
		tailwindcss(),
		cloudflare({
			configPath: wranglerConfigPath,
		}),
	],
});
