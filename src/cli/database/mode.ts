import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { z } from "zod";
import { configurationError, usageError } from "../core/error.ts";
import { loadInfrastructureLifecycle } from "../core/lifecycle.ts";
import { projectPaths } from "../core/paths.ts";

export const developmentDatabaseModes = ["auto", "local", "remote"] as const;
export type DevelopmentDatabaseMode = (typeof developmentDatabaseModes)[number];
export type ResolvedDatabaseMode = Exclude<DevelopmentDatabaseMode, "auto">;

export interface DatabaseModeResolution {
	mode: ResolvedDatabaseMode;
	reason: "explicit" | "lifecycle-deployed" | "pre-deploy";
}

export interface ModeDependencies {
	loadLifecycle: typeof loadInfrastructureLifecycle;
}

const defaultDependencies: ModeDependencies = {
	loadLifecycle: loadInfrastructureLifecycle,
};

export function parseDevelopmentDatabaseMode(
	value: string | undefined,
): DevelopmentDatabaseMode {
	const result = z.enum(developmentDatabaseModes).safeParse(value ?? "auto");
	if (!result.success) {
		throw usageError(
			"invalid_database_mode",
			`지원하지 않는 D1 모드입니다: ${value}`,
			"--database에 auto, local 또는 remote를 지정하세요.",
		);
	}
	return result.data;
}

export async function resolveDevelopmentDatabaseMode(
	requested: DevelopmentDatabaseMode = "auto",
	dependencies: ModeDependencies = defaultDependencies,
): Promise<DatabaseModeResolution> {
	if (requested !== "auto") return { mode: requested, reason: "explicit" };
	const lifecycle = await dependencies.loadLifecycle();
	if (lifecycle.production === "destroyed") {
		throw configurationError(
			"production_destroyed",
			"production이 철거되어 자동 개발 데이터베이스를 선택할 수 없습니다.",
			"pnpm cli deploy를 실행해 production을 다시 배포하세요.",
		);
	}
	return lifecycle.production === "deployed"
		? { mode: "remote", reason: "lifecycle-deployed" }
		: { mode: "local", reason: "pre-deploy" };
}

export async function removePersistentLocalD1(): Promise<boolean> {
	if (!existsSync(projectPaths.localD1Directory)) return false;
	await rm(projectPaths.localD1Directory, { recursive: true, force: true });
	return true;
}
