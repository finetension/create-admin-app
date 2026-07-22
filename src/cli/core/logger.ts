import { consola } from "consola";

export const logger = consola.withTag("cli");

export function logCommand(command: string, args: string[]): void {
	logger.debug(`$ ${command} ${args.join(" ")}`);
}
