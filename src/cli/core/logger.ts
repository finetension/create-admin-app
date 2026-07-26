import { consola } from "consola";
import { cliRuntime } from "./runtime.ts";

const humanLogger = consola.withTag("cli");

function machineLog(value: unknown): void {
	const message =
		typeof value === "string"
			? value
			: value !== null && typeof value === "object" && "message" in value
				? String((value as { message: unknown }).message)
				: JSON.stringify(value);
	process.stderr.write(`${message}\n`);
}

function log(
	method: "debug" | "info" | "start" | "success",
	value: unknown,
): void {
	if (cliRuntime().machine) {
		machineLog(value);
		return;
	}
	humanLogger[method](value);
}

export const logger = {
	debug(value: unknown) {
		log("debug", value);
	},
	info(value: unknown) {
		log("info", value);
	},
	start(value: unknown) {
		log("start", value);
	},
	success(value: unknown) {
		log("success", value);
	},
	box(value: unknown) {
		if (cliRuntime().machine) {
			machineLog(value);
			return;
		}
		humanLogger.box(value as never);
	},
};

export function logCommand(command: string, args: string[]): void {
	logger.debug(`$ ${command} ${args.join(" ")}`);
}

export function progress(message: string): void {
	logger.info(message);
}
