import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as prompts from "@clack/prompts";
import type { CreateContext } from "../core/context.js";
import { subdomainFromPackageName } from "../core/project.js";
import { resolveCloudflareSetup } from "../integrations/cloudflare/setup.js";
import { runCommand } from "../lib/process.js";

export function buildInitArgs(context: CreateContext): string[] {
	const args = [
		"cli",
		"init",
		"--name",
		context.project.displayName,
		"--emails",
		context.project.allowedEmails,
		"--force",
	];
	if (context.cloudflare?.domain) {
		args.push("--domain", context.cloudflare.domain);
		if (context.cloudflare.subdomain) {
			args.push("--subdomain", context.cloudflare.subdomain);
		}
	} else {
		args.push("--workers-dev");
	}
	return args;
}

export function createDeployConfig(context: CreateContext): object {
	return {
		...(context.cloudflare?.domain
			? { domain: context.cloudflare.domain }
			: {}),
		...(context.cloudflare?.subdomain
			? { subdomain: context.cloudflare.subdomain }
			: {}),
		name: context.project.displayName,
		allowedEmails: context.project.allowedEmails.split(","),
	};
}

async function initializeGeneratedApp(context: CreateContext): Promise<void> {
	const { destination } = context.project;
	if (!context.args.skipInstall) {
		prompts.log.step("pnpm 의존성을 설치합니다");
		await runCommand("pnpm", ["install"], { cwd: destination });
		await runCommand("pnpm", buildInitArgs(context), { cwd: destination });
		return;
	}

	await writeFile(
		resolve(destination, "deploy.config.json"),
		`${JSON.stringify(createDeployConfig(context), null, "\t")}\n`,
	);
}

async function initializeGit(destination: string): Promise<void> {
	await runCommand("git", ["init", "-b", "main"], { cwd: destination });
	await runCommand("git", ["add", "--all"], { cwd: destination });
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
		{ cwd: destination },
	);
}

export async function configureProject(context: CreateContext): Promise<void> {
	const cloudflare = await resolveCloudflareSetup({
		interactive: context.interactive,
		...(context.args.cloudflare === undefined
			? {}
			: { explicit: context.args.cloudflare }),
		projectName: subdomainFromPackageName(context.project.packageName),
		...(context.args.domain ? { domain: context.args.domain } : {}),
		...(context.args.subdomain ? { subdomain: context.args.subdomain } : {}),
	});
	if (cloudflare) context.cloudflare = cloudflare;
	await initializeGeneratedApp(context);
	await initializeGit(context.project.destination);
}
