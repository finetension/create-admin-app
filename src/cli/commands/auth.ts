import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "auth",
		description: "Cloudflare OS credential을 조회, 교체하거나 삭제합니다.",
	},
	subCommands: {
		status: () => import("./auth/status.ts").then((module) => module.default),
		login: () => import("./auth/login.ts").then((module) => module.default),
		logout: () => import("./auth/logout.ts").then((module) => module.default),
	},
});
