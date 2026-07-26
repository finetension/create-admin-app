import { z } from "zod";
import type { DeploymentConfig } from "../core/config.ts";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { logger } from "../core/logger.ts";
import { CloudflareApi, CloudflareApiError } from "./api.ts";

const organizationSchema = z.object({
	auth_domain: z.string().min(1),
});

const identityProviderSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.string(),
});

const applicationSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.string(),
	domain: z.string().optional(),
	aud: z.string(),
	destinations: z
		.array(
			z.object({
				type: z.string(),
				uri: z.string(),
			}),
		)
		.optional(),
});

const policySchema = z.object({
	id: z.string(),
	name: z.string(),
	decision: z.string(),
	include: z
		.array(
			z
				.object({
					email: z.object({ email: z.string() }).optional(),
				})
				.passthrough(),
		)
		.optional(),
});

export interface AccessResult {
	teamDomain: string;
	aud: string;
	appId: string;
}

export interface AccessInspection {
	available: boolean;
	organization: boolean;
	identityProvider: boolean;
	application: boolean;
	policy: boolean;
	policyName?: string;
	policyEmails?: string[];
	policyCount?: number;
	teamDomain?: string;
	appId?: string;
}

export function resolveAccessApiToken(
	environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
	return resolveCloudflareApiToken(environment);
}

function accessToken(): string {
	const token = resolveAccessApiToken();
	if (!token) {
		throw new Error(
			"Access를 재현하려면 CLOUDFLARE_API_TOKEN repository secret이 필요합니다.",
		);
	}
	return token;
}

function findApplication(
	applications: Array<z.output<typeof applicationSchema>>,
	config: DeploymentConfig,
) {
	return applications.find(
		(application) =>
			application.type === "self_hosted" &&
			(application.domain === config.hostname ||
				application.destinations?.some(
					(destination) =>
						destination.type === "public" &&
						destination.uri === config.hostname,
				)),
	);
}

function policyEmails(
	policy: z.output<typeof policySchema> | undefined,
): string[] {
	return [
		...new Set(
			(policy?.include ?? [])
				.map((rule) => rule.email?.email.trim().toLowerCase())
				.filter((email): email is string => Boolean(email)),
		),
	].sort();
}

export function inspectAccessPolicyBoundary(
	policies: Array<z.output<typeof policySchema>>,
	expectedName: string,
	expectedEmails: string[],
): {
	exact: boolean;
	policy?: z.output<typeof policySchema>;
	emails: string[];
} {
	const policy = policies.find((item) => item.name === expectedName);
	const emails = policyEmails(policy);
	return {
		exact:
			policies.length === 1 &&
			policy?.decision === "allow" &&
			JSON.stringify(emails) === JSON.stringify([...expectedEmails].sort()),
		...(policy ? { policy } : {}),
		emails,
	};
}

export async function inspectAccess(
	config: DeploymentConfig,
	tokenOverride?: string,
): Promise<AccessInspection> {
	const token = tokenOverride?.trim() || resolveAccessApiToken();
	if (!token) {
		return {
			available: false,
			organization: false,
			identityProvider: false,
			application: false,
			policy: false,
		};
	}
	const api = new CloudflareApi(config.accountId, token);
	let organization: z.output<typeof organizationSchema>;
	try {
		organization = await api.request("/access/organizations", {
			schema: organizationSchema,
		});
	} catch (error) {
		if (
			error instanceof CloudflareApiError &&
			error.message.includes("Access is not enabled")
		) {
			return {
				available: true,
				organization: false,
				identityProvider: false,
				application: false,
				policy: false,
			};
		}
		throw error;
	}
	const [providers, applications] = await Promise.all([
		api.request("/access/identity_providers?per_page=100", {
			schema: z.array(identityProviderSchema),
		}),
		api.request("/access/apps?per_page=100", {
			schema: z.array(applicationSchema),
		}),
	]);
	const identityProvider = providers.some((item) => item.type === "onetimepin");
	const application = findApplication(applications, config);
	const policies = application
		? await api.request(
				`/access/apps/${application.id}/policies?per_page=100`,
				{ schema: z.array(policySchema) },
			)
		: [];
	const boundary = inspectAccessPolicyBoundary(
		policies,
		config.access.policyName,
		config.access.allowedEmails,
	);
	return {
		available: true,
		organization: true,
		identityProvider,
		application: Boolean(application),
		policy: boundary.exact,
		...(boundary.policy ? { policyName: boundary.policy.name } : {}),
		policyEmails: boundary.emails,
		policyCount: policies.length,
		teamDomain: organization.auth_domain,
		appId: application?.id,
	};
}

