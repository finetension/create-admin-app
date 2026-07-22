import { defineCommand, runMain } from "citty";
import packageJson from "../../package.json" with { type: "json" };

const main = defineCommand({
	meta: {
		name: "cli",
		version: packageJson.version,
		description: "Cloudflare Management System scaffold CLI",
	},
	subCommands: {
		init: () => import("./commands/init.ts").then((module) => module.default),
		dev: () => import("./commands/dev.ts").then((module) => module.default),
		build: () => import("./commands/build.ts").then((module) => module.default),
		check: () => import("./commands/check.ts").then((module) => module.default),
		doctor: () =>
			import("./commands/doctor.ts").then((module) => module.default),
		status: () =>
			import("./commands/status.ts").then((module) => module.default),
		logs: () => import("./commands/logs.ts").then((module) => module.default),
		deploy: () =>
			import("./commands/deploy.ts").then((module) => module.default),
		lifecycle: () =>
			import("./commands/lifecycle.ts").then((module) => module.default),
		destroy: () =>
			import("./commands/destroy.ts").then((module) => module.default),
		db: () => import("./commands/db.ts").then((module) => module.default),
	},
});

await runMain(main);
