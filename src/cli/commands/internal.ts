import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "internal",
		description: "GitHub Actions 전용 Cloudflare mutation 명령입니다.",
		hidden: true,
	},
	subCommands: {
		deploy: () =>
			import("./internal/deploy.ts").then((module) => module.default),
		destroy: () =>
			import("./internal/destroy.ts").then((module) => module.default),
	},
});
