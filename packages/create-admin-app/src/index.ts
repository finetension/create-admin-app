#!/usr/bin/env node
import * as prompts from "@clack/prompts";
import { helpText, parseArgs } from "./cli/args.js";
import { createContext } from "./cli/context.js";
import { createProject } from "./core/create.js";

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(helpText);
		return;
	}

	prompts.intro("Create Admin App");
	const context = await createContext(options);
	await createProject(context);
	prompts.outro("프로젝트 생성이 완료됐습니다.");
}

main().catch((error: unknown) => {
	prompts.cancel(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
