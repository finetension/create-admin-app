import { spawn } from "node:child_process";

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
	return new Promise((resolve, reject) => {
		const capture = options.capture ?? false;
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: process.env,
			stdio: [
				options.input === undefined ? "inherit" : "pipe",
				capture ? "pipe" : "inherit",
				capture ? "pipe" : "inherit",
			],
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			reject(
				error instanceof Error && "code" in error && error.code === "ENOENT"
					? new Error(`${command} 명령을 찾을 수 없습니다.`)
					: error,
			);
		});
		child.on("close", (code) => {
			const exitCode = code ?? 1;
			if (exitCode !== 0 && !options.allowFailure) {
				reject(
					new Error(
						`${command} ${args.join(" ")} 실패${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
					),
				);
				return;
			}
			resolve({ stdout, stderr, exitCode });
		});
		if (options.input !== undefined) child.stdin?.end(options.input);
	});
}
