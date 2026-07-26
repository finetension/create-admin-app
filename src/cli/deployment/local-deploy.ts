import { setTimeout as delay } from "node:timers/promises";
import * as prompts from "@clack/prompts";
import open from "open";
import { isCI } from "std-env";
import { promptForToken } from "../auth/cloudflare.ts";
import {
	type CloudflareAccount,
	type CloudflareZone,
	inspectZeroTrustOrganization,
	listCloudflareAccounts,
	listCloudflareZones,
	verifyCloudflareCapabilities,
	type ZeroTrustInspection,
	zeroTrustOnboardingUrl,
} from "../cloudflare/discovery.ts";
import { resolveWorkersDevSubdomain } from "../cloudflare/workers.ts";
import {
	assertCloudflareAccountMayChange,
	loadOptionalUserDefaults,
	loadProjectConfig,
	type ProjectConfig,
	parseProjectConfig,
	type RepositoryVisibility,
	writeProjectConfig,
	writeUserDefaults,
} from "../core/config.ts";
import {
	readStoredCloudflareCredentials,
	resolveCloudflareApiToken,
	storeCloudflareCredentials,
} from "../core/credentials.ts";
import {
	CliError,
	configurationError,
	externalError,
	safetyError,
	usageError,
} from "../core/error.ts";
import { loadInfrastructureLifecycle } from "../core/lifecycle.ts";
import { progress } from "../core/logger.ts";
import { runCommand, runPnpm } from "../core/process.ts";
import { cliRuntime, writeCliResult } from "../core/runtime.ts";
import {
	createGitHubRepository,
	dispatchDeployWorkflow,
	findWorkflowRun,
	type GitHubOwner,
	inspectGitHubRepository,
	listGitHubOwners,
	listWorkflowRuns,
	resolveGitHubRemoteUrl,
	setRepositorySecret,
	updateGitHubRepositoryVisibility,
	waitForWorkflowRun,
} from "./github.ts";

export interface LocalDeployOptions {
	githubOwner?: string;
	githubRepository?: string;
	visibility?: RepositoryVisibility;
	cloudflareAccountId?: string;
	workersDev?: boolean;
	domain?: string;
	subdomain?: string;
	yes?: boolean;
	message?: string;
	dryRun?: boolean;
	reconfigure?: boolean;
}

interface ResolvedDeployTarget {
	config: ProjectConfig;
	repository: string;
	visibility: RepositoryVisibility;
	account: CloudflareAccount;
	token: string;
	tokenFromEnvironment: boolean;
	zones: CloudflareZone[];
	zeroTrust: ZeroTrustInspection;
	hostname: string;
}

function answer<T>(value: T | symbol): T {
	if (prompts.isCancel(value)) {
		throw usageError(
			"cancelled",
			"사용자가 작업을 취소했습니다.",
			"준비가 되면 같은 명령을 다시 실행하세요.",
		);
	}
	return value as T;
}

async function commandAvailable(
	command: string,
	args: string[],
): Promise<void> {
	const result = await runCommand(command, args, {
		capture: true,
		allowFailure: true,
		ci: false,
	});
	if (result.exitCode !== 0) {
		throw configurationError(
			"missing_dependency",
			`${command} 명령을 실행할 수 없습니다.`,
			`${command}을 설치하고 PATH를 확인한 뒤 다시 실행하세요.`,
		);
	}
}

async function readGitValue(args: string[]): Promise<string> {
	const result = await runCommand("git", args, {
		capture: true,
		allowFailure: true,
		ci: false,
	});
	return result.exitCode === 0 ? result.stdout.trim() : "";
}

export function normalizeGitHubRemote(remote: string): string | undefined {
	const match = remote.match(
		/(?:github\.com[/:])([^/]+)\/([^/\s]+?)(?:\.git)?$/,
	);
	return match?.[1] && match[2] ? `${match[1]}/${match[2]}` : undefined;
}

