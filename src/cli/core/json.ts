import { readFile, writeFile } from "node:fs/promises";
import { type ParseError, parse, printParseErrorCode } from "jsonc-parser";

export function parseJsonc(source: string, label: string): unknown {
	const errors: ParseError[] = [];
	const value = parse(source, errors, {
		allowEmptyContent: false,
		allowTrailingComma: true,
	});
	if (errors.length > 0) {
		const details = errors
			.map(
				(error) =>
					`${printParseErrorCode(error.error)} (offset ${error.offset})`,
			)
			.join(", ");
		throw new Error(`${label} JSON을 해석하지 못했습니다: ${details}`);
	}
	return value;
}

export async function readJsonc(path: string): Promise<unknown> {
	return parseJsonc(await readFile(path, "utf8"), path);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`);
}

export async function writeJsonExclusive(
	path: string,
	value: unknown,
): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`, {
		flag: "wx",
	});
}

export function extractJson(source: string, label: string): unknown {
	const trimmed = source.trim();
	for (let index = 0; index < trimmed.length; index += 1) {
		if (trimmed[index] !== "[" && trimmed[index] !== "{") continue;
		try {
			return JSON.parse(trimmed.slice(index));
		} catch {
			// Wrangler may prefix machine-readable output with status text.
		}
	}
	throw new Error(`${label} 응답을 JSON으로 해석하지 못했습니다.`);
}
