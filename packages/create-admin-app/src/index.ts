#!/usr/bin/env node
import * as prompts from "@clack/prompts";
import { defineCommand, runMain } from "citty";
import packageJson from "../package.json" with { type: "json" };
import { createArgs, resolveCreateOptions } from "./cli/args.js";
import { createContext } from "./cli/context.js";
import { createProject } from "./core/create.js";

const main = defineCommand({
	meta: {
		name: "create-admin-app",
		version: packageJson.version,
		description:
			"Create a Cloudflare-native internal management system scaffold",
	},
	args: createArgs,
	async run({ args }) {
		try {
			const options = resolveCreateOptions(args);
			prompts.intro("Create Admin App");
			const context = await createContext(options);
			await createProject(context);
			prompts.outro("프로젝트 생성이 완료됐습니다.");
		} catch (error: unknown) {
			prompts.cancel(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
	},
});

await runMain(main);