function chooseConfiguredValue<T>(
	label: string,
	current: T | undefined,
	requested: T | undefined,
	reconfigure: boolean,
): T | undefined {
	if (
		current !== undefined &&
		requested !== undefined &&
		current !== requested &&
		!reconfigure
	) {
		throw configurationError(
			"reconfigure_required",
			`${label} option이 config.toml과 충돌합니다.`,
			"대상을 바꾸려면 --reconfigure를 명시하세요.",
		);
	}
	return requested ?? current;
}

async function selectOwner(
	owners: GitHubOwner[],
	preferred: string | undefined,
): Promise<string> {
	if (preferred) {
		if (!owners.some((owner) => owner.login === preferred)) {
			throw configurationError(
				"github_owner_unavailable",
				`GitHub owner ${preferred}에 저장소를 만들 권한이 없습니다.`,
				"gh 인증 계정과 owner 값을 확인하세요.",
			);
		}
		return preferred;
	}
	if (cliRuntime().machine) {
		throw configurationError(
			"missing_github_owner",
			"GitHub owner를 결정할 수 없습니다.",
			"config.toml, --github-owner 또는 CREATE_ADMIN_APP_GITHUB_OWNER를 설정하세요.",
		);
	}
	return answer(
		await prompts.autocomplete({
			message: "GitHub 저장소 소유자",
			options: owners.map((owner) => ({
				value: owner.login,
				label: owner.login,
				hint: owner.kind,
			})),
		}),
	);
}

async function resolveToken(accountId?: string): Promise<{
	token: string;
	fromEnvironment: boolean;
	fromStored: boolean;
}> {
	const environmentToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
	if (environmentToken) {
		return {
			token: environmentToken,
			fromEnvironment: true,
			fromStored: false,
		};
	}
	const stored = resolveCloudflareApiToken(accountId);
	if (stored) {
		return { token: stored, fromEnvironment: false, fromStored: true };
	}
	if (cliRuntime().machine) {
		throw configurationError(
			"missing_cloudflare_token",
			"Cloudflare Account API Token이 없습니다.",
			"TTY에서 pnpm cli deploy --interactive를 실행해 token을 저장하세요.",
		);
	}
	return {
		token: await promptForToken(),
		fromEnvironment: false,
		fromStored: false,
	};
}

async function selectAccount(
	accounts: CloudflareAccount[],
	preferred: string | undefined,
): Promise<CloudflareAccount> {
	const preferredAccount = preferred
		? accounts.find((account) => account.id === preferred)
		: undefined;
	if (preferred && !preferredAccount) {
		throw configurationError(
			"cloudflare_account_unavailable",
			`Cloudflare account ${preferred}를 token으로 조회할 수 없습니다.`,
			"account ID와 token scope를 확인하세요.",
		);
	}
	if (preferredAccount) return preferredAccount;
	if (accounts.length === 1 && accounts[0]) return accounts[0];
	if (cliRuntime().machine) {
		throw configurationError(
			"missing_cloudflare_account",
			"Cloudflare account를 결정할 수 없습니다.",
			"config.toml, --cloudflare-account-id 또는 CREATE_ADMIN_APP_CLOUDFLARE_ACCOUNT_ID를 설정하세요.",
		);
	}
	const id = answer(
		await prompts.autocomplete({
			message: "Cloudflare account",
			options: accounts.map((account) => ({
				value: account.id,
				label: account.name,
				hint: account.id,
			})),
		}),
	);
	const account = accounts.find((item) => item.id === id);
	if (!account) {
		throw configurationError(
			"cloudflare_account_unavailable",
			"선택한 Cloudflare account를 찾지 못했습니다.",
			"같은 명령을 다시 실행하세요.",
		);
	}
	return account;
}

