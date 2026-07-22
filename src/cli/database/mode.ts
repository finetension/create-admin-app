import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { z } from "zod";
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
	return z.enum(developmentDatabaseModes).parse(value ?? "auto");
}

export async function resolveDevelopmentDatabaseMode(
	requested: DevelopmentDatabaseMode = "auto",
	dependencies: ModeDependencies = defaultDependencies,
): Promise<DatabaseModeResolution> {
	if (requested !== "auto") return { mode: requested, reason: "explicit" };
	const lifecycle = await dependencies.loadLifecycle();
	return lifecycle.production === "deployed"
		? { mode: "remote", reason: "lifecycle-deployed" }
		: { mode: "local", reason: "pre-deploy" };
}

export async function removePersistentLocalD1(): Promise<boolean> {
	if (!existsSync(projectPaths.localD1Directory)) return false;
	await rm(projectPaths.localD1Directory, { recursive: true, force: true });
	return true;
}
