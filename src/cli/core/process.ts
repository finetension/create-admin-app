import { execa } from "execa";
import {
	readStoredCloudflareCredentials,
	type StoredCloudflareCredentials,
} from "./credentials.ts";
import { logCommand } from "./logger.ts";
import { projectRoot } from "./paths.ts";
import { cliRuntime } from "./runtime.ts";

export interface RunOptions {
	accountId?: string;
	env?: NodeJS.ProcessEnv;
	capture?: boolean;
	allowFailure?: boolean;
	ci?: boolean;
	input?: string;
}

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export function resolveWranglerCredentials(
	accountId: string | undefined,
	extraEnvironment: NodeJS.ProcessEnv = {},
	environment: NodeJS.ProcessEnv = process.env,
	readStored: (
		accountId?: string,
	) =>
		| StoredCloudflareCredentials
		| undefined = readStoredCloudflareCredentials,
): { accountId?: string; token?: string } {
	const environmentToken =
		extraEnvironment.CLOUDFLARE_API_TOKEN?.trim() ||
		environment.CLOUDFLARE_API_TOKEN?.trim();
	const stored = environmentToken ? undefined : readStored(accountId);
	return {
		...((accountId ?? stored?.accountId)
			? { accountId: accountId ?? stored?.accountId }
			: {}),
		...((environmentToken ?? stored?.token)
			? { token: environmentToken ?? stored?.token }
			: {}),
	};
}

function commandEnvironment(
	accountId?: string,
	extra: NodeJS.ProcessEnv = {},
	ci = true,
): NodeJS.ProcessEnv {
	return {
		...process.env,
		...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
		...(ci ? { CI: "true" } : {}),
		...extra,
	};
}

export async function runCommand(
	command: string,
	args: string[],
	options: RunOptions = {},
): Promise<CommandResult> {
	logCommand(command, args);
	const capture = options.capture ?? false;
	const result = await execa(command, args, {
		cwd: projectRoot,
		env: commandEnvironment(options.accountId, options.env, options.ci),
		preferLocal: true,
		reject: !(options.allowFailure ?? false),
		input: options.input,
		stdout: capture
			? "pipe"
			: cliRuntime().machine
				? process.stderr
				: "inherit",
		stderr: capture ? "pipe" : "inherit",
	});
	return {
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
		exitCode: result.exitCode ?? 0,
	};
}

export function runWrangler(
	args: string[],
	options: RunOptions = {},
): Promise<CommandResult> {
	const credentials = resolveWranglerCredentials(
		options.accountId,
		options.env,
	);
	return runCommand("wrangler", args, {
		...options,
		accountId: credentials.accountId,
		env: {
			...(credentials.token ? { CLOUDFLARE_API_TOKEN: credentials.token } : {}),
			...options.env,
		},
	});
}

export function runPnpm(
	args: string[],
	options: Omit<RunOptions, "capture" | "allowFailure"> = {},
): Promise<CommandResult> {
	return runCommand("pnpm", args, options);
}
