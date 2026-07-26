import { defineCommand } from "citty";
import { runPnpm } from "../core/process.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../core/runtime.ts";

export default defineCommand({
	meta: {
		name: "check",
		description: "types, lint, secret scan, tests와 build를 실행합니다.",
	},
	args: commonOutputArgs,
	async run() {
		await runPnpm(["run", "validate"], { ci: false });
		if (cliRuntime().machine) writeCliResult({ valid: true });
	},
});
