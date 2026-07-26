export type CliErrorCategory =
	| "unexpected"
	| "usage"
	| "configuration"
	| "external"
	| "safety";

const exitCodes: Record<CliErrorCategory, number> = {
	unexpected: 1,
	usage: 2,
	configuration: 3,
	external: 4,
	safety: 5,
};

export interface StructuredCliError {
	error: {
		code: string;
		message: string;
		hint: string;
	};
}

export class CliError extends Error {
	readonly code: string;
	readonly hint: string;
	readonly category: CliErrorCategory;
	readonly exitCode: number;
	readonly result?: Record<string, unknown>;

	constructor(
		code: string,
		message: string,
		hint: string,
		category: CliErrorCategory,
		options?: ErrorOptions,
		result?: Record<string, unknown>,
	) {
		super(message, options);
		this.name = "CliError";
		this.code = code;
		this.hint = hint;
		this.category = category;
		this.exitCode = exitCodes[category];
		this.result = result;
	}
}

export function usageError(
	code: string,
	message: string,
	hint: string,
): CliError {
	return new CliError(code, message, hint, "usage");
}

export function configurationError(
	code: string,
	message: string,
	hint: string,
	options?: ErrorOptions,
): CliError {
	return new CliError(code, message, hint, "configuration", options);
}

export function externalError(
	code: string,
	message: string,
	hint: string,
	options?: ErrorOptions,
): CliError {
	return new CliError(code, message, hint, "external", options);
}

export function safetyError(
	code: string,
	message: string,
	hint: string,
): CliError {
	return new CliError(code, message, hint, "safety");
}

export function normalizeCliError(error: unknown): CliError {
	if (error instanceof CliError) return error;
	if (error instanceof Error) {
		const code =
			"code" in error && typeof error.code === "string" ? error.code : "";
		if (code === "EARG" || code.startsWith("E_")) {
			return usageError(
				"invalid_usage",
				error.message,
				"pnpm cli --help 또는 pnpm cli <command> --help로 사용법을 확인하세요.",
			);
		}
		return new CliError(
			"unexpected_error",
			error.message,
			"오류 내용을 확인한 뒤 같은 명령을 다시 실행하세요.",
			"unexpected",
			{ cause: error },
		);
	}
	return new CliError(
		"unexpected_error",
		String(error),
		"오류 내용을 확인한 뒤 같은 명령을 다시 실행하세요.",
		"unexpected",
	);
}

export function serializeCliError(error: unknown): StructuredCliError {
	const normalized = normalizeCliError(error);
	return {
		...(normalized.result ?? {}),
		error: {
			code: normalized.code,
			message: normalized.message,
			hint: normalized.hint,
		},
	} as StructuredCliError;
}