async function resolveZeroTrust(
	token: string,
	accountId: string,
): Promise<ZeroTrustInspection> {
	let organization = await inspectZeroTrustOrganization(token, accountId);
	if (organization.exists) return organization;
	const url = zeroTrustOnboardingUrl(accountId);
	if (cliRuntime().machine) {
		throw configurationError(
			"cloudflare_zero_trust_setup_required",
			"선택한 Cloudflare account에 Zero Trust organization이 없습니다.",
			`${url}에서 team name과 plan을 설정한 뒤 같은 deploy 명령을 다시 실행하세요.`,
		);
	}
	await open(url);
	const ready = answer(
		await prompts.confirm({
			message: "Zero Trust team name과 plan 설정을 완료했나요?",
			initialValue: false,
		}),
	);
	if (!ready) {
		throw configurationError(
			"cloudflare_zero_trust_setup_required",
			"Zero Trust organization 설정이 필요합니다.",
			`${url}에서 설정을 완료한 뒤 같은 명령을 다시 실행하세요.`,
		);
	}
	organization = await inspectZeroTrustOrganization(token, accountId);
	if (!organization.exists) {
		throw configurationError(
			"cloudflare_zero_trust_setup_required",
			"Zero Trust organization을 아직 확인하지 못했습니다.",
			`${url}에서 설정 상태를 확인한 뒤 같은 명령을 다시 실행하세요.`,
		);
	}
	return organization;
}

function routeConfig(
	accountId: string,
	workersDev: boolean,
	domain?: string,
	subdomain?: string,
): NonNullable<ProjectConfig["cloudflare"]> {
	return workersDev
		? { account_id: accountId, workers_dev: true }
		: {
				account_id: accountId,
				domain: domain as string,
				subdomain,
			};
}

async function resolveRoute(
	project: ProjectConfig,
	zones: CloudflareZone[],
	options: LocalDeployOptions,
): Promise<{
	workersDev: boolean;
	domain?: string;
	subdomain?: string;
	hostname: string;
}> {
	const current = project.cloudflare;
	const requestedDomain = chooseConfiguredValue(
		"Cloudflare domain",
		current?.domain,
		options.domain?.trim().toLowerCase(),
		options.reconfigure ?? false,
	);
	const explicitWorkersDev = options.workersDev === true;
	if (explicitWorkersDev && options.domain) {
		throw usageError(
			"conflicting_route",
			"--workers-dev와 --domain은 함께 사용할 수 없습니다.",
			"둘 중 하나만 선택하세요.",
		);
	}
	if (options.subdomain && !options.domain && !current?.domain) {
		throw usageError(
			"domain_required",
			"--subdomain은 --domain과 함께 사용해야 합니다.",
			"--domain <zone>을 함께 지정하세요.",
		);
	}
	const routeKindChanged =
		(current?.workers_dev === true && Boolean(options.domain)) ||
		(Boolean(current?.domain) && explicitWorkersDev);
	if (routeKindChanged && !options.reconfigure) {
		throw configurationError(
			"reconfigure_required",
			"선택한 route가 config.toml의 현재 route와 다릅니다.",
			"route를 바꾸려면 --reconfigure를 명시하세요.",
		);
	}
	let workersDev = current?.workers_dev === true || explicitWorkersDev;
	let domain = requestedDomain;
	if (options.domain) workersDev = false;
	if (explicitWorkersDev) domain = undefined;
	if (
		!current &&
		!options.domain &&
		!explicitWorkersDev &&
		!cliRuntime().machine
	) {
		const route = answer(
			await prompts.autocomplete({
				message: "배포 주소",
				initialValue: "workers-dev",
				options: [
					{
						value: "workers-dev",
						label: "workers.dev",
						hint: "도메인 없이 바로 배포",
					},
					...zones.map((zone) => ({
						value: `zone:${zone.name}`,
						label: zone.name,
						hint: "custom domain",
					})),
				],
			}),
		);
		workersDev = route === "workers-dev";
		domain = route.startsWith("zone:") ? route.slice(5) : undefined;
	}
	if (!current && !domain) workersDev = true;
	if (domain && !zones.some((zone) => zone.name === domain)) {
		throw configurationError(
			"cloudflare_zone_unavailable",
			`${domain} Zone을 선택한 account에서 찾지 못했습니다.`,
			"--domain 값을 조회 가능한 active Zone으로 변경하세요.",
		);
	}
	const subdomain = domain
		? (options.subdomain ??
			current?.subdomain ??
			(cliRuntime().machine
				? project.project.slug
				: answer(
						await prompts.text({
							message: `${domain} 앞에 사용할 subdomain`,
							initialValue: project.project.slug,
						}),
					).trim()))
		: undefined;
	return {
		workersDev,
		...(domain ? { domain } : {}),
		...(subdomain ? { subdomain } : {}),
		hostname: domain
			? `${subdomain ?? project.project.slug}.${domain}`
			: `${project.project.slug}.workers.dev`,
	};
}

