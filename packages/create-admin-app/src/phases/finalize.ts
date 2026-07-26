import * as prompts from "@clack/prompts";
import { answer } from "../cli/prompts.js";
import type { CreateContext } from "../core/context.js";
import { runCommand } from "../lib/process.js";
import { promoteStagingDirectory } from "../template/files.js";

export class CreateDeploymentError extends Error {
	readonly exitCode: number;
	readonly partialResult: Record<string, unknown>;

	constructor(
		message: string,
		exitCode: number,
		partialResult: Record<string, unknown>,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "CreateDeploymentError";
		this.exitCode = [1, 2, 3, 4, 5].includes(exitCode) ? exitCode : 4;
		this.partialResult = partialResult;
	}
}

async function shouldDeploy(context: CreateContext): Promise<boolean> {
	if (context.args.skipInstall) return false;
	if (context.args.deploy) return true;
	if (context.machine) return false;
	return answer(
		await prompts.confirm({
			message: "생성된 프로젝트의 production 배포를 계속할까요?",
			initialValue: false,
		}),
	);
}

export async function finalizeProject(context: CreateContext): Promise<void> {
	const { staging, destination } = context.project;
	await promoteStagingDirectory(staging, destination);
	context.project.staging = "";

	if (await shouldDeploy(context)) {
		const args = ["cli", "deploy"];
		if (context.args.yes) args.push("--yes");
		if (context.args.message) args.push("--message", context.args.message);
		if (context.machine) args.push("--json");
		else args.push("--interactive");
		let result: Awaited<ReturnType<typeof runCommand>>;
		try {
			result = await runCommand("pnpm", args, {
				cwd: destination,
				capture: context.machine,
				allowFailure: true,
			});
		} catch (error) {
			throw new CreateDeploymentError(
				"로컬 프로젝트는 생성됐지만 deploy 명령을 시작하지 못했습니다.",
				1,
				{
					created: true,
					directory: destination,
					slug: context.project.packageName,
					installed: !context.args.skipInstall,
					checked: !context.args.skipInstall,
					git_initialized: true,
					deploy_requested: true,
				},
				{ cause: error instanceof Error ? error : undefined },
			);
		}
		if (context.machine) {
			if (result.stderr) process.stderr.write(result.stderr);
			const lastLine = result.stdout.trim().split("\n").at(-1);
			try {
				context.deploymentResult = lastLine ? JSON.parse(lastLine) : null;
			} catch {
				context.deploymentResult = {
					error: {
						code: "invalid_deployment_output",
						message: lastLine ?? "deploy output이 없습니다.",
					},
				};
			}
		}
		if (result.exitCode !== 0) {
			throw new CreateDeploymentError(
				"로컬 프로젝트는 생성됐지만 production deploy가 실패했습니다.",
				result.exitCode,
				{
					created: true,
					directory: destination,
					slug: context.project.packageName,
					installed: !context.args.skipInstall,
					checked: !context.args.skipInstall,
					git_initialized: true,
					deploy_requested: true,
					...(context.deploymentResult === undefined
						? {}
						: { deployment: context.deploymentResult }),
				},
			);
		}
	}

	if (!context.machine) {
		const next = [`cd ${context.project.directoryInput}`];
		if (context.args.skipInstall) next.push("pnpm install", "pnpm check");
		next.push("pnpm dev");
		prompts.note(next.join("\n"), "Next");
	}
}
