import { z } from "zod";
import type { DeploymentConfig } from "../core/config.ts";
import { logger } from "../core/logger.ts";
import { runWrangler } from "../core/process.ts";

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
	logger.start(`Worker 실시간 로그를 연결합니다: ${config.workerName}`);
	await runWrangler(buildLogTailArgs(config.workerName, options), {
		accountId: config.accountId,
		ci: false,
	});
}
