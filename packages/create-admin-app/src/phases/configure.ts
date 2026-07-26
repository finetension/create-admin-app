import * as prompts from "@clack/prompts";
import type { CreateContext } from "../core/context.js";
import { runCommand } from "../lib/process.js";

async function initializeGit(
	destination: string,
	machine: boolean,
): Promise<void> {
	const stdout = machine ? "stderr" : "inherit";
	await runCommand("git", ["init", "-b", "main"], {
		cwd: destination,
		stdout,
	});
	await runCommand("git", ["add", "--all"], { cwd: destination, stdout });
	await runCommand(
		"git",
		[
			"-c",
			"user.name=Create Admin App",
			"-c",
			"user.email=create-admin-app@users.noreply.github.com",
			"commit",
			"-m",
			"chore: initialize admin app",
		],
		{ cwd: destination, stdout },
	);
}

export async function configureProject(context: CreateContext): Promise<void> {
	const { staging } = context.project;
	if (!context.args.skipInstall) {
		if (context.machine) {
			process.stderr.write("pnpm 의존성을 설치합니다.\n");
		} else {
			prompts.log.step("pnpm 의존성을 설치합니다");
		}
		await runCommand("pnpm", ["install", "--frozen-lockfile"], {
			cwd: staging,
			stdout: context.machine ? "stderr" : "inherit",
		});
		if (context.machine) {
			process.stderr.write("생성된 프로젝트 전체 검증을 실행합니다.\n");
		} else {
			prompts.log.step("생성된 프로젝트 전체 검증을 실행합니다");
		}
		await runCommand("pnpm", ["check"], {
			cwd: staging,
			stdout: context.machine ? "stderr" : "inherit",
		});
	}
	await initializeGit(staging, context.machine);
}
