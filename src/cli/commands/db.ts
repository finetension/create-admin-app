import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "db",
		description: "첫 배포 전 local D1 migrate, seed와 reset을 실행합니다.",
	},
	subCommands: {
		migrate: () => import("./db/migrate.ts").then((module) => module.default),
		reset: () => import("./db/reset.ts").then((module) => module.default),
		seed: () => import("./db/seed.ts").then((module) => module.default),
	},
});
