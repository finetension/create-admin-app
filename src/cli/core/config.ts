import { existsSync } from "node:fs";
import { z } from "zod";
import { readJsonc } from "./json.ts";
import { normalizeServiceName } from "./naming.ts";
import { projectPaths, resolveProjectPath } from "./paths.ts";

const domainPattern =
	/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

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

const domainSchema = z
	.string()
	.trim()
	.transform((domain) => domain.toLowerCase())
	.pipe(
		z
			.string()
			.regex(
				domainPattern,
				"domain에는 example.com 같은 기본 도메인을 입력하세요.",
			),
	);

const subdomainSchema = z
	.string()
	.trim()
	.transform((subdomain) => subdomain.toLowerCase())
	.pipe(
		z
			.string()
			.regex(
				/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
				"subdomain은 영문 소문자, 숫자와 하이픈으로 된 단일 label이어야 합니다.",
			),
	);

const userConfigSchema = z
	.strictObject({
		domain: z.preprocess(
			(value) =>
				typeof value === "string" && value.trim() === "" ? undefined : value,
			domainSchema.optional(),
		),
		subdomain: z.preprocess(
			(value) =>
				typeof value === "string" && value.trim() === "" ? undefined : value,
			subdomainSchema.optional(),
		),
		name: displayNameSchema,
		allowedEmails: z
			.array(emailSchema)
			.min(1, "allowedEmails에는 최소 한 명의 이메일이 필요합니다."),
	})
	.superRefine((config, context) => {
		if (config.subdomain && !config.domain) {
			context.addIssue({
				code: "custom",
				path: ["subdomain"],
				message: "subdomain은 domain과 함께 사용해야 합니다.",
			});
		}
	})
	.transform((config) => ({
		...config,
		allowedEmails: [...new Set(config.allowedEmails)],
	}));

const wranglerBaseSchema = z.object({
	compatibility_date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "compatibility_date가 올바르지 않습니다."),
});

export interface UserConfig extends z.output<typeof userConfigSchema> {
	serviceName: string;
	routing: "custom-domain" | "workers-dev";
	hostname?: string;
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

function formatZodError(error: z.ZodError): string {
	return z.prettifyError(error);
}

export function parseUserConfig(input: unknown, label: string): UserConfig {
	const result = userConfigSchema.safeParse(input);
	if (!result.success) {
		throw new Error(
			`${label} 설정이 올바르지 않습니다.\n${formatZodError(result.error)}`,
		);
	}

	const serviceName = normalizeServiceName(result.data.name);
	if (!serviceName) {
		throw new Error(
			`${label}의 name에는 식별자로 변환할 수 있는 영문, 숫자 또는 한글이 필요합니다.`,
		);
	}
	const hostname = result.data.domain
		? `${result.data.subdomain ?? serviceName}.${result.data.domain}`
		: undefined;
	if (hostname && hostname.length > 253) {
		throw new Error(
			`${label}의 정규화된 name과 domain을 합친 호스트 이름은 253자 이하여야 합니다.`,
		);
	}

	return {
		...result.data,
		serviceName,
		routing: hostname ? "custom-domain" : "workers-dev",
		hostname,
	};
}

export async function loadUserConfig(path: string): Promise<UserConfig> {
	return parseUserConfig(await readJsonc(path), path);
}

export function resolveLocalConfigPath(config?: string): string {
	if (config) return resolveProjectPath(config);
	return existsSync(projectPaths.deployConfig)
		? projectPaths.deployConfig
		: projectPaths.deployConfigExample;
}

export async function readCompatibilityDate(): Promise<string> {
	const result = wranglerBaseSchema.safeParse(
		await readJsonc(projectPaths.wranglerConfig),
	);
	if (!result.success) {
		throw new Error(
			`wrangler.jsonc 설정이 올바르지 않습니다.\n${formatZodError(result.error)}`,
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
	if (!/^[a-f0-9]{32}$/i.test(accountId)) {
		throw new Error("Cloudflare 계정 ID를 확인하지 못했습니다.");
	}
	if (
		workersDevSubdomain &&
		!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(workersDevSubdomain)
	) {
		throw new Error("Cloudflare Workers 서브도메인이 올바르지 않습니다.");
	}
	const teamNameBase =
		userConfig.serviceName.slice(0, 54).replace(/-+$/, "") || "management";
	const hostname =
		userConfig.hostname ??
		(workersDevSubdomain
			? `${userConfig.serviceName}.${workersDevSubdomain}.workers.dev`
			: undefined);
	if (!hostname) {
		throw new Error(
			"workers.dev 배포에는 Cloudflare 계정의 Workers 서브도메인이 필요합니다.",
		);
	}
	if (hostname.length > 253) {
		throw new Error("배포 호스트 이름은 253자 이하여야 합니다.");
	}
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
