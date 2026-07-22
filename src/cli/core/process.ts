import { execa } from "execa";
import {
	readStoredCloudflareCredentials,
	resolveCloudflareApiToken,
} from "./credentials.ts";
import { logCommand } from "./logger.ts";
import { projectRoot } from "./paths.ts";

export interface RunOptions {
	accountId?: string;
	env?: NodeJS.ProcessEnv;
	capture?: boolean;
	allowFailure?: boolean;
	ci?: boolean;
}

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
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
		stdout: capture ? "pipe" : "inherit",
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
	const stored = readStoredCloudflareCredentials();
	const token = resolveCloudflareApiToken(options.env);
	return runCommand("wrangler", args, {
		...options,
		accountId: options.accountId ?? stored?.accountId,
		env: {
			...(token ? { CLOUDFLARE_API_TOKEN: token } : {}),
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
