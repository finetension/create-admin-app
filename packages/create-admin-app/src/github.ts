import { runCommand } from "./process.js";

export interface GitHubOwner {
	login: string;
	kind: "user" | "organization";
}

async function ghJson<T>(cwd: string, args: string[]): Promise<T> {
	const result = await runCommand("gh", args, { cwd, capture: true });
	return JSON.parse(result.stdout) as T;
}

export async function listGitHubOwners(cwd: string): Promise<GitHubOwner[]> {
	await runCommand("gh", ["auth", "status"], { cwd, capture: true });
	const user = await ghJson<{ login: string }>(cwd, ["api", "user"]);
	const pages = await ghJson<Array<Array<{ login: string }>>>(cwd, [
		"api",
		"user/orgs",
		"--paginate",
		"--slurp",
	]);
	return [
		{ login: user.login, kind: "user" },
		...pages.flat().map((organization) => ({
			login: organization.login,
			kind: "organization" as const,
		})),
	];
}

export async function createGitHubRepository(
	cwd: string,
	owner: string,
	name: string,
	isPublic: boolean,
): Promise<string> {
	const repository = `${owner}/${name}`;
	await runCommand(
		"gh",
		[
			"repo",
			"create",
			repository,
			isPublic ? "--public" : "--private",
			"--source=.",
			"--remote=origin",
			"--push",
		],
		{ cwd },
	);
	return repository;
}

export async function configureProductionEnvironment(
	cwd: string,
	repository: string,
	values: {
		name: string;
		emails: string;
		accountId: string;
		token: string;
		domain?: string;
		subdomain?: string;
	},
): Promise<void> {
	await runCommand(
		"gh",
		["api", "--method", "PUT", `repos/${repository}/environments/production`],
		{ cwd, capture: true },
	);
	await runCommand(
		"gh",
		[
			"secret",
			"set",
			"CLOUDFLARE_API_TOKEN",
			"--env",
			"production",
			"--repo",
			repository,
		],
		{ cwd, capture: true, input: values.token },
	);
	const variables = [
		["PLATFORM_NAME", values.name],
		["PLATFORM_ALLOWED_EMAILS", values.emails],
		["CLOUDFLARE_ACCOUNT_ID", values.accountId],
		...(values.domain ? [["PLATFORM_DOMAIN", values.domain]] : []),
		...(values.subdomain ? [["PLATFORM_SUBDOMAIN", values.subdomain]] : []),
	];
	for (const [name, value] of variables) {
		if (!name || value === undefined) continue;
		await runCommand(
			"gh",
			[
				"variable",
				"set",
				name,
				"--env",
				"production",
				"--repo",
				repository,
				"--body",
				value,
			],
			{ cwd, capture: true },
		);
	}
}

export async function dispatchFirstDeploy(
	cwd: string,
	repository: string,
): Promise<void> {
	await runCommand(
		"gh",
		["workflow", "run", "deploy.yml", "--repo", repository, "--ref", "main"],
		{ cwd },
	);
}
