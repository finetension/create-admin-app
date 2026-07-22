import { defineCommand } from "citty";
import { buildProject } from "../project/build.ts";

export default defineCommand({
	meta: {
		name: "build",
		description: "React, Cloudflare Worker와 통합 CLI를 빌드합니다.",
	},
	async run() {
		await buildProject();
	},
});
