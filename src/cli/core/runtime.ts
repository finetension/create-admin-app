import { hasTTY, isAgent, isCI } from "std-env";
import { usageError } from "./error.ts";

export interface CliRuntime {
	json: boolean;
	interactive: boolean;
	machine: boolean;
}

let activeRuntime: CliRuntime = {
	json: false,
	interactive: false,
	machine: !hasTTY || isCI || isAgent,
};

function hasFlag(rawArgs: string[], name: string): boolean {
	return (
		rawArgs.includes(name) || rawArgs.some((arg) => arg.startsWith(`${name}=`))
	);
}

export function resolveCliRuntime(rawArgs: string[]): CliRuntime {
	const json = hasFlag(rawArgs, "--json");
	const interactive = hasFlag(rawArgs, "--interactive");
	if (json && interactive) {
		throw usageError(
			"conflicting_output_mode",
			"--json과 --interactive는 함께 사용할 수 없습니다.",
			"에이전트 실행에는 --json을, 사람용 TTY 실행에는 --interactive를 사용하세요.",
		);
	}
	if (interactive && !hasTTY) {
		throw usageError(
			"interactive_tty_required",
			"--interactive는 TTY에서만 사용할 수 있습니다.",
			"TTY에서 다시 실행하거나 --json으로 필요한 값을 option에 전달하세요.",
		);
	}
	return {
		json,
		interactive,
		machine: json || (!interactive && (!hasTTY || isCI || isAgent)),
	};
}

export function initializeCliRuntime(rawArgs: string[]): CliRuntime {
	activeRuntime = resolveCliRuntime(rawArgs);
	return activeRuntime;
}

export function cliRuntime(): CliRuntime {
	return activeRuntime;
}

export const commonOutputArgs = {
	json: {
		type: "boolean",
		description: "프롬프트 없이 machine-readable JSON을 출력합니다.",
		default: false,
	},
	interactive: {
		type: "boolean",
		description: "TTY에서 사람용 프롬프트와 브라우저 인증을 사용합니다.",
		default: false,
	},
} as const;

export function writeCliResult(value: unknown): void {
	if (activeRuntime.machine) {
		process.stdout.write(`${JSON.stringify(value)}\n`);
	}
}