export async function deleteAccessApplication(
	config: DeploymentConfig,
	appId: string,
): Promise<void> {
	const api = new CloudflareApi(config.accountId, accessToken());
	await api.request(`/access/apps/${appId}`, {
		schema: z.object({ id: z.string().optional() }),
		method: "DELETE",
	});
}

export function createAccessAllowPolicy(config: DeploymentConfig) {
	return {
		name: config.access.policyName,
		decision: "allow",
		include: config.access.allowedEmails.map((email) => ({
			email: { email },
		})),
	};
}

async function ensureOrganization(
	api: CloudflareApi,
): Promise<z.output<typeof organizationSchema>> {
	try {
		return await api.request("/access/organizations", {
			schema: organizationSchema,
		});
	} catch (error) {
		if (
			!(error instanceof CloudflareApiError) ||
			!error.message.includes("Access is not enabled")
		) {
			throw error;
		}
		throw new Error(
			"Cloudflare Zero Trust organization이 없습니다. Dashboard에서 team name과 plan을 설정한 뒤 deploy를 다시 실행하세요.",
			{ cause: error },
		);
	}
}

async function ensureOneTimePinIdentityProvider(
	api: CloudflareApi,
	config: DeploymentConfig,
): Promise<z.output<typeof identityProviderSchema>> {
	const providers = await api.request(
		"/access/identity_providers?per_page=100",
		{
			schema: z.array(identityProviderSchema),
		},
	);
	let provider = providers.find((item) => item.type === "onetimepin");

	if (!provider) {
		provider = await api.request("/access/identity_providers", {
			schema: identityProviderSchema,
			method: "POST",
			body: {
				name: config.access.identityProviderName,
				type: "onetimepin",
				config: {},
			},
		});
	}

	return provider;
}

export async function ensureAccess(
	config: DeploymentConfig,
): Promise<AccessResult> {
	logger.start("Cloudflare Access 애플리케이션과 정책을 동기화합니다");
	const api = new CloudflareApi(config.accountId, accessToken());
	const organization = await ensureOrganization(api);
	const identityProvider = await ensureOneTimePinIdentityProvider(api, config);

	const applications = await api.request("/access/apps?per_page=100", {
		schema: z.array(applicationSchema),
	});
	const existingApplication = findApplication(applications, config);
	const application = await api.request(
		existingApplication
			? `/access/apps/${existingApplication.id}`
			: "/access/apps",
		{
			schema: applicationSchema,
			method: existingApplication ? "PUT" : "POST",
			body: {
				name: config.access.applicationName,
				type: "self_hosted",
				domain: config.hostname,
				destinations: [{ type: "public", uri: config.hostname }],
				session_duration: config.access.sessionDuration,
				allowed_idps: [identityProvider.id],
				auto_redirect_to_identity: true,
				app_launcher_visible: true,
			},
		},
	);

	const policies = await api.request(
		`/access/apps/${application.id}/policies?per_page=100`,
		{ schema: z.array(policySchema) },
	);
	const existingPolicy = policies.find(
		(policy) => policy.name === config.access.policyName,
	);
	const managedPolicy = await api.request(
		existingPolicy
			? `/access/apps/${application.id}/policies/${existingPolicy.id}`
			: `/access/apps/${application.id}/policies`,
		{
			schema: policySchema,
			method: existingPolicy ? "PUT" : "POST",
			body: createAccessAllowPolicy(config),
		},
	);
	for (const policy of policies) {
		if (policy.id === managedPolicy.id) continue;
		await api.request(`/access/apps/${application.id}/policies/${policy.id}`, {
			schema: z.object({ id: z.string().optional() }),
			method: "DELETE",
		});
	}

	logger.success(
		`Access ${existingApplication ? "updated" : "created"}: ${config.hostname}`,
	);
	return {
		teamDomain: organization.auth_domain,
		aud: application.aud,
		appId: application.id,
	};
}
