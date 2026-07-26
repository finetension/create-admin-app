import { defineCommand } from "citty";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../core/runtime.ts";
import { buildProject } from "../project/build.ts";

export default defineCommand({
	meta: {
		name: "build",
		description: "React, Cloudflare Worker와 통합 CLI를 빌드합니다.",
	},
	args: commonOutputArgs,
	async run() {
		await buildProject();
		if (cliRuntime().machine) writeCliResult({ built: true });
	},
});
