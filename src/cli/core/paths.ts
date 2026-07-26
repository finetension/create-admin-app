import { resolve } from "node:path";
import envPaths from "env-paths";

export const projectRoot = resolve(process.cwd());
const userPaths = envPaths("create-admin-app", { suffix: "" });

export const projectPaths = {
	root: projectRoot,
	buildDirectory: resolve(projectRoot, "dist"),
	infrastructureDirectory: resolve(projectRoot, "infra"),
	infrastructureLifecycle: resolve(projectRoot, "infra/lifecycle.json"),
	localDirectory: resolve(projectRoot, ".wrangler"),
	localD1Directory: resolve(projectRoot, ".wrangler/state/v3/d1"),
	runtimeDirectory: resolve(projectRoot, ".wrangler/runtime"),
	developmentWranglerConfig: resolve(projectRoot, ".wrangler/dev-config.jsonc"),
	deploymentWranglerConfig: resolve(
		projectRoot,
		".wrangler/runtime/deployment.jsonc",
	),
	wranglerConfig: resolve(projectRoot, "wrangler.jsonc"),
	config: resolve(projectRoot, "config.toml"),
	userConfig: resolve(userPaths.config, "config.toml"),
} as const;

export function resolveProjectPath(path: string): string {
	return resolve(projectRoot, path);
}
