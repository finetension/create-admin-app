import { existsSync } from "node:fs";
import {
	listCloudflareAccounts,
	verifyCloudflareCapabilities,
} from "../cloudflare/discovery.ts";
import { loadProjectConfig } from "../core/config.ts";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { loadInfrastructureLifecycle } from "../core/lifecycle.ts";
import { logger } from "../core/logger.ts";
import { projectPaths, resolveProjectPath } from "../core/paths.ts";
import {
	type CommandResult,
	type RunOptions,
	runCommand,
} from "../core/process.ts";

export type DoctorStatus = "ok" | "warning" | "error";

export interface DoctorCheck {
	id: string;
	status: DoctorStatus;
	code: string;
	message: string;
	hint?: string;
}

export interface DoctorReport {
	checks: DoctorCheck[];
	summary: {
		ok: number;
		warning: number;
		error: number;
	};
}

export interface DoctorOptions {
	configPath?: string;
}

export interface DoctorDependencies {
	nodeVersion: string;
	nodeModulesExists: boolean;
	loadConfig: typeof loadProjectConfig;
	loadLifecycle: typeof loadInfrastructureLifecycle;
	run: (
		command: string,
		args: string[],
		options?: RunOptions,
	) => Promise<CommandResult>;
	resolveToken: typeof resolveCloudflareApiToken;
	listAccounts: typeof listCloudflareAccounts;
	verifyCapabilities: typeof verifyCloudflareCapabilities;
}

function check(
	id: string,
	status: DoctorStatus,
	code: string,
	message: string,
	hint?: string,
): DoctorCheck {
	return { id, status, code, message, ...(hint ? { hint } : {}) };
}

function sanitize(error: unknown): string {
	return (error instanceof Error ? error.message : String(error))
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 300);
}

function parseVersion(value: string): [number, number, number] | null {
	const match = value.trim().match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)/);
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function nodeCheck(version: string): DoctorCheck {
	const parsed = parseVersion(version);
	const supported =
		parsed && (parsed[0] > 22 || (parsed[0] === 22 && parsed[1] >= 13));
	return supported
		? check("node", "ok", "node_supported", version.replace(/^v/, ""))
		: check(
				"node",
				"error",
				"node_unsupported",
				`${version} · Node.js >=22.13.0 required`,
				"지원되는 Node.js LTS 이상으로 전환하세요.",
			);
}

async function commandCheck(
	dependencies: DoctorDependencies,
	id: string,
	command: string,
	args: string[],
	validate?: (value: string) => boolean,
	hint?: string,
): Promise<DoctorCheck> {
	try {
		const result = await dependencies.run(command, args, {
			capture: true,
			allowFailure: true,
			ci: false,
		});
		const value = result.stdout.trim() || result.stderr.trim();
		if (result.exitCode === 0 && (!validate || validate(value))) {
			return check(id, "ok", `${id}_ready`, value.split("\n")[0] ?? "ready");
		}
		return check(
			id,
			"error",
			`${id}_unavailable`,
			value || `${command} failed`,
			hint,
		);
	} catch (error) {
		return check(id, "error", `${id}_unavailable`, sanitize(error), hint);
	}
}

const defaultDependencies: DoctorDependencies = {
	nodeVersion: process.versions.node,
	nodeModulesExists: existsSync(resolveProjectPath("node_modules")),
	loadConfig: loadProjectConfig,
	loadLifecycle: loadInfrastructureLifecycle,
	run: runCommand,
	resolveToken: resolveCloudflareApiToken,
	listAccounts: listCloudflareAccounts,
	verifyCapabilities: verifyCloudflareCapabilities,
};

