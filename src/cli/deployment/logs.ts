import { performance } from "node:perf_hooks";
import { execa } from "execa";
import { z } from "zod";
import type { DeploymentConfig } from "../core/config.ts";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import {
	configurationError,
	externalError,
	usageError,
} from "../core/error.ts";
import { logger, progress } from "../core/logger.ts";
import { projectRoot } from "../core/paths.ts";
import { cliRuntime } from "../core/runtime.ts";

const formatSchema = z.enum(["pretty", "json"]);
const statusSchema = z.enum(["ok", "error", "canceled"]);

export interface LogTailOptions {
	format?: string;
	status?: string;
	header?: string;
	method?: string;
	samplingRate?: string;
	search?: string;
	ip?: string;
	versionId?: string;
	duration?: string;
}

export type LogTerminationReason =
	| "duration_elapsed"
	| "interrupted"
	| "stream_ended"
	| "error";

export function resolveLogTerminationReason(input: {
	timerElapsed: boolean;
	failed: boolean;
	signal?: string;
}): LogTerminationReason {
	if (input.failed) return "error";
	if (input.timerElapsed) return "duration_elapsed";
	if (input.signal === "SIGINT" || input.signal === "SIGTERM") {
		return "interrupted";
	}
	return "stream_ended";
}

function splitList(value?: string): string[] {
	return value
		? value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

export function buildLogTailArgs(
	workerName: string,
	options: LogTailOptions = {},
): string[] {
	const args = ["tail", workerName];
	const format = formatSchema.parse(options.format ?? "pretty");
	args.push("--format", format);

	for (const status of splitList(options.status).map((value) =>
		statusSchema.parse(value),
	)) {
		args.push("--status", status);
	}
	for (const method of splitList(options.method)) {
		args.push("--method", method.toUpperCase());
	}
	for (const ip of splitList(options.ip)) {
		args.push("--ip", ip);
	}
	if (options.header) args.push("--header", options.header);
	if (options.search) args.push("--search", options.search);
	if (options.versionId) args.push("--version-id", options.versionId);
	if (options.samplingRate !== undefined) {
		const samplingRate = z.coerce
			.number()
			.positive()
			.max(1)
			.parse(options.samplingRate);
		if (samplingRate < 1) {
			args.push("--sampling-rate", String(samplingRate));
		}
	}
	return args;
}

export async function tailWorkerLogs(
	config: DeploymentConfig,
	options: LogTailOptions = {},
): Promise<void> {
	const token = resolveCloudflareApiToken(config.accountId);
	if (!token) {
		throw configurationError(
			"missing_cloudflare_token",
			"Worker log 조회에 필요한 Cloudflare token이 없습니다.",
			"pnpm cli deploy --interactive로 token을 저장하세요.",
		);
	}
	let duration: number | undefined;
	let args: string[];
	try {
		duration =
			options.duration === undefined
				? cliRuntime().machine
					? 30
					: undefined
				: z.coerce.number().positive().max(86_400).parse(options.duration);
		args = buildLogTailArgs(config.workerName, {
			...options,
			format: cliRuntime().machine ? "json" : options.format,
		});
	} catch (error) {
		throw usageError(
			"invalid_log_options",
			error instanceof Error ? error.message : String(error),
			"pnpm cli logs --help에서 duration과 filter 형식을 확인하세요.",
		);
	}
	progress(`Worker 로그를 연결합니다: ${config.workerName}`);
	const started = performance.now();
	const subprocess = execa("wrangler", args, {
		cwd: projectRoot,
		preferLocal: true,
		env: {
			...process.env,
			CI: "true",
			CLOUDFLARE_ACCOUNT_ID: config.accountId,
			CLOUDFLARE_API_TOKEN: token,
		},
		reject: false,
		stdout: "pipe",
		stderr: cliRuntime().machine ? "pipe" : "inherit",
	});
	let received = 0;
	let buffer = "";
	const writeLogLine = (line: string) => {
		if (!line.trim()) return;
		received += 1;
		try {
			process.stdout.write(
				`${JSON.stringify({ type: "log", data: JSON.parse(line) })}\n`,
			);
		} catch {
			process.stdout.write(`${JSON.stringify({ type: "log", data: line })}\n`);
		}
	};
	if (cliRuntime().machine) {
		subprocess.stdout?.on("data", (chunk: Buffer | string) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				writeLogLine(line);
			}
		});
	} else {
		subprocess.stdout?.pipe(process.stdout);
	}
	let timer: NodeJS.Timeout | undefined;
	let timerElapsed = false;
	if (duration !== undefined) {
		timer = setTimeout(() => {
			timerElapsed = true;
			subprocess.kill("SIGINT");
		}, duration * 1_000);
	}
	const result = await subprocess;
	if (timer) clearTimeout(timer);
	const failed =
		result.exitCode !== 0 &&
		result.exitCode !== 130 &&
		result.signal !== "SIGINT";
	if (cliRuntime().machine) {
		writeLogLine(buffer);
		if (failed) {
			process.stdout.write(
				`${JSON.stringify({
					type: "error",
					error: {
						code: "log_stream_failed",
						message: result.stderr || "wrangler tail failed",
						hint: "Cloudflare token, Worker 이름과 filter를 확인한 뒤 다시 실행하세요.",
					},
				})}\n`,
			);
		}
		process.stdout.write(
			`${JSON.stringify({
				type: "summary",
				received,
				duration_ms: Math.round(performance.now() - started),
				reason: resolveLogTerminationReason({
					timerElapsed,
					failed,
					...(result.signal ? { signal: result.signal } : {}),
				}),
			})}\n`,
		);
		if (failed) process.exitCode = 4;
	}
	if (failed && !cliRuntime().machine) {
		throw externalError(
			"log_stream_failed",
			result.stderr || "wrangler tail failed",
			"Cloudflare token, Worker 이름과 filter를 확인한 뒤 다시 실행하세요.",
		);
	}
	if (!failed) logger.success("Worker log stream을 종료했습니다");
}
