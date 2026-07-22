import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "lifecycle",
		description: "Git으로 추적하는 인프라 생명주기를 관리합니다.",
	},
	subCommands: {
		"mark-deployed": () =>
			import("./lifecycle/mark-deployed.ts").then((module) => module.default),
	},
});
