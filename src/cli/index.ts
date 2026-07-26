import {
	type ArgsDef,
	type CommandDef,
	defineCommand,
	renderUsage,
	runCommand,
	runMain,
} from "citty";
import packageJson from "../../package.json" with { type: "json" };
import {
	normalizeCliError,
	serializeCliError,
	usageError,
} from "./core/error.ts";
import { type CliRuntime, initializeCliRuntime } from "./core/runtime.ts";

const packageMetadata = packageJson as typeof packageJson & {
	createAdminApp?: { version?: string };
};
const cliVersion =
	packageMetadata.createAdminApp?.version ?? packageMetadata.version;

export const main = defineCommand({
	meta: {
		name: "cli",
		version: cliVersion,
		description: "Create Admin App project CLI",
	},
	subCommands: {
		dev: () => import("./commands/dev.ts").then((module) => module.default),
		build: () => import("./commands/build.ts").then((module) => module.default),
		check: () => import("./commands/check.ts").then((module) => module.default),
		doctor: () =>
			import("./commands/doctor.ts").then((module) => module.default),
		status: () =>
			import("./commands/status.ts").then((module) => module.default),
		logs: () => import("./commands/logs.ts").then((module) => module.default),
		auth: () => import("./commands/auth.ts").then((module) => module.default),
		deploy: () =>
			import("./commands/deploy.ts").then((module) => module.default),
		destroy: () =>
			import("./commands/destroy.ts").then((module) => module.default),
		db: () => import("./commands/db.ts").then((module) => module.default),
		help: () => import("./commands/help.ts").then((module) => module.default),
		internal: () =>
			import("./commands/internal.ts").then((module) => module.default),
	},
});

async function resolveValue<T>(
	value: T | Promise<T> | (() => T) | (() => Promise<T>) | undefined,
): Promise<T | undefined> {
	return typeof value === "function"
		? (value as () => T | Promise<T>)()
		: value;
}

async function resolveCommand(
	root: CommandDef,
	rawArgs: string[],
): Promise<{ command: CommandDef; args: string[] }> {
	let command = root;
	let args = rawArgs;
	while (true) {
		const subcommands = await resolveValue(command.subCommands);
		const name = args.find((value) => !value.startsWith("-"));
		if (!subcommands || !name) return { command, args };
		const candidate = subcommands[name];
		if (!candidate) return { command, args };
		command = (await resolveValue(candidate)) as CommandDef;
		const index = args.indexOf(name);
		args = args.slice(index + 1);
	}
}

function optionNames(
	definitions: ArgsDef,
): Map<string, { takesValue: boolean; boolean: boolean }> {
	const names = new Map<string, { takesValue: boolean; boolean: boolean }>();
	for (const [name, definition] of Object.entries(definitions)) {
		if (definition.type === "positional") continue;
		const value = {
			takesValue: definition.type === "string" || definition.type === "enum",
			boolean: definition.type === "boolean",
		};
		names.set(name, value);
		const configuredAlias =
			"alias" in definition ? definition.alias : undefined;
		for (const alias of Array.isArray(configuredAlias)
			? configuredAlias
			: configuredAlias
				? [configuredAlias]
				: []) {
			names.set(alias, value);
		}
	}
	return names;
}

async function validateKnownOptions(rawArgs: string[]): Promise<void> {
	const resolved = await resolveCommand(main, rawArgs);
	const definitions = (await resolveValue(resolved.command.args)) ?? {};
	const names = optionNames(definitions);
	for (let index = 0; index < resolved.args.length; index += 1) {
		const raw = resolved.args[index];
		if (!raw?.startsWith("-") || raw === "--") continue;
		const withoutPrefix = raw.replace(/^-{1,2}/, "");
		const [rawName] = withoutPrefix.split("=", 1);
		const negative = rawName?.startsWith("no-") ?? false;
		const name = negative ? rawName?.slice(3) : rawName;
		const option = name ? names.get(name) : undefined;
		if (!option) {
			throw usageError(
				"unknown_option",
				`알 수 없는 option입니다: ${raw}`,
				"pnpm cli <command> --help로 지원 option을 확인하세요.",
			);
		}
		if (negative && !option.boolean) {
			throw usageError(
				"invalid_negative_option",
				`boolean option만 --no- 형식으로 사용할 수 있습니다: ${raw}`,
				"pnpm cli <command> --help로 option 형식을 확인하세요.",
			);
		}
		if (option.takesValue && !raw.includes("=")) index += 1;
	}
}

export async function runCli(rawArgs = process.argv.slice(2)): Promise<void> {
	let runtime: CliRuntime | undefined;
	try {
		runtime = initializeCliRuntime(rawArgs);
		if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
			await runMain(main, { rawArgs });
			return;
		}
		if (
			rawArgs.length === 1 &&
			(rawArgs[0] === "--version" || rawArgs[0] === "-v")
		) {
			process.stdout.write(`${cliVersion}\n`);
			return;
		}
		await validateKnownOptions(rawArgs);
		await runCommand(main, { rawArgs });
	} catch (error) {
		const normalized = normalizeCliError(error);
		process.exitCode = normalized.exitCode;
		if (runtime?.machine ?? rawArgs.includes("--json")) {
			process.stdout.write(
				`${JSON.stringify(serializeCliError(normalized))}\n`,
			);
		} else {
			process.stderr.write(
				`${normalized.message}\n\n해결: ${normalized.hint}\n`,
			);
			if (normalized.code === "invalid_usage") {
				process.stderr.write(`\n${await renderUsage(main)}\n`);
			}
		}
	}
}

await runCli();