async function resolveTarget(
	options: LocalDeployOptions,
): Promise<ResolvedDeployTarget> {
	await Promise.all([
		commandAvailable("git", ["--version"]),
		commandAvailable("pnpm", ["--version"]),
		commandAvailable("gh", ["--version"]),
	]);
	const branch = await readGitValue(["branch", "--show-current"]);
	if (branch !== "main") {
		throw safetyError(
			"main_branch_required",
			`배포는 main branch에서만 실행할 수 있습니다. 현재 branch: ${branch || "detached"}`,
			"변경을 정리하고 main branch로 전환하세요.",
		);
	}
	const [project, defaults, lifecycle, owners, originUrl] = await Promise.all([
		loadProjectConfig(),
		loadOptionalUserDefaults(),
		loadInfrastructureLifecycle(),
		listGitHubOwners(),
		readGitValue(["remote", "get-url", "origin"]),
	]);
	const originRepository = normalizeGitHubRemote(originUrl);
	const [originOwner, originName] = originRepository?.split("/") ?? [];
	const requestedOwner =
		options.githubOwner ??
		(project.github?.owner
			? undefined
			: (originOwner ??
				process.env.CREATE_ADMIN_APP_GITHUB_OWNER?.trim() ??
				defaults.github?.owner));
	const configuredOwner = chooseConfiguredValue(
		"GitHub owner",
		project.github?.owner,
		requestedOwner,
		options.reconfigure ?? false,
	);
	const owner = await selectOwner(owners, configuredOwner);
	const repositoryName =
		chooseConfiguredValue(
			"GitHub repository",
			project.github?.repository,
			options.githubRepository,
			options.reconfigure ?? false,
		) ??
		originName ??
		project.project.slug;
	const repository = `${owner}/${repositoryName}`;
	if (
		originRepository &&
		originRepository !== repository &&
		!options.reconfigure
	) {
		throw configurationError(
			"origin_mismatch",
			`origin ${originRepository}이 선택한 repository ${repository}와 다릅니다.`,
			"대상을 바꾸려면 --reconfigure를 명시하세요.",
		);
	}
	const existingRepository = await inspectGitHubRepository(repository);
	const visibility =
		chooseConfiguredValue(
			"GitHub visibility",
			project.github?.visibility,
			options.visibility,
			options.reconfigure ?? false,
		) ??
		existingRepository?.visibility ??
		"private";
	if (
		existingRepository &&
		existingRepository.visibility !== visibility &&
		!options.reconfigure
	) {
		throw configurationError(
			"github_visibility_mismatch",
			`기존 repository visibility는 ${existingRepository.visibility}입니다.`,
			"config.toml을 실제 상태와 맞추거나 --reconfigure로 계획을 다시 확인하세요.",
		);
	}

	const requestedAccountId =
		options.cloudflareAccountId ??
		(project.cloudflare?.account_id
			? undefined
			: (process.env.CREATE_ADMIN_APP_CLOUDFLARE_ACCOUNT_ID?.trim() ??
				defaults.cloudflare?.account_id ??
				readStoredCloudflareCredentials()?.accountId));
	const preferredAccountId = chooseConfiguredValue(
		"Cloudflare account",
		project.cloudflare?.account_id,
		requestedAccountId,
		options.reconfigure ?? false,
	);
	let credential = await resolveToken(preferredAccountId);
	let accounts: CloudflareAccount[];
	try {
		accounts = await listCloudflareAccounts(credential.token);
	} catch (error) {
		if (!credential.fromStored || cliRuntime().machine) throw error;
		const replace = answer(
			await prompts.confirm({
				message:
					"저장된 Cloudflare token을 사용할 수 없습니다. 새 token으로 교체할까요?",
				initialValue: true,
			}),
		);
		if (!replace) throw error;
		credential = {
			token: await promptForToken(),
			fromEnvironment: false,
			fromStored: false,
		};
		accounts = await listCloudflareAccounts(credential.token);
	}
	let account = await selectAccount(accounts, preferredAccountId);
	assertCloudflareAccountMayChange(
		project.cloudflare?.account_id,
		account.id,
		lifecycle.production,
	);
	try {
		await verifyCloudflareCapabilities(credential.token, account.id);
	} catch (error) {
		if (!credential.fromStored || cliRuntime().machine) throw error;
		const replace = answer(
			await prompts.confirm({
				message:
					"저장된 Cloudflare token 권한이 부족합니다. 새 token으로 교체할까요?",
				initialValue: true,
			}),
		);
		if (!replace) throw error;
		credential = {
			token: await promptForToken(),
			fromEnvironment: false,
			fromStored: false,
		};
		accounts = await listCloudflareAccounts(credential.token);
		account = await selectAccount(accounts, preferredAccountId);
		assertCloudflareAccountMayChange(
			project.cloudflare?.account_id,
			account.id,
			lifecycle.production,
		);
		await verifyCloudflareCapabilities(credential.token, account.id);
	}
	const [zones, zeroTrust] = await Promise.all([
		listCloudflareZones(credential.token, account.id),
		resolveZeroTrust(credential.token, account.id),
	]);
	const route = await resolveRoute(project, zones, options);
	const hostname = route.workersDev
		? `${project.project.slug}.${await resolveWorkersDevSubdomain(account.id, credential.token)}.workers.dev`
		: route.hostname;
	const config = parseProjectConfig(
		{
			project: project.project,
			github: {
				owner,
				repository: repositoryName,
				visibility,
			},
			cloudflare: routeConfig(
				account.id,
				route.workersDev,
				route.domain,
				route.subdomain,
			),
		},
		"resolved deploy config",
	);
	return {
		config,
		repository,
		visibility,
		account,
		token: credential.token,
		tokenFromEnvironment: credential.fromEnvironment,
		zones,
		zeroTrust,
		hostname,
	};
}

