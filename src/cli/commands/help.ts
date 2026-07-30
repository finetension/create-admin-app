import {
	type ArgDef,
	type ArgsDef,
	type CommandDef,
	defineCommand,
} from "citty";
import { usageError } from "../core/error.ts";

interface CommandSource {
	command: string;
	load: () => Promise<unknown>;
	visibility: "public" | "internal";
	conditions?: {
		environment: "github-actions";
		ref: "refs/heads/main";
		events: string[];
		capability: string;
		risk: "production-mutation" | "destructive";
	};
}

export interface HelpOption {
	name: string;
	flags: string[];
	type: "boolean" | "string" | "enum" | "positional";
	required: boolean;
	description?: string;
	value_hint?: string;
	default?: boolean | string;
	choices?: string[];
}

export interface HelpCommand {
	command: string;
	description?: string;
	visibility: "public" | "internal";
	options: HelpOption[];
	conditions?: CommandSource["conditions"];
}

const commandSources: CommandSource[] = [
	{
		command: "dev",
		load: () => import("./dev.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "build",
		load: () => import("./build.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "check",
		load: () => import("./check.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "deploy",
		load: () => import("./deploy.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "destroy",
		load: () => import("./destroy.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "doctor",
		load: () => import("./doctor.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "status",
		load: () => import("./status.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "logs",
		load: () => import("./logs.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "auth status",
		load: () => import("./auth/status.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "auth login",
		load: () => import("./auth/login.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "auth logout",
		load: () => import("./auth/logout.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "db migrate",
		load: () => import("./db/migrate.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "db seed",
		load: () => import("./db/seed.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "db reset",
		load: () => import("./db/reset.ts").then((module) => module.default),
		visibility: "public",
	},
	{
		command: "internal deploy",
		load: () => import("./internal/deploy.ts").then((module) => module.default),
		visibility: "internal",
		conditions: {
			environment: "github-actions",
			ref: "refs/heads/main",
			events: ["push", "workflow_dispatch"],
			capability: "PLATFORM_ALLOW_DEPLOY",
			risk: "production-mutation",
		},
	},
	{
		command: "internal destroy",
		load: () =>
			import("./internal/destroy.ts").then((module) => module.default),
		visibility: "internal",
		conditions: {
			environment: "github-actions",
			ref: "refs/heads/main",
			events: ["workflow_dispatch"],
			capability: "PLATFORM_ALLOW_DESTROY",
			risk: "destructive",
		},
	},
];

async function resolveValue<T>(
	value: T | Promise<T> | (() => T) | (() => Promise<T>) | undefined,
): Promise<T | undefined> {
	return typeof value === "function"
		? (value as () => T | Promise<T>)()
		: value;
}

function optionType(definition: ArgDef): HelpOption["type"] {
	return definition.type ?? "string";
}

function optionFlags(name: string, definition: ArgDef): string[] {
	if (definition.type === "positional") return [`<${name}>`];
	const aliases =
		"alias" in definition
			? Array.isArray(definition.alias)
				? definition.alias
				: definition.alias
					? [definition.alias]
					: []
			: [];
	return [
		`--${name}`,
		...("negativeDescription" in definition && definition.negativeDescription
			? [`--no-${name}`]
			: []),
		...aliases.map((alias) => `-${alias}`),
	];
}

function describeOption(name: string, definition: ArgDef): HelpOption {
	const type = optionType(definition);
	const value = {
		name,
		flags: optionFlags(name, definition),
		type,
		required: definition.required ?? false,
		...(definition.description ? { description: definition.description } : {}),
		...(definition.valueHint ? { value_hint: definition.valueHint } : {}),
		...(definition.default !== undefined
			? { default: definition.default }
			: {}),
		...("options" in definition && definition.options
			? { choices: definition.options }
			: {}),
	};
	return value;
}

async function describeCommand(source: CommandSource): Promise<HelpCommand> {
	const definition = (await source.load()) as CommandDef;
	const meta = await resolveValue(definition.meta);
	const args = ((await resolveValue(definition.args)) ?? {}) as ArgsDef;
	return {
		command: source.command,
		...(meta?.description ? { description: meta.description } : {}),
		visibility: source.visibility,
		options: Object.entries(args).map(([name, option]) =>
			describeOption(name, option),
		),
		...(source.conditions ? { conditions: source.conditions } : {}),
	};
}

export async function buildHelpContract(includeInternal = true) {
	const sources = includeInternal
		? commandSources
		: commandSources.filter((source) => source.visibility === "public");
	return {
		name: "create-admin-app",
		inputs: {
			project_config: {
				path: "config.toml",
				strict: true,
				sections: {
					project: ["name", "slug"],
					access: ["bootstrap_owner_email", "google_login"],
					github: ["owner", "repository", "visibility"],
					cloudflare: ["account_id", "workers_dev", "domain", "subdomain"],
				},
			},
			environment: [
				{
					name: "CREATE_ADMIN_APP_GITHUB_OWNER",
					commands: ["deploy"],
					secret: false,
				},
				{
					name: "CREATE_ADMIN_APP_CLOUDFLARE_ACCOUNT_ID",
					commands: ["deploy"],
					secret: false,
				},
				{
					name: "CLOUDFLARE_API_TOKEN",
					commands: [
						"auth login",
						"deploy",
						"dev",
						"doctor",
						"destroy",
						"status",
						"logs",
						"internal deploy",
						"internal destroy",
					],
					secret: true,
					persistence: {
						default: "process-only",
						"auth login": "verified-os-credential-store",
					},
				},
				{
					name: "GOOGLE_OAUTH_CLIENT_ID",
					commands: ["deploy", "internal deploy"],
					secret: true,
					required_when: "config.toml access.google_login is true",
					persistence: "GitHub repository Actions secret",
				},
				{
					name: "GOOGLE_OAUTH_CLIENT_SECRET",
					commands: ["deploy", "internal deploy"],
					secret: true,
					required_when: "config.toml access.google_login is true",
					persistence: "GitHub repository Actions secret",
				},
			],
			credentials: {
				github: "gh auth",
				cloudflare_local: "OS credential store by account",
				cloudflare_actions: "GitHub repository Actions secret",
				google_oauth_actions:
					"optional GitHub repository Actions secrets set by deploy",
			},
		},
		commands: await Promise.all(sources.map(describeCommand)),
		exit_codes: {
			success: 0,
			unexpected: 1,
			usage: 2,
			configuration: 3,
			external: 4,
			safety: 5,
		},
	};
}

export default defineCommand({
	meta: {
		name: "help",
		description: "에이전트가 해석할 수 있는 전체 명령 계약을 출력합니다.",
	},
	args: {
		all: {
			type: "boolean",
			description: "숨겨진 Actions 전용 명령도 포함합니다.",
			default: false,
		},
		json: {
			type: "boolean",
			description: "JSON으로 출력합니다.",
			default: false,
		},
	},
	async run({ args }) {
		if (!args.all || !args.json) {
			throw usageError(
				"help_contract_requires_flags",
				"전체 명령 계약은 --all --json과 함께 조회합니다.",
				"pnpm cli help --all --json",
			);
		}
		process.stdout.write(
			`${JSON.stringify(await buildHelpContract(true), null, 2)}\n`,
		);
	},
});
