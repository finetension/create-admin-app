import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { CliError, externalError } from "../core/error.ts";
import { progress } from "../core/logger.ts";
import { runCommand } from "../core/process.ts";

export interface GitHubOwner {
	login: string;
	kind: "user" | "organization";
}

export interface GitHubRepository {
	nameWithOwner: string;
	visibility: "private" | "public";
	url: string;
}

export type GitHubGitProtocol = "https" | "ssh";

export function githubRemoteUrl(
	repository: string,
	protocol: GitHubGitProtocol,
): string {
	return protocol === "ssh"
		? `git@github.com:${repository}.git`
		: `https://github.com/${repository}.git`;
}

export async function resolveGitHubRemoteUrl(
	repository: string,
): Promise<string> {
	const result = await runCommand(
		"gh",
		["config", "get", "git_protocol", "--host", "github.com"],
		{ capture: true, allowFailure: true, ci: false },
	);
	const protocol = result.stdout.trim();
	if (result.exitCode !== 0 || (protocol !== "ssh" && protocol !== "https")) {
		throw externalError(
			"github_git_protocol_unavailable",
			"GitHub CLI의 Git protocol을 확인하지 못했습니다.",
			"gh config set git_protocol ssh --host github.com 또는 https를 설정하세요.",
		);
	}
	return githubRemoteUrl(repository, protocol);
}

export function isTransientGitHubFailure(message: string): boolean {
	return /operation timed out|timed out|timeout|connection reset|connection refused|temporary failure|network is unreachable|unexpected eof|http 5\d\d|status code 5\d\d|bad gateway|service unavailable|gateway timeout/i.test(
		message,
	);
}

export function githubApiFailureHint(message: string): string {
	if (
		/401|403|authentication|bad credentials|not logged|oauth/i.test(message)
	) {
		return "gh auth status를 확인한 뒤 같은 pnpm cli 명령을 다시 실행하세요.";
	}
	return "일시적인 네트워크 또는 GitHub API 오류일 수 있습니다. 같은 pnpm cli 명령을 다시 실행하세요. 반복되면 GitHub 상태와 gh auth status를 확인하세요.";
}

export function isGitHubRepositoryMissing(message: string): boolean {
	return /could not resolve to a repository|repository (?:was )?not found|http 404/i.test(
		message,
	);
}

async function runGitHubJsonCommand(args: string[]) {
	const maximumAttempts = 3;
	for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
		const result = await runCommand("gh", args, {
			capture: true,
			allowFailure: true,
			ci: false,
		});
		if (result.exitCode === 0) {
			return result;
		}

		const message =
			result.stderr.trim() || `gh ${args[0]} 요청이 실패했습니다.`;
		if (!isTransientGitHubFailure(message) || attempt === maximumAttempts) {
			throw externalError(
				"github_api_failed",
				message,
				githubApiFailureHint(message),
			);
		}
		progress(
			`GitHub API가 일시적으로 응답하지 않아 재시도합니다 (${attempt}/${maximumAttempts - 1}).`,
		);
		await delay(attempt * 1_000);
	}
	throw new Error("unreachable");
}

async function ghJson<T>(args: string[], schema: z.ZodType<T>): Promise<T> {
	const result = await runGitHubJsonCommand(args);
	return schema.parse(JSON.parse(result.stdout));
}

export async function verifyGitHubAuthentication(): Promise<void> {
	const result = await runCommand("gh", ["auth", "status"], {
		capture: true,
		allowFailure: true,
		ci: false,
	});
	if (result.exitCode !== 0) {
		throw externalError(
			"github_auth_required",
			"GitHub CLI 인증이 필요합니다.",
			"gh auth login을 실행한 뒤 다시 시도하세요.",
		);
	}
}

export async function listGitHubOwners(): Promise<GitHubOwner[]> {
	await verifyGitHubAuthentication();
	const user = await ghJson(["api", "user"], z.object({ login: z.string() }));
	const organizations = await ghJson(
		["api", "user/orgs", "--paginate", "--slurp"],
		z.array(z.array(z.object({ login: z.string() }))),
	);
	return [
		{ login: user.login, kind: "user" },
		...organizations.flat().map((organization) => ({
			login: organization.login,
			kind: "organization" as const,
		})),
	];
}

export async function inspectGitHubRepository(
	repository: string,
): Promise<GitHubRepository | null> {
	let result: Awaited<ReturnType<typeof runGitHubJsonCommand>>;
	try {
		result = await runGitHubJsonCommand([
			"repo",
			"view",
			repository,
			"--json",
			"nameWithOwner,visibility,url",
		]);
	} catch (error) {
		if (error instanceof CliError && isGitHubRepositoryMissing(error.message)) {
			return null;
		}
		throw error;
	}
	const value = z
		.object({
			nameWithOwner: z.string(),
			visibility: z.enum(["PRIVATE", "PUBLIC"]),
			url: z.string(),
		})
		.parse(JSON.parse(result.stdout));
	return {
		nameWithOwner: value.nameWithOwner,
		visibility: value.visibility.toLowerCase() as "private" | "public",
		url: value.url,
	};
}

export async function createGitHubRepository(
	repository: string,
	visibility: "private" | "public",
): Promise<void> {
	await runCommand(
		"gh",
		[
			"repo",
			"create",
			repository,
			visibility === "public" ? "--public" : "--private",
		],
		{ ci: false },
	);
}

