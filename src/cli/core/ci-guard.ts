export type CiCapability =
	| "deploy"
	| "remote database mutation"
	| "infrastructure destruction";

const capabilityEnvironment: Record<CiCapability, string> = {
	deploy: "PLATFORM_ALLOW_DEPLOY",
	"remote database mutation": "PLATFORM_ALLOW_REMOTE_DB_MUTATION",
	"infrastructure destruction": "PLATFORM_ALLOW_DESTROY",
};

export function assertGitHubActionsCapability(
	capability: CiCapability,
	environment: NodeJS.ProcessEnv = process.env,
): void {
	const capabilityVariable = capabilityEnvironment[capability];
	const isGitHubActions =
		environment.CI === "true" && environment.GITHUB_ACTIONS === "true";
	if (!isGitHubActions || environment[capabilityVariable] !== "1") {
		throw new Error(
			`${capability}은(는) 보호된 GitHub Actions에서만 실행할 수 있습니다. ${capabilityVariable}는 로컬 우회 옵션이 아닙니다.`,
		);
	}
}
