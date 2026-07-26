import { rm } from "node:fs/promises";
import { runCommand } from "../lib/process.js";
import { configureProject } from "../phases/configure.js";
import { finalizeProject } from "../phases/finalize.js";
import { scaffoldProject } from "../phases/scaffold.js";
import {
	assertDestinationAvailable,
	createStagingDirectory,
} from "../template/files.js";
import type { CreateContext, CreatePhases } from "./context.js";

export const defaultCreatePhases: CreatePhases = {
	scaffold: scaffoldProject,
	configure: configureProject,
	finalize: finalizeProject,
};

export interface CreateDependencies {
	preflight(context: CreateContext): Promise<void>;
	createStaging(destination: string): Promise<string>;
	removeStaging(path: string): Promise<void>;
}

export function assertSupportedToolVersion(
	command: "node" | "pnpm" | "git",
	output: string,
): void {
	if (command === "git") return;
	const match = output.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
	if (!match) {
		throw new Error(`${command} version을 확인할 수 없습니다: ${output}`);
	}
	const major = Number(match[1]);
	const minor = Number(match[2]);
	if (command === "node" && !(major > 22 || (major === 22 && minor >= 13))) {
		throw new Error("Node.js >=22.13.0이 필요합니다.");
	}
	if (command === "pnpm" && major !== 11) {
		throw new Error("pnpm 11이 필요합니다.");
	}
}

export async function preflightCreation(context: CreateContext): Promise<void> {
	await assertDestinationAvailable(context.project.destination);
	for (const [command, args] of [
		["node", ["--version"]],
		["pnpm", ["--version"]],
		["git", ["--version"]],
	] as const) {
		const result = await runCommand(command, [...args], {
			cwd: process.cwd(),
			capture: true,
			allowFailure: true,
		});
		if (result.exitCode !== 0) {
			throw new Error(`${command} 명령을 실행할 수 없습니다.`);
		}
		assertSupportedToolVersion(command, result.stdout || result.stderr);
	}
}

const defaultDependencies: CreateDependencies = {
	preflight: preflightCreation,
	createStaging: createStagingDirectory,
	removeStaging: (path) => rm(path, { recursive: true, force: true }),
};

export async function createProject(
	context: CreateContext,
	phases: CreatePhases = defaultCreatePhases,
	dependencies: CreateDependencies = defaultDependencies,
): Promise<void> {
	await dependencies.preflight(context);
	context.project.staging = await dependencies.createStaging(
		context.project.destination,
	);
	try {
		await phases.scaffold(context);
		await phases.configure(context);
		await phases.finalize(context);
	} finally {
		if (context.project.staging) {
			await dependencies.removeStaging(context.project.staging);
		}
	}
}
