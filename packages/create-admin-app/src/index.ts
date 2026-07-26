#!/usr/bin/env node
import * as prompts from "@clack/prompts";
import { defineCommand, runCommand, runMain } from "citty";
import { hasTTY, isAgent, isCI } from "std-env";
import packageJson from "../package.json" with { type: "json" };
import {
	createArgs,
	normalizePnpmCreateArgs,
	resolveCreateOptions,
} from "./cli/args.js";
import { createContext } from "./cli/context.js";
import { CreateCliError } from "./cli/error.js";
import { createProject } from "./core/create.js";
import { CreateDeploymentError } from "./phases/finalize.js";

const main = defineCommand({
	meta: {
		name: "create-admin-app",
		version: packageJson.version,
		description:
			"Create an independent Cloudflare-native internal management system",
	},
	args: createArgs,
	async run({ args }) {
		const options = resolveCreateOptions(args);
		const machine =
			options.json || (!options.interactive && (!hasTTY || isCI || isAgent));
		if (!machine) prompts.intro("Create Admin App");
		const context = await createContext(options);
		await createProject(context);
		const result = {
			created: true,
			directory: context.project.destination,
			slug: context.project.packageName,
			installed: !options.skipInstall,
			checked: !options.skipInstall,
			git_initialized: true,
			deploy_requested: options.deploy,
			...(context.deploymentResult === undefined
				? {}
				: { deployment: context.deploymentResult }),
		};
		if (machine) process.stdout.write(`${JSON.stringify(result)}\n`);
		else prompts.outro("프로젝트 생성이 완료됐습니다.");
	},
});

function structuredError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	if (error instanceof CreateDeploymentError) {
		return {
			exitCode: error.exitCode,
			value: {
				...error.partialResult,
				error: {
					code: "deployment_failed",
					message,
					hint: "생성된 프로젝트에서 pnpm cli deploy를 다시 실행하세요.",
				},
			},
		};
	}
	if (error instanceof CreateCliError) {
		return {
			exitCode: error.exitCode,
			value: {
				error: {
					code: error.code,
					message: error.message,
					hint: error.hint,
					...(error.details === undefined ? {} : { details: error.details }),
				},
			},
		};
	}
	const usage = /옵션|인자|디렉터리|--|입력|TTY|emails|message/i.test(message);
	return {
		exitCode: usage ? 2 : 1,
		value: {
			error: {
				code: usage ? "invalid_usage" : "creation_failed",
				message,
				hint: usage
					? "pnpm create @finetension/admin-app --help로 입력을 확인하세요."
					: "오류를 수정한 뒤 같은 생성 명령을 다시 실행하세요.",
			},
		},
	};
}

export async function runCreateCli(
	rawArgs = process.argv.slice(2),
): Promise<void> {
	const commandArgs = normalizePnpmCreateArgs(rawArgs);
	if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
		await runMain(main, { rawArgs: commandArgs });
		return;
	}
	if (
		commandArgs.length === 1 &&
		(commandArgs[0] === "--version" || commandArgs[0] === "-v")
	) {
		process.stdout.write(`${packageJson.version}\n`);
		return;
	}
	try {
		await runCommand(main, { rawArgs: commandArgs });
	} catch (error) {
		const output = structuredError(error);
		process.exitCode = output.exitCode;
		const machine =
			commandArgs.includes("--json") || !hasTTY || isCI || isAgent;
		if (machine) process.stdout.write(`${JSON.stringify(output.value)}\n`);
		else prompts.cancel(output.value.error.message);
	}
}

await runCreateCli();
