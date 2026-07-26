import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse, stringify } from "smol-toml";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";
import { configurationError, safetyError } from "./error.ts";
import { readJsonc } from "./json.ts";
import { projectPaths, resolveProjectPath } from "./paths.ts";

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const domainPattern =
	/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const accountIdPattern = /^[a-f0-9]{32}$/i;
const githubOwnerPattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const githubRepositoryPattern = /^[a-z\d._-]{1,100}$/i;

const displayNameSchema = z
	.string()
	.trim()
	.min(1, "name은 비워둘 수 없습니다.")
	.max(100, "name은 100자 이하여야 합니다.")
	.transform((name) => name.replace(/\s+/g, " "));

const emailSchema = z
	.string()
	.trim()
	.transform((email) => email.toLowerCase())
	.pipe(z.email("올바른 이메일 형식이어야 합니다."));

const projectSectionSchema = z.strictObject({
	name: displayNameSchema,
	slug: z.string().regex(slugPattern, "slug 형식이 올바르지 않습니다."),
	allowed_emails: z
		.array(emailSchema)
		.min(1, "allowed_emails에는 최소 한 명의 이메일이 필요합니다.")
		.transform((emails) => [...new Set(emails)]),
});

const githubSectionSchema = z
	.strictObject({
		owner: z
			.string()
			.trim()
			.regex(githubOwnerPattern, "GitHub owner 형식이 올바르지 않습니다.")
			.optional(),
		repository: z
			.string()
			.trim()
			.regex(
				githubRepositoryPattern,
				"GitHub repository 형식이 올바르지 않습니다.",
			)
			.refine((value) => value !== "." && value !== "..", {
				message: "GitHub repository 이름으로 . 또는 ..을 사용할 수 없습니다.",
			})
			.optional(),
		visibility: z.enum(["private", "public"]).optional(),
	})
	.refine(
		(value) =>
			(value.owner === undefined && value.repository === undefined) ||
			(Boolean(value.owner) && Boolean(value.repository)),
		{
			message: "owner와 repository는 함께 설정해야 합니다.",
		},
	);

const cloudflareSectionSchema = z
	.strictObject({
		account_id: z.string().regex(accountIdPattern),
		workers_dev: z.literal(true).optional(),
		domain: z
			.string()
			.trim()
			.toLowerCase()
			.regex(domainPattern, "domain 형식이 올바르지 않습니다.")
			.optional(),
		subdomain: z
			.string()
			.trim()
			.toLowerCase()
			.regex(slugPattern, "subdomain 형식이 올바르지 않습니다.")
			.optional(),
	})
	.superRefine((value, context) => {
		if (value.workers_dev && (value.domain || value.subdomain)) {
			context.addIssue({
				code: "custom",
				message: "workers_dev와 domain/subdomain은 함께 사용할 수 없습니다.",
			});
		}
		if (!value.workers_dev && !value.domain) {
			context.addIssue({
				code: "custom",
				message: "workers_dev = true 또는 domain을 설정해야 합니다.",
			});
		}
		if (value.subdomain && !value.domain) {
			context.addIssue({
				code: "custom",
				path: ["subdomain"],
				message: "subdomain은 domain과 함께 설정해야 합니다.",
			});
		}
	});

const projectConfigSchema = z.strictObject({
	project: projectSectionSchema,
	github: githubSectionSchema.optional(),
	cloudflare: cloudflareSectionSchema.optional(),
});

const userDefaultsSchema = z.strictObject({
	github: z
		.strictObject({
			owner: z
				.string()
				.trim()
				.regex(githubOwnerPattern, "GitHub owner 형식이 올바르지 않습니다."),
		})
		.optional(),
	cloudflare: z
		.strictObject({
			account_id: z.string().regex(accountIdPattern),
		})
		.optional(),
});

const wranglerBaseSchema = z.object({
	compatibility_date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "compatibility_date가 올바르지 않습니다."),
});

export type ProjectConfig = z.output<typeof projectConfigSchema>;
export type UserDefaults = z.output<typeof userDefaultsSchema>;
export type RepositoryVisibility = "private" | "public";

export interface UserConfig {
	name: string;
	slug: string;
	serviceName: string;
	allowedEmails: string[];
	domain?: string;
	subdomain?: string;
	routing: "custom-domain" | "workers-dev";
	hostname?: string;
	github?: ProjectConfig["github"];
	cloudflare?: ProjectConfig["cloudflare"];
}

export interface AccessConfig {
	sessionDuration: string;
	applicationName: string;
	policyName: string;
	identityProviderName: string;
	teamName: string;
	allowedEmails: string[];
}

export interface DeploymentConfig extends UserConfig {
	hostname: string;
	accountId: string;
	compatibilityDate: string;
	workerName: string;
	resourcePrefix: string;
	access: AccessConfig;
}

function configError(label: string, error: z.ZodError, example: string): never {
	throw configurationError(
		"invalid_config",
		`${label} 설정이 올바르지 않습니다.\n${z.prettifyError(error)}`,
		`허용된 section과 key만 사용하세요. 예: ${example}`,
		{ cause: error },
	);
}

export function parseProjectConfig(
	input: unknown,
	label = "config.toml",
): ProjectConfig {
	const result = projectConfigSchema.safeParse(input);
	if (!result.success) {
		configError(
			label,
			result.error,
			'[project]\\nname = "My Company"\\nslug = "my-company"\\nallowed_emails = ["owner@example.com"]',
		);
	}
	return result.data;
}

