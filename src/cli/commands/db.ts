import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "db",
		description: "로컬 및 운영 D1 작업을 실행합니다.",
	},
	subCommands: {
		export: () => import("./db/export.ts").then((module) => module.default),
		import: () => import("./db/import.ts").then((module) => module.default),
		migrate: () => import("./db/migrate.ts").then((module) => module.default),
		reset: () => import("./db/reset.ts").then((module) => module.default),
		seed: () => import("./db/seed.ts").then((module) => module.default),
	},
});
