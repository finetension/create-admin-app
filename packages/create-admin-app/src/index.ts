#!/usr/bin/env node
import { realpath, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import * as prompts from "@clack/prompts";
import { helpText, parseArgs } from "./args.js";
import {
	listCloudflareAccounts,
	listCloudflareZones,
	verifyCloudflareToken,
} from "./cloudflare.js";
import { storeCloudflareCredentials } from "./credentials.js";
import {
	configureProductionEnvironment,
	createGitHubRepository,
	dispatchFirstDeploy,
	listGitHubOwners,
} from "./github.js";
import { runCommand } from "./process.js";
import {
	copyTemplate,
	ensureDestination,
	setGeneratedPackageName,
} from "./template.js";

interface CloudflareSetup {
	accountId: string;
	accountName: string;
	token: string;
	domain?: string;
	subdomain?: string;
}

function answer<T>(value: T | symbol | undefined): NonNullable<T> {
	if (prompts.isCancel(value)) {
		prompts.cancel("프로젝트 생성을 취소했습니다.");
		process.exit(0);
	}
	if (value === undefined || value === null) {
		throw new Error("입력값을 확인하지 못했습니다.");
	}
	return value as NonNullable<T>;
}

function packageNameFromDirectory(directory: string): string {
	const normalized = basename(directory)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^[._-]+|[._-]+$/g, "");
	return normalized || "admin-app";
}

function displayNameFromPackageName(name: string): string {
	return name
		.split(/[-_.]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function subdomainFromPackageName(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "admin"
	);
}

function normalizeEmails(value: string): string {
	const emails = [
		...new Set(
			value
				.split(/[\n,]+/)
				.map((email) => email.trim().toLowerCase())
				.filter(Boolean),
		),
	];
	if (
		emails.length === 0 ||
		emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
	) {
		throw new Error("올바른 접근 허용 이메일을 하나 이상 입력하세요.");
	}
	return emails.join(",");
}

function validateSubdomain(value?: string): string | undefined {
	return value && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)
		? undefined
		: "영문 소문자, 숫자와 하이픈으로 된 단일 prefix를 입력하세요.";
}

