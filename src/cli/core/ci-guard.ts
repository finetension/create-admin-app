import { safetyError } from "./error.ts";

export type CiCapability = "deploy" | "destroy";

const capabilityEnvironment: Record<CiCapability, string> = {
	deploy: "PLATFORM_ALLOW_DEPLOY",
	destroy: "PLATFORM_ALLOW_DESTROY",
};

const allowedEvents: Record<CiCapability, ReadonlySet<string>> = {
	deploy: new Set(["push", "workflow_dispatch"]),
	destroy: new Set(["workflow_dispatch"]),
};

export function assertGitHubActionsCapability(
	capability: CiCapability,
	environment: NodeJS.ProcessEnv = process.env,
): void {
	const capabilityVariable = capabilityEnvironment[capability];
	const event = environment.GITHUB_EVENT_NAME ?? "";
	const valid =
		environment.GITHUB_ACTIONS === "true" &&
		environment.GITHUB_REF === "refs/heads/main" &&
		allowedEvents[capability].has(event) &&
		environment[capabilityVariable] === "1";
	if (!valid) {
		throw safetyError(
			"actions_capability_required",
			`${capability}은 보호된 GitHub Actions main workflow에서만 실행할 수 있습니다. 필요한 capability: ${capabilityVariable}`,
			`GITHUB_ACTIONS, GITHUB_REF, GITHUB_EVENT_NAME과 ${capabilityVariable}를 가진 문서화된 workflow를 사용하세요.`,
		);
	}
}
