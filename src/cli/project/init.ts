import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import {
	loadUserConfig,
	parseUserConfig,
	type UserConfig,
} from "../core/config.ts";
import { writeJson, writeJsonExclusive } from "../core/json.ts";
import { logger } from "../core/logger.ts";
import {
	projectPaths,
	projectRoot,
	resolveProjectPath,
} from "../core/paths.ts";

export interface InitializeProjectOptions {
	config: string;
	name?: string;
	domain?: string;
	subdomain?: string;
	workersDev?: boolean;
	emails?: string;
	force?: boolean;
}

interface InitConfigInput {
	name: string;
	domain?: string;
	subdomain?: string;
	emails: string;
}

export interface PersistedUserConfig {
	domain?: string;
	subdomain?: string;
	name: string;
	allowedEmails: string[];
}

export function parseAllowedEmails(value: string): string[] {
	return value
		.split(/[,\n]+/)
		.map((email) => email.trim())
		.filter(Boolean);
}

export function createInitConfig(
	input: InitConfigInput,
	label = "배포 설정",
): UserConfig {
	return parseUserConfig(
		{
			domain: input.domain,
			subdomain: input.subdomain,
			name: input.name,
			allowedEmails: parseAllowedEmails(input.emails),
		},
		label,
	);
}

export function toPersistedUserConfig(config: UserConfig): PersistedUserConfig {
	return {
		...(config.domain ? { domain: config.domain } : {}),
		...(config.subdomain ? { subdomain: config.subdomain } : {}),
		name: config.name,
		allowedEmails: config.allowedEmails,
	};
}

function fileExistsError(path: string): Error {
	return new Error(
		`${path} 파일이 이미 존재합니다. 덮어쓰려면 --force를 사용하세요.`,
	);
}

function isFileExistsError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "EEXIST"
	);
}

export async function writeInitConfig(
	path: string,
	config: UserConfig,
	force = false,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	try {
		if (force) {
			await writeJson(path, toPersistedUserConfig(config));
		} else {
			await writeJsonExclusive(path, toPersistedUserConfig(config));
		}
	} catch (error) {
		if (isFileExistsError(error)) throw fileExistsError(path);
		throw error;
	}
}

async function promptText(message: string, initial: string): Promise<string> {
	const answer = await logger.prompt(message, {
		type: "text",
		initial,
		cancel: "reject",
	});
	if (typeof answer !== "string") {
		throw new Error(`${message} 입력을 확인하지 못했습니다.`);
	}
	return answer;
}

export async function initializeProject(
	options: InitializeProjectOptions,
): Promise<UserConfig> {
	if (options.workersDev && options.domain) {
		throw new Error("--workers-dev와 --domain은 함께 사용할 수 없습니다.");
	}
	if (options.workersDev && options.subdomain) {
		throw new Error("--workers-dev와 --subdomain은 함께 사용할 수 없습니다.");
	}
	const outputPath = resolveProjectPath(options.config);
	const outputExists = existsSync(outputPath);
	if (outputExists && !options.force) throw fileExistsError(outputPath);

	const needsDefaults =
		options.name === undefined ||
		(!options.workersDev && options.domain === undefined) ||
		options.emails === undefined;
	const defaults = needsDefaults
		? await loadUserConfig(
				outputExists ? outputPath : projectPaths.deployConfigExample,
			)
		: undefined;
	const name =
		options.name ??
		(await promptText("서비스 이름", defaults?.name ?? "Operations Hub"));
	const domain = options.workersDev
		? undefined
		: (options.domain ??
			(await promptText(
				"기본 도메인 (비워두면 workers.dev)",
				defaults?.domain ?? "",
			)));
	const emails =
		options.emails ??
		(await promptText(
			"접근 허용 이메일 (쉼표로 구분)",
			defaults?.allowedEmails.join(", ") ?? "admin@example.com",
		));
	const config = createInitConfig(
		{ name, domain, subdomain: options.subdomain, emails },
		outputPath,
	);

	await writeInitConfig(outputPath, config, options.force);
	logger.box({
		title: "Platform initialized",
		message: [
			`Config:  ${relative(projectRoot, outputPath)}`,
			`Name:    ${config.name}`,
			`Service: ${config.serviceName}`,
			`Route:   ${config.hostname ? `https://${config.hostname}` : "workers.dev (배포 시 확정)"}`,
			`Access:  ${config.allowedEmails.join(", ")}`,
		].join("\n"),
	});
	return config;
}