export function parseUserDefaults(
	input: unknown,
	label = "user config.toml",
): UserDefaults {
	const result = userDefaultsSchema.safeParse(input);
	if (!result.success) {
		configError(
			label,
			result.error,
			'[github]\\nowner = "my-owner"\\n\\n[cloudflare]\\naccount_id = "00000000000000000000000000000000"',
		);
	}
	return result.data;
}

async function readToml(path: string): Promise<unknown> {
	try {
		return parse(await readFile(path, "utf8"));
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			throw configurationError(
				"missing_config",
				`${path} 파일이 없습니다.`,
				"프로젝트 루트에서 명령을 실행하거나 config.toml을 복원하세요.",
				{ cause: error },
			);
		}
		throw configurationError(
			"invalid_toml",
			`${path} TOML을 해석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
			"문법을 수정한 뒤 다시 실행하세요.",
			{ cause: error instanceof Error ? error : undefined },
		);
	}
}

export async function loadProjectConfig(
	path = projectPaths.config,
): Promise<ProjectConfig> {
	return parseProjectConfig(await readToml(path), path);
}

export async function loadUserConfig(
	path = projectPaths.config,
): Promise<UserConfig> {
	const config = await loadProjectConfig(path);
	const cloudflare = config.cloudflare;
	const hostname = cloudflare?.domain
		? `${cloudflare.subdomain ?? config.project.slug}.${cloudflare.domain}`
		: undefined;
	return {
		name: config.project.name,
		slug: config.project.slug,
		serviceName: config.project.slug,
		allowedEmails: config.project.allowed_emails,
		...(cloudflare?.domain ? { domain: cloudflare.domain } : {}),
		...(cloudflare?.subdomain ? { subdomain: cloudflare.subdomain } : {}),
		routing: cloudflare?.domain ? "custom-domain" : "workers-dev",
		...(hostname ? { hostname } : {}),
		...(config.github ? { github: config.github } : {}),
		...(cloudflare ? { cloudflare } : {}),
	};
}

function canonicalToml(value: ProjectConfig | UserDefaults): string {
	return `${stringify(value as never).trim()}\n`;
}

export async function writeProjectConfig(
	config: ProjectConfig,
	path = projectPaths.config,
): Promise<void> {
	const validated = parseProjectConfig(config, path);
	await mkdir(dirname(path), { recursive: true });
	await writeFileAtomic(path, canonicalToml(validated), { encoding: "utf8" });
}

export async function loadUserDefaults(
	path = projectPaths.userConfig,
): Promise<UserDefaults> {
	return parseUserDefaults(await readToml(path), path);
}

export async function loadOptionalUserDefaults(
	path = projectPaths.userConfig,
): Promise<UserDefaults> {
	try {
		return await loadUserDefaults(path);
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error as { code?: string }).code === "missing_config"
		) {
			return {};
		}
		throw error;
	}
}

export async function writeUserDefaults(
	defaults: UserDefaults,
	path = projectPaths.userConfig,
): Promise<void> {
	const validated = parseUserDefaults(defaults, path);
	await mkdir(dirname(path), { recursive: true });
	await writeFileAtomic(path, canonicalToml(validated), { encoding: "utf8" });
}

export function resolveLocalConfigPath(config?: string): string {
	return config ? resolveProjectPath(config) : projectPaths.config;
}

export async function readCompatibilityDate(): Promise<string> {
	const result = wranglerBaseSchema.safeParse(
		await readJsonc(projectPaths.wranglerConfig),
	);
	if (!result.success) {
		configError(
			projectPaths.wranglerConfig,
			result.error,
			'compatibility_date = "2026-07-24"',
		);
	}
	return result.data.compatibility_date;
}

export function createDeploymentConfig(
	userConfig: UserConfig,
	accountId: string,
	compatibilityDate: string,
	workersDevSubdomain?: string,
): DeploymentConfig {
	if (!accountIdPattern.test(accountId)) {
		throw configurationError(
			"invalid_cloudflare_account",
			"Cloudflare account ID가 올바르지 않습니다.",
			"config.toml의 cloudflare.account_id를 확인하세요.",
		);
	}
	const hostname =
		userConfig.hostname ??
		(workersDevSubdomain
			? `${userConfig.serviceName}.${workersDevSubdomain}.workers.dev`
			: undefined);
	if (!hostname) {
		throw configurationError(
			"missing_workers_dev_subdomain",
			"workers.dev 주소를 확인하지 못했습니다.",
			"Cloudflare token과 account_id를 확인한 뒤 다시 실행하세요.",
		);
	}
	const teamNameBase =
		userConfig.serviceName.slice(0, 54).replace(/-+$/, "") || "management";
	return {
		...userConfig,
		hostname,
		accountId,
		compatibilityDate,
		workerName: userConfig.serviceName,
		resourcePrefix: userConfig.serviceName,
		access: {
			sessionDuration: "24h",
			applicationName: userConfig.name,
			policyName: `Allow ${userConfig.name} team`,
			identityProviderName: "One-time PIN login",
			teamName: `${teamNameBase}-${accountId.slice(0, 8)}`,
			allowedEmails: userConfig.allowedEmails,
		},
	};
}

export function assertCloudflareAccountMayChange(
	currentAccountId: string | undefined,
	nextAccountId: string,
	production: "predeploy" | "deployed" | "destroyed",
): void {
	if (
		production !== "predeploy" &&
		currentAccountId &&
		currentAccountId !== nextAccountId
	) {
		throw safetyError(
			"cloudflare_account_change_forbidden",
			"배포 이력이 있는 프로젝트의 Cloudflare account는 변경할 수 없습니다.",
			"새 프로젝트를 만들고 검토된 데이터 이전 계획을 사용하세요.",
		);
	}
}