async function resolveCloudflareSetup(
	interactive: boolean,
	explicit: boolean | undefined,
	projectName: string,
	domainOption?: string,
	subdomainOption?: string,
): Promise<CloudflareSetup | undefined> {
	const connect =
		explicit ??
		(interactive
			? answer(
					await prompts.confirm({
						message: "Cloudflare를 지금 연결할까요?",
						initialValue: true,
					}),
				)
			: false);
	if (!connect) return undefined;

	const token =
		process.env.CLOUDFLARE_API_TOKEN?.trim() ||
		(interactive
			? answer(
					await prompts.password({
						message: "Cloudflare account-wide API token",
						validate: (value) =>
							value?.trim() ? undefined : "API token을 입력하세요.",
					}),
				).trim()
			: "");
	if (!token) {
		throw new Error(
			"비대화형 Cloudflare 설정에는 CLOUDFLARE_API_TOKEN이 필요합니다.",
		);
	}

	const spinner = prompts.spinner();
	spinner.start("Cloudflare 계정과 도메인을 조회합니다");
	await verifyCloudflareToken(token);
	const accounts = await listCloudflareAccounts(token);
	spinner.stop("Cloudflare token을 확인했습니다");
	if (accounts.length === 0) {
		throw new Error("이 token으로 접근할 수 있는 Cloudflare 계정이 없습니다.");
	}
	let account = accounts[0];
	if (accounts.length > 1 && interactive) {
		const accountId = answer(
			await prompts.select({
				message: "Cloudflare 계정 선택",
				options: accounts.map((item) => ({
					value: item.id,
					label: item.name,
				})),
			}),
		);
		account = accounts.find((item) => item.id === accountId);
	}
	if (!account) throw new Error("Cloudflare 계정을 선택하지 못했습니다.");

	const zones = await listCloudflareZones(token, account.id);
	let domain = domainOption?.trim().toLowerCase();
	if (domain && !zones.some((zone) => zone.name === domain)) {
		throw new Error(
			`${domain} Zone을 선택한 Cloudflare 계정에서 찾지 못했습니다.`,
		);
	}
	if (!domain && interactive) {
		const route = answer(
			await prompts.select({
				message: "배포 주소 선택",
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
		if (route.startsWith("zone:")) domain = route.slice(5);
	}

	let subdomain = subdomainOption?.trim().toLowerCase();
	if (domain && !subdomain) {
		subdomain = interactive
			? answer(
					await prompts.text({
						message: `${domain} 앞에 사용할 prefix`,
						initialValue: projectName,
						validate: validateSubdomain,
					}),
				).trim()
			: projectName;
	}
	if (subdomain) {
		const error = validateSubdomain(subdomain);
		if (error) throw new Error(error);
	}
	return {
		accountId: account.id,
		accountName: account.name,
		token,
		...(domain ? { domain } : {}),
		...(subdomain ? { subdomain } : {}),
	};
}

async function initializeGeneratedApp(
	destination: string,
	values: {
		name: string;
		emails: string;
		domain?: string;
		subdomain?: string;
	},
	skipInstall: boolean,
): Promise<void> {
	if (!skipInstall) {
		prompts.log.step("pnpm 의존성을 설치합니다");
		await runCommand("pnpm", ["install"], { cwd: destination });
		const args = [
			"cli",
			"init",
			"--name",
			values.name,
			"--emails",
			values.emails,
			"--force",
		];
		if (values.domain) {
			args.push("--domain", values.domain);
			if (values.subdomain) args.push("--subdomain", values.subdomain);
		} else {
			args.push("--workers-dev");
		}
		await runCommand("pnpm", args, { cwd: destination });
		return;
	}

	await writeFile(
		resolve(destination, "deploy.config.json"),
		`${JSON.stringify(
			{
				...(values.domain ? { domain: values.domain } : {}),
				...(values.subdomain ? { subdomain: values.subdomain } : {}),
				name: values.name,
				allowedEmails: values.emails.split(","),
			},
			null,
			"\t",
		)}\n`,
	);
}

async function initializeGit(destination: string): Promise<void> {
	await runCommand("git", ["init", "-b", "main"], { cwd: destination });
	await runCommand("git", ["add", "--all"], { cwd: destination });
	await runCommand(
		"git",
		[
			"-c",
			"user.name=Create Admin App",
			"-c",
			"user.email=create-admin-app@users.noreply.github.com",
			"commit",
			"-m",
			"chore: initialize admin app",
		],
		{ cwd: destination },
	);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(helpText);
		return;
	}
	prompts.intro("Create Admin App");
	const interactive = !options.yes;
	const directoryInput =
		options.directory ??
		(interactive
			? answer(
					await prompts.text({
						message: "프로젝트 디렉터리",
						placeholder: "my-company",
						validate: (value) =>
							value?.trim() ? undefined : "디렉터리를 입력하세요.",
					}),
				)
			: undefined);
	if (!directoryInput) {
		throw new Error("--yes를 사용할 때는 생성할 디렉터리를 지정하세요.");
	}
	const destination = resolve(directoryInput);
	const packageName = packageNameFromDirectory(destination);
	const name =
		options.name ??
		(interactive
			? answer(
					await prompts.text({
						message: "서비스 이름",
						initialValue: displayNameFromPackageName(packageName),
						validate: (value) =>
							value?.trim() ? undefined : "서비스 이름을 입력하세요.",
					}),
				).trim()
			: displayNameFromPackageName(packageName));
	const rawEmails =
		options.emails ??
		(interactive
			? answer(
					await prompts.text({
						message: "접근 허용 이메일 (쉼표로 구분)",
						validate: (value) => {
							try {
								normalizeEmails(value ?? "");
								return undefined;
							} catch (error) {
								return error instanceof Error ? error.message : String(error);
							}
						},
					}),
				)
			: undefined);
	if (!rawEmails) {
		throw new Error("--yes를 사용할 때는 --emails를 지정하세요.");
	}
	const emails = normalizeEmails(rawEmails);
	const cloudflare = await resolveCloudflareSetup(
		interactive,
		options.cloudflare,
		subdomainFromPackageName(packageName),
		options.domain,
		options.subdomain,
	);

	await ensureDestination(destination);
	await copyTemplate(destination);
	await setGeneratedPackageName(destination, packageName, name);
	await initializeGeneratedApp(
		destination,
		{
			name,
			emails,
			...(cloudflare?.domain ? { domain: cloudflare.domain } : {}),
			...(cloudflare?.subdomain ? { subdomain: cloudflare.subdomain } : {}),
		},
		options.skipInstall,
	);
	if (cloudflare) {
		storeCloudflareCredentials(
			await realpath(destination),
			cloudflare.accountId,
			cloudflare.token,
		);
		prompts.log.success(
			`Cloudflare token을 OS credential store에 저장했습니다`,
		);
	}
	await initializeGit(destination);

	const createRemote =
		options.github ??
		(interactive
			? answer(
					await prompts.confirm({
						message: "GitHub 저장소를 생성할까요?",
						initialValue: true,
					}),
				)
			: false);
	let repository: string | undefined;
	if (createRemote) {
		const owners = await listGitHubOwners(destination);
		let owner = owners[0];
		if (owners.length > 1 && interactive) {
			const ownerLogin = answer(
				await prompts.select({
					message: "GitHub 저장소 소유자",
					options: owners.map((item) => ({
						value: item.login,
						label: item.login,
						hint: item.kind,
					})),
				}),
			);
			owner = owners.find((item) => item.login === ownerLogin);
		}
		if (!owner) throw new Error("GitHub 저장소 소유자를 선택하지 못했습니다.");
		repository = await createGitHubRepository(
			destination,
			owner.login,
			packageName,
			options.public,
		);
		if (cloudflare) {
			await configureProductionEnvironment(destination, repository, {
				name,
				emails,
				accountId: cloudflare.accountId,
				token: cloudflare.token,
				...(cloudflare.domain ? { domain: cloudflare.domain } : {}),
				...(cloudflare.subdomain ? { subdomain: cloudflare.subdomain } : {}),
			});
			prompts.log.success("GitHub production Environment를 설정했습니다");
		}
	}

	if (repository && cloudflare) {
		const deploy =
			options.deploy ||
			(interactive &&
				answer(
					await prompts.confirm({
						message: "첫 production 배포를 시작할까요?",
						initialValue: false,
					}),
				));
		if (deploy) await dispatchFirstDeploy(destination, repository);
	}

	const next = [`cd ${directoryInput}`];
	if (options.skipInstall) next.push("pnpm install");
	next.push("pnpm dev");
	prompts.note(
		[
			...next,
			cloudflare
				? `Cloudflare: ${cloudflare.accountName} · ${cloudflare.domain ? `${cloudflare.subdomain}.${cloudflare.domain}` : "workers.dev"}`
				: "Cloudflare: 나중에 연결",
			repository ? `GitHub: ${repository}` : "GitHub: local only",
		].join("\n"),
		"Next",
	);
	prompts.outro("프로젝트 생성이 완료됐습니다.");
}

main().catch((error: unknown) => {
	prompts.cancel(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
