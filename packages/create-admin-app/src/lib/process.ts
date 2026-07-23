import { execa } from "execa";

export interface CommandOptions {
	cwd: string;
	capture?: boolean;
	input?: string;
	allowFailure?: boolean;
}

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function runCommand(
	command: string,
	args: string[],
	options: CommandOptions,
): Promise<CommandResult> {
	const capture = options.capture ?? false;
	const result = await execa(command, args, {
		cwd: options.cwd,
		env: process.env,
		preferLocal: true,
		reject: !(options.allowFailure ?? false),
		stdout: capture ? "pipe" : "inherit",
		stderr: capture ? "pipe" : "inherit",
		...(options.input === undefined
			? { stdin: "inherit" as const }
			: { input: options.input }),
	});

	return {
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
		exitCode: result.exitCode ?? 0,
	};
}
