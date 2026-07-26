import { rm } from "node:fs/promises";
import { logger } from "../core/logger.ts";
import { projectPaths } from "../core/paths.ts";
import { runPnpm } from "../core/process.ts";

type PackageRunner = (args: string[]) => Promise<unknown>;
type BuildCleaner = () => Promise<void>;

interface BuildProjectDependencies {
	run?: PackageRunner;
	clean?: BuildCleaner;
}

export async function buildProject(
	dependencies: BuildProjectDependencies = {},
): Promise<void> {
	const run = dependencies.run ?? runPnpm;
	const clean =
		dependencies.clean ??
		(() => rm(projectPaths.buildDirectory, { recursive: true, force: true }));

	logger.start("기존 빌드 산출물을 정리합니다");
	await clean();

	logger.start("TypeScript 프로젝트를 검사합니다");
	await run(["exec", "tsc", "-b"]);

	logger.start("React와 Cloudflare Worker를 빌드합니다");
	await run(["exec", "vite", "build"]);

	logger.start("통합 CLI를 단일 실행 파일로 빌드합니다");
	await run(["exec", "vite", "build", "--config", "./vite.cli.config.ts"]);

	logger.success("앱, Worker, CLI 빌드가 완료됐습니다");
}