async function gitStatusFiles(): Promise<string[]> {
	const output = await readGitValue(["status", "--porcelain"]);
	return output
		.split("\n")
		.filter(Boolean)
		.map((line) => line.slice(3));
}

export function assertSafeCommitPaths(paths: string[]): void {
	const sensitive = paths.filter((path) => {
		const name = path.split("/").at(-1)?.toLowerCase() ?? "";
		return (
			name === ".npmrc" ||
			name === ".pypirc" ||
			name === "id_rsa" ||
			name === "id_ed25519" ||
			name.startsWith(".env") ||
			name.startsWith(".dev.vars") ||
			/\.(?:key|pem|p12|pfx)$/.test(name)
		);
	});
	if (sensitive.length > 0) {
		throw safetyError(
			"sensitive_file_commit_forbidden",
			`자동 commit 대상에 민감 파일이 포함되어 있습니다: ${sensitive.join(", ")}`,
			"민감 파일을 Git 추적에서 제거하고 OS credential store 또는 repository secret을 사용하세요.",
		);
	}
}

async function currentHead(): Promise<string> {
	return readGitValue(["rev-parse", "HEAD"]);
}

export function isWorkflowIndexingDelay(error: unknown): boolean {
	return (
		error instanceof Error &&
		/HTTP 404: workflow .+ not found on the default branch/i.test(error.message)
	);
}

