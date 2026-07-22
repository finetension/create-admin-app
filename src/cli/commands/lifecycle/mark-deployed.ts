import { defineCommand } from "citty";
import { assertGitHubActionsCapability } from "../../core/ci-guard.ts";
import { markProductionDeployed } from "../../core/lifecycle.ts";
import { logger } from "../../core/logger.ts";

export default defineCommand({
	meta: {
		name: "mark-deployed",
		description: "첫 성공 배포를 Git 추적 생명주기에 기록합니다.",
	},
	async run() {
		assertGitHubActionsCapability("deploy");
		const changed = await markProductionDeployed();
		logger.success(
			changed
				? "production 생명주기를 deployed로 변경했습니다"
				: "production 생명주기는 이미 deployed입니다",
		);
	},
});
