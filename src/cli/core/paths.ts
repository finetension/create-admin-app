import { resolve } from "node:path";

export const projectRoot = resolve(process.cwd());

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
	deployConfig: resolve(projectRoot, "deploy.config.json"),
	deployConfigExample: resolve(projectRoot, "deploy.config.example.json"),
} as const;

export function resolveProjectPath(path: string): string {
	return resolve(projectRoot, path);
}