export async function updateGitHubRepositoryVisibility(
	repository: string,
	visibility: "private" | "public",
): Promise<void> {
	await runCommand(
		"gh",
		[
			"repo",
			"edit",
			repository,
			"--visibility",
			visibility,
			"--accept-visibility-change-consequences",
		],
		{ ci: false },
	);
}

export async function setRepositorySecret(
	repository: string,
	name:
		| "CLOUDFLARE_API_TOKEN"
		| "GOOGLE_OAUTH_CLIENT_ID"
		| "GOOGLE_OAUTH_CLIENT_SECRET",
	value: string,
): Promise<void> {
	await runCommand("gh", ["secret", "set", name, "--repo", repository], {
		capture: true,
		input: value,
		ci: false,
	});
}

export async function dispatchDeployWorkflow(
	repository: string,
): Promise<void> {
	await runCommand(
		"gh",
		[
			"workflow",
			"run",
			"application-deploy.yml",
			"--repo",
			repository,
			"--ref",
			"main",
		],
		{ ci: false },
	);
}

export async function dispatchDestroyWorkflow(
	repository: string,
	confirm: string,
	includeData: boolean,
): Promise<void> {
	await runCommand(
		"gh",
		[
			"workflow",
			"run",
			"application-destroy.yml",
			"--repo",
			repository,
			"--ref",
			"main",
			"-f",
			"operation=destroy",
			"-f",
			`confirmation=${confirm}`,
			"-f",
			`include_data=${includeData}`,
		],
		{ ci: false },
	);
}

const runSchema = z.object({
	databaseId: z.number(),
	status: z.string(),
	conclusion: z.string().nullable(),
	url: z.string(),
	headSha: z.string(),
});

export type GitHubWorkflowRun = z.output<typeof runSchema>;

export async function listWorkflowRuns(
	repository: string,
	workflow: "application-deploy.yml" | "application-destroy.yml",
): Promise<GitHubWorkflowRun[]> {
	return ghJson(
		[
			"run",
			"list",
			"--repo",
			repository,
			"--workflow",
			workflow,
			"--branch",
			"main",
			"--limit",
			"20",
			"--json",
			"databaseId,status,conclusion,url,headSha",
		],
		z.array(runSchema),
	);
}

export async function findWorkflowRun(
	repository: string,
	workflow: "application-deploy.yml" | "application-destroy.yml",
	headSha: string,
	excludedRunIds: ReadonlySet<number> = new Set(),
): Promise<GitHubWorkflowRun | null> {
	const runs = await listWorkflowRuns(repository, workflow);
	return selectWorkflowRun(runs, headSha, excludedRunIds);
}

export function selectWorkflowRun(
	runs: GitHubWorkflowRun[],
	headSha: string,
	excludedRunIds: ReadonlySet<number> = new Set(),
): GitHubWorkflowRun | null {
	return (
		runs.find(
			(run) => run.headSha === headSha && !excludedRunIds.has(run.databaseId),
		) ?? null
	);
}

const workflowViewSchema = z.object({
	url: z.string(),
	conclusion: z.string().nullable(),
	jobs: z.array(
		z.object({
			name: z.string(),
			conclusion: z.string().nullable(),
			steps: z.array(
				z.object({
					name: z.string(),
					conclusion: z.string().nullable(),
				}),
			),
		}),
	),
});

export function summarizeWorkflowFailure(
	view: z.output<typeof workflowViewSchema>,
) {
	const failedJob =
		view.jobs.find((job) => job.conclusion === "failure") ??
		view.jobs.find((job) => job.conclusion && job.conclusion !== "success");
	const failedStep =
		failedJob?.steps.find((step) => step.conclusion === "failure") ??
		failedJob?.steps.find(
			(step) => step.conclusion && step.conclusion !== "success",
		);
	return {
		actions_url: view.url,
		conclusion: view.conclusion,
		failed_job: failedJob?.name ?? null,
		failed_step: failedStep?.name ?? null,
	};
}

export async function waitForWorkflowRun(
	repository: string,
	runId: number,
	runUrl?: string,
	rerun = "pnpm cli deploy --yes",
): Promise<void> {
	const result = await runCommand(
		"gh",
		["run", "watch", String(runId), "--repo", repository, "--exit-status"],
		{ capture: true, allowFailure: true, ci: false },
	);
	if (result.exitCode !== 0) {
		const viewResult = await runCommand(
			"gh",
			[
				"run",
				"view",
				String(runId),
				"--repo",
				repository,
				"--json",
				"url,conclusion,jobs",
			],
			{ capture: true, allowFailure: true, ci: false },
		);
		const summary =
			viewResult.exitCode === 0
				? summarizeWorkflowFailure(
						workflowViewSchema.parse(JSON.parse(viewResult.stdout)),
					)
				: {
						actions_url: runUrl ?? null,
						conclusion: null,
						failed_job: null,
						failed_step: null,
					};
		throw new CliError(
			"deployment_workflow_failed",
			result.stderr.trim() ||
				result.stdout.trim() ||
				"Application Deploy workflow가 실패했습니다.",
			`gh run view ${runId} --repo ${repository} --log-failed`,
			"external",
			undefined,
			{
				...summary,
				rerun,
			},
		);
	}
}