export async function runDoctor(
	options: DoctorOptions = {},
	overrides: Partial<DoctorDependencies> = {},
): Promise<DoctorReport> {
	const dependencies = { ...defaultDependencies, ...overrides };
	const checks: DoctorCheck[] = [nodeCheck(dependencies.nodeVersion)];
	const [
		pnpm,
		git,
		gh,
		configResult,
		lifecycleResult,
		branch,
		worktree,
		origin,
		gitAuthorName,
		gitAuthorEmail,
		gitProtocol,
	] = await Promise.all([
		commandCheck(
			dependencies,
			"pnpm",
			"pnpm",
			["--version"],
			(value) => parseVersion(value)?.[0] === 11,
			"pnpm 11을 설치하거나 Corepack으로 활성화하세요.",
		),
		commandCheck(
			dependencies,
			"git",
			"git",
			["--version"],
			(value) => {
				const version = parseVersion(value);
				return Boolean(
					version &&
						(version[0] > 2 ||
							(version[0] === 2 &&
								(version[1] > 28 || (version[1] === 28 && version[2] >= 0)))),
				);
			},
			"Git 2.28 이상을 설치하고 PATH를 확인하세요.",
		),
		commandCheck(
			dependencies,
			"gh",
			"gh",
			["--version"],
			undefined,
			"GitHub CLI를 설치하세요.",
		),
		dependencies
			.loadConfig(resolveProjectPath(options.configPath ?? projectPaths.config))
			.then((value) => ({ value }))
			.catch((error: unknown) => ({ error })),
		dependencies
			.loadLifecycle()
			.then((value) => ({ value }))
			.catch((error: unknown) => ({ error })),
		dependencies.run("git", ["branch", "--show-current"], {
			capture: true,
			allowFailure: true,
			ci: false,
		}),
		dependencies.run("git", ["status", "--porcelain"], {
			capture: true,
			allowFailure: true,
			ci: false,
		}),
		dependencies.run("git", ["remote", "get-url", "origin"], {
			capture: true,
			allowFailure: true,
			ci: false,
		}),
		dependencies.run("git", ["config", "--get", "user.name"], {
			capture: true,
			allowFailure: true,
			ci: false,
		}),
		dependencies.run("git", ["config", "--get", "user.email"], {
			capture: true,
			allowFailure: true,
			ci: false,
		}),
		dependencies.run(
			"gh",
			["config", "get", "git_protocol", "--host", "github.com"],
			{
				capture: true,
				allowFailure: true,
				ci: false,
			},
		),
	]);
	checks.push(pnpm, git, gh);
	checks.push(
		dependencies.nodeModulesExists
			? check(
					"dependencies",
					"ok",
					"dependencies_installed",
					"node_modules exists",
				)
			: check(
					"dependencies",
					"error",
					"dependencies_missing",
					"node_modules가 없습니다.",
					"pnpm install을 실행하세요.",
				),
	);

	let config: Awaited<ReturnType<typeof loadProjectConfig>> | undefined;
	if ("error" in configResult) {
		checks.push(
			check(
				"config",
				"error",
				"invalid_config",
				sanitize(configResult.error),
				"config.toml의 section과 key를 문서 예시와 맞추세요.",
			),
		);
	} else {
		config = configResult.value;
		checks.push(check("config", "ok", "config_valid", projectPaths.config));
	}
	if ("error" in lifecycleResult) {
		checks.push(
			check(
				"lifecycle",
				"error",
				"invalid_lifecycle",
				sanitize(lifecycleResult.error),
				"infra/lifecycle.json을 predeploy, deployed 또는 destroyed 상태로 복원하세요.",
			),
		);
	} else {
		checks.push(
			check(
				"lifecycle",
				"ok",
				"lifecycle_valid",
				lifecycleResult.value.production,
			),
		);
	}
	const branchName = branch.stdout.trim();
	checks.push(
		branch.exitCode === 0 && branchName
			? check(
					"branch",
					branchName === "main" ? "ok" : "warning",
					branchName === "main" ? "main_branch" : "non_main_branch",
					branchName,
					branchName === "main"
						? undefined
						: "배포 전 main branch로 전환하세요.",
				)
			: check(
					"branch",
					"error",
					"branch_unavailable",
					"현재 Git branch를 확인할 수 없습니다.",
					"Git repository 상태를 확인하세요.",
				),
	);
	checks.push(
		worktree.stdout.trim()
			? check(
					"worktree",
					"warning",
					"worktree_dirty",
					"commit되지 않은 변경이 있습니다.",
					"deploy가 전체 검증 뒤 제공된 message로 변경을 commit합니다.",
				)
			: check("worktree", "ok", "worktree_clean", "clean"),
	);
	checks.push(
		origin.exitCode === 0
			? check("origin", "ok", "origin_configured", origin.stdout.trim())
			: check(
					"origin",
					"warning",
					"origin_not_configured",
					"origin이 아직 없습니다.",
					"첫 pnpm cli deploy가 repository와 origin을 준비합니다.",
				),
	);
	const authorName = gitAuthorName.stdout.trim();
	const authorEmail = gitAuthorEmail.stdout.trim();
	checks.push(
		gitAuthorName.exitCode === 0 &&
			gitAuthorEmail.exitCode === 0 &&
			authorName &&
			authorEmail
			? check(
					"git_author",
					"ok",
					"git_author_ready",
					`${authorName} <${authorEmail}>`,
				)
			: check(
					"git_author",
					"warning",
					"git_author_missing",
					"자동 deploy commit에 사용할 Git author가 없습니다.",
					"git config --global user.name과 user.email을 설정하세요.",
				),
	);
	const protocol = gitProtocol.stdout.trim();
	checks.push(
		gitProtocol.exitCode === 0 && (protocol === "ssh" || protocol === "https")
			? check("git_protocol", "ok", "github_git_protocol_ready", protocol)
			: check(
					"git_protocol",
					"warning",
					"github_git_protocol_missing",
					"GitHub Git protocol이 설정되지 않았습니다.",
					"gh config set git_protocol ssh --host github.com 또는 https를 설정하세요.",
				),
	);

	if (config?.github?.owner && config.github.repository) {
		const auth = await dependencies.run("gh", ["auth", "status"], {
			capture: true,
			allowFailure: true,
			ci: false,
		});
		checks.push(
			auth.exitCode === 0
				? check("github_auth", "ok", "github_authenticated", "ready")
				: check(
						"github_auth",
						"error",
						"github_auth_required",
						sanitize(auth.stderr),
						"gh auth login을 실행하세요.",
					),
		);
	} else {
		checks.push(
			check(
				"github_auth",
				"ok",
				"github_not_connected",
				"GitHub 연결 전 로컬 프로젝트",
			),
		);
	}

	if (config?.cloudflare) {
		const accountId = config.cloudflare.account_id;
		const token = dependencies.resolveToken(accountId);
		if (!token) {
			checks.push(
				check(
					"cloudflare_auth",
					"error",
					"cloudflare_token_missing",
					"Cloudflare token이 없습니다.",
					"pnpm cli deploy --interactive로 token을 저장하세요.",
				),
			);
		} else {
			try {
				const accounts = await dependencies.listAccounts(token);
				if (!accounts.some((account) => account.id === accountId)) {
					throw new Error("configured account is not visible");
				}
				await dependencies.verifyCapabilities(token, accountId);
				checks.push(
					check("cloudflare_auth", "ok", "cloudflare_token_valid", accountId),
				);
			} catch (error) {
				checks.push(
					check(
						"cloudflare_auth",
						"error",
						"cloudflare_token_invalid",
						sanitize(error),
						"`Write all resources` Account API Token을 다시 확인하세요.",
					),
				);
			}
		}
	} else {
		checks.push(
			check(
				"cloudflare_auth",
				"ok",
				"cloudflare_not_connected",
				"Cloudflare 연결 전 로컬 프로젝트",
			),
		);
	}

	const summary = {
		ok: checks.filter((item) => item.status === "ok").length,
		warning: checks.filter((item) => item.status === "warning").length,
		error: checks.filter((item) => item.status === "error").length,
	};
	return { checks, summary };
}

export function doctorHasIssues(report: DoctorReport, strict = false): boolean {
	return report.summary.error > 0 || (strict && report.summary.warning > 0);
}

export function formatDoctorReport(report: DoctorReport): string {
	return report.checks
		.map(
			(item) =>
				`${item.status.padEnd(7)} ${item.id.padEnd(18)} ${item.message}${item.hint ? ` · ${item.hint}` : ""}`,
		)
		.join("\n");
}

export function printDoctorReport(report: DoctorReport): void {
	logger.box({
		title: "Create Admin App doctor",
		message: formatDoctorReport(report),
	});
}