export function classifyRemoteMain(
	localHead: string,
	remoteHead: string | undefined,
	localIsAncestor: boolean,
	remoteIsAncestor: boolean,
): "push" | "dispatch" | "fast-forward" | "diverged" {
	if (!remoteHead) return "push";
	if (remoteHead === localHead) return "dispatch";
	if (localIsAncestor) return "fast-forward";
	return remoteIsAncestor ? "push" : "diverged";
}

async function waitForDiscoveredRun(
	repository: string,
	headSha: string,
	excludedRunIds: ReadonlySet<number> = new Set(),
): Promise<NonNullable<Awaited<ReturnType<typeof findWorkflowRun>>>> {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		try {
			const run = await findWorkflowRun(
				repository,
				"application-deploy.yml",
				headSha,
				excludedRunIds,
			);
			if (run) return run;
		} catch (error) {
			if (!isWorkflowIndexingDelay(error)) throw error;
		}
		await delay(2_000);
	}
	throw externalError(
		"deployment_workflow_not_found",
		"시작한 Application Deploy workflow run을 찾지 못했습니다.",
		`gh run list --repo ${repository} --workflow application-deploy.yml`,
	);
}

export async function runLocalDeploy(
	options: LocalDeployOptions,
): Promise<void> {
	progress("배포 사전 조건과 원격 대상을 읽기 전용으로 확인합니다.");
	const target = await resolveTarget(options);
	const current = await loadProjectConfig();
	const configChanged =
		JSON.stringify(current) !== JSON.stringify(target.config);
	const existingFiles = await gitStatusFiles();
	assertSafeCommitPaths(existingFiles);
	let message = options.message?.trim();
	if (
		!options.dryRun &&
		(configChanged || existingFiles.length > 0) &&
		!message &&
		!cliRuntime().machine
	) {
		message = answer(
			await prompts.text({
				message: "자동 commit message",
				initialValue: "chore: configure production deployment",
				validate: (value) =>
					value?.trim() ? undefined : "message를 입력하세요.",
			}),
		).trim();
	}
	if (
		!options.dryRun &&
		(configChanged || existingFiles.length > 0) &&
		!message &&
		cliRuntime().machine
	) {
		throw usageError(
			"commit_message_required",
			"배포 전에 commit할 변경이 있어 --message가 필요합니다.",
			'--message "feat: deploy my-company"를 추가하세요.',
		);
	}
	const plan = {
		command: "deploy",
		dry_run: options.dryRun ?? false,
		github: {
			repository: target.repository,
			visibility: target.visibility,
		},
		cloudflare: {
			account_id: target.account.id,
			account_name: target.account.name,
			hostname: target.hostname,
			route: target.config.cloudflare?.workers_dev
				? "workers.dev"
				: "custom-domain",
			zero_trust: target.zeroTrust.exists ? "ready" : "missing",
			one_time_pin: target.zeroTrust.oneTimePin ? "ready" : "will-create",
		},
		allowed_emails: target.config.project.allowed_emails,
		files: [
			...new Set([...existingFiles, ...(configChanged ? ["config.toml"] : [])]),
		],
		commit_message: message ?? null,
		repository_secret: "CLOUDFLARE_API_TOKEN",
		credential_store:
			target.tokenFromEnvironment || isCI ? "unchanged" : "save_after_approval",
		workflow: "application-deploy.yml",
		secret_ignore_changed: [
			...new Set([...existingFiles, ...(configChanged ? ["config.toml"] : [])]),
		].includes(".secretlintignore"),
		warnings: [
			...(target.visibility === "public"
				? [
						"public repository에서는 source, 허용 이메일과 Actions 실행 기록이 공개됩니다.",
					]
				: []),
			...(target.config.cloudflare?.workers_dev
				? [
						"Cloudflare는 business-critical production에 custom domain 또는 route를 권장합니다.",
					]
				: []),
			...(options.dryRun &&
			(configChanged || existingFiles.length > 0) &&
			!message
				? ["실제 배포에는 비어 있지 않은 --message가 필요합니다."]
				: []),
			...(existingFiles.includes(".secretlintignore")
				? [
						".secretlintignore 변경이 포함됩니다. 예외 범위와 사유를 별도로 검토하세요.",
					]
				: []),
		],
	};
	if (cliRuntime().machine) {
		if (options.dryRun) writeCliResult(plan);
		else progress(JSON.stringify({ plan }));
	} else {
		prompts.note(JSON.stringify(plan, null, 2), "Production deploy plan");
	}
	if (options.dryRun) return;
	if (cliRuntime().machine && !options.yes) {
		throw new CliError(
			"approval_required",
			"외부 변경을 실행하려면 --yes가 필요합니다.",
			"계획을 검토한 뒤 같은 명령에 --yes를 추가하세요.",
			"safety",
			undefined,
			{ plan },
		);
	}
	if (!cliRuntime().machine) {
		const confirmed = answer(
			await prompts.confirm({
				message: "이 계획대로 GitHub와 Cloudflare 배포를 시작할까요?",
				initialValue: false,
			}),
		);
		if (!confirmed) return;
	}

	if (!isCI && !target.tokenFromEnvironment) {
		storeCloudflareCredentials(target.account.id, target.token);
	}
	if (configChanged) await writeProjectConfig(target.config);
	progress("로컬 검증과 secret 검사를 실행합니다.");
	await runPnpm(["check"], { ci: false });
	await runCommand("git", ["add", "--all"], { ci: false });
	const stagedFiles = (await readGitValue(["diff", "--cached", "--name-only"]))
		.split("\n")
		.filter(Boolean);
	assertSafeCommitPaths(stagedFiles);
	const staged = stagedFiles.join("\n");
	if (staged) {
		if (!message) {
			throw usageError(
				"commit_message_required",
				"검증 뒤 commit할 변경이 있어 --message가 필요합니다.",
				"--message를 추가해 다시 실행하세요.",
			);
		}
		await runCommand("git", ["commit", "-m", message], { ci: false });
	}

	const repositoryState = await inspectGitHubRepository(target.repository);
	if (!repositoryState) {
		progress(`GitHub repository를 생성합니다: ${target.repository}`);
		await createGitHubRepository(target.repository, target.visibility);
	} else if (repositoryState.visibility !== target.visibility) {
		if (!options.reconfigure) {
			throw configurationError(
				"github_visibility_mismatch",
				`기존 repository visibility는 ${repositoryState.visibility}입니다.`,
				"변경하려면 --reconfigure로 계획을 다시 확인하세요.",
			);
		}
		await updateGitHubRepositoryVisibility(
			target.repository,
			target.visibility,
		);
	}
	const preferredRemoteUrl = await resolveGitHubRemoteUrl(target.repository);
	const currentRemoteUrl = await readGitValue(["remote", "get-url", "origin"]);
	const origin = normalizeGitHubRemote(currentRemoteUrl);
	if (!origin) {
		await runCommand("git", ["remote", "add", "origin", preferredRemoteUrl], {
			ci: false,
		});
	} else if (origin !== target.repository) {
		if (!options.reconfigure) {
			throw safetyError(
				"origin_mismatch",
				`origin ${origin}이 배포 대상 ${target.repository}와 다릅니다.`,
				"origin을 검토한 뒤 --reconfigure로 다시 실행하세요.",
			);
		}
		await runCommand(
			"git",
			["remote", "set-url", "origin", preferredRemoteUrl],
			{ ci: false },
		);
	} else if (currentRemoteUrl !== preferredRemoteUrl) {
		await runCommand(
			"git",
			["remote", "set-url", "origin", preferredRemoteUrl],
			{ ci: false },
		);
	}
	progress(
		"Cloudflare token을 GitHub repository Actions secret으로 설정합니다.",
	);
	await setRepositorySecret(target.repository, target.token);
	let headSha = await currentHead();
	let remoteHead = (
		await readGitValue(["ls-remote", "--heads", "origin", "refs/heads/main"])
	)
		.split(/\s+/, 1)
		.at(0);
	if (remoteHead && remoteHead !== headSha) {
		await runCommand("git", ["fetch", "origin", "main"], { ci: false });
		const ancestor = await runCommand(
			"git",
			["merge-base", "--is-ancestor", "HEAD", "origin/main"],
			{ capture: true, allowFailure: true, ci: false },
		);
		const remoteAncestor = await runCommand(
			"git",
			["merge-base", "--is-ancestor", "origin/main", "HEAD"],
			{ capture: true, allowFailure: true, ci: false },
		);
		const remoteAction = classifyRemoteMain(
			headSha,
			remoteHead,
			ancestor.exitCode === 0,
			remoteAncestor.exitCode === 0,
		);
		if (remoteAction === "diverged") {
			throw safetyError(
				"remote_main_diverged",
				"로컬 main과 origin/main이 서로 다른 변경을 가지고 있습니다.",
				"변경을 검토하고 main을 정리한 뒤 deploy를 다시 실행하세요.",
			);
		}
		if (remoteAction === "fast-forward") {
			const sync = await runCommand(
				"git",
				["merge", "--ff-only", "origin/main"],
				{ capture: true, allowFailure: true, ci: false },
			);
			if (sync.exitCode !== 0) {
				throw externalError(
					"remote_main_sync_failed",
					"origin/main을 로컬 main에 fast-forward하지 못했습니다.",
					"git pull --ff-only origin main을 실행한 뒤 deploy를 다시 시도하세요.",
				);
			}
			headSha = await currentHead();
			remoteHead = headSha;
		}
	}
	let excludedRunIds = new Set<number>();
	const remoteAction = classifyRemoteMain(headSha, remoteHead, true, true);
	if (remoteAction === "push") {
		await runCommand("git", ["push", "-u", "origin", "main"], { ci: false });
	} else {
		excludedRunIds = new Set(
			(await listWorkflowRuns(target.repository, "application-deploy.yml"))
				.filter((run) => run.headSha === headSha)
				.map((run) => run.databaseId),
		);
		await dispatchDeployWorkflow(target.repository);
	}
	progress("Application Deploy workflow run을 찾고 완료를 기다립니다.");
	const run = await waitForDiscoveredRun(
		target.repository,
		headSha,
		excludedRunIds,
	);
	await waitForWorkflowRun(target.repository, run.databaseId, run.url);
	await runCommand("git", ["fetch", "origin", "main"], { ci: false });
	const merge = await runCommand("git", ["merge", "--ff-only", "origin/main"], {
		capture: true,
		allowFailure: true,
		ci: false,
	});
	if (merge.exitCode !== 0) {
		throw new CliError(
			"lifecycle_sync_failed",
			"배포는 성공했지만 lifecycle commit을 로컬 main에 fast-forward하지 못했습니다.",
			"git pull --ff-only origin main",
			"external",
			undefined,
			{
				deployed: true,
				local_sync: "failed",
				actions_url: run.url,
				recovery: "git pull --ff-only origin main",
			},
		);
	}
	let defaultsSaved = false;
	let defaultsError: string | undefined;
	if (!isCI) {
		try {
			await writeUserDefaults({
				github: { owner: target.config.github?.owner as string },
				cloudflare: { account_id: target.account.id },
			});
			defaultsSaved = true;
		} catch (error) {
			defaultsError = error instanceof Error ? error.message : String(error);
			progress(`사용자 기본값을 저장하지 못했습니다: ${defaultsError}`);
		}
	}
	const result = {
		deployed: true,
		local_sync: "complete",
		actions_url: run.url,
		production_url: `https://${target.hostname}`,
		defaults_saved: defaultsSaved,
		...(defaultsError ? { defaults_error: defaultsError } : {}),
		plan,
	};
	if (cliRuntime().machine) writeCliResult(result);
	else prompts.outro(`배포 완료: ${result.production_url}`);
}
