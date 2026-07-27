import { z } from "zod";
import {
	type AccessRole,
	accessEmptyGroupEmails,
	isAccessEmptyGroupEmail,
} from "../../shared/contracts/platform.ts";
import type { DeploymentConfig } from "../core/config.ts";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { logger } from "../core/logger.ts";
import { CloudflareApi, CloudflareApiError } from "./api.ts";

const accessRoles = ["owner", "admin", "user"] as const;
const accessApplicationKinds = ["base", "admin", "owner", "public"] as const;
type AccessApplicationKind = (typeof accessApplicationKinds)[number];

const accessRuleSchema = z.record(z.string(), z.unknown());

const organizationSchema = z.object({
	auth_domain: z.string().min(1),
});

const identityProviderSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.string(),
});

const groupSchema = z.object({
	id: z.string(),
	name: z.string(),
	include: z.array(accessRuleSchema),
	exclude: z.array(accessRuleSchema).optional(),
	require: z.array(accessRuleSchema).optional(),
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
				uri: z.string().optional(),
			}),
		)
		.optional(),
});

const policySchema = z.object({
	id: z.string(),
	name: z.string(),
	decision: z.string(),
	include: z.array(accessRuleSchema).optional(),
});

type AccessGroup = z.output<typeof groupSchema>;
type AccessApplication = z.output<typeof applicationSchema>;
type AccessPolicy = z.output<typeof policySchema>;

export interface AccessResult {
	teamDomain: string;
	audiences: Record<Exclude<AccessApplicationKind, "public">, string>;
	applicationIds: Record<AccessApplicationKind, string>;
	groupIds: Record<AccessRole, string>;
}

export interface AccessInspection {
	available: boolean;
	organization: boolean;
	identityProvider: boolean;
	groups: boolean;
	applications: boolean;
	policies: boolean;
	bootstrapOwner: boolean;
	uniqueMemberships: boolean;
	groupMemberCounts?: Record<AccessRole, number>;
	teamDomain?: string;
	applicationIds?: Partial<Record<AccessApplicationKind, string>>;
	groupIds?: Partial<Record<AccessRole, string>>;
}

interface ApplicationDefinition {
	kind: AccessApplicationKind;
	name: string;
	policyName: string;
	destinations: string[];
	decision: "allow" | "bypass";
	groupRoles: AccessRole[];
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

function applicationDefinitions(
	config: DeploymentConfig,
): ApplicationDefinition[] {
	const { hostname } = config;
	return [
		{
			kind: "base",
			name: config.access.applicationNames.base,
			policyName: config.access.policyNames.base,
			destinations: [hostname],
			decision: "allow",
			groupRoles: ["owner", "admin", "user"],
		},
		{
			kind: "admin",
			name: config.access.applicationNames.admin,
			policyName: config.access.policyNames.admin,
			destinations: [
				`${hostname}/admin`,
				`${hostname}/admin/*`,
				`${hostname}/api/admin`,
				`${hostname}/api/admin/*`,
			],
			decision: "allow",
			groupRoles: ["owner", "admin"],
		},
		{
			kind: "owner",
			name: config.access.applicationNames.owner,
			policyName: config.access.policyNames.owner,
			destinations: [
				`${hostname}/owner`,
				`${hostname}/owner/*`,
				`${hostname}/api/owner`,
				`${hostname}/api/owner/*`,
			],
			decision: "allow",
			groupRoles: ["owner"],
		},
		{
			kind: "public",
			name: config.access.applicationNames.public,
			policyName: config.access.policyNames.public,
			destinations: [
				`${hostname}/assets`,
				`${hostname}/assets/*`,
				`${hostname}/public`,
				`${hostname}/public/*`,
				`${hostname}/api/public`,
				`${hostname}/api/public/*`,
			],
			decision: "bypass",
			groupRoles: [],
		},
	];
}

function emailRules(group: AccessGroup | undefined): string[] {
	return [
		...new Set(
			(group?.include ?? [])
				.map((rule) => {
					const value = rule.email;
					if (
						typeof value !== "object" ||
						value === null ||
						!("email" in value) ||
						typeof value.email !== "string"
					) {
						return undefined;
					}
					return value.email.trim().toLowerCase();
				})
				.filter(
					(email): email is string =>
						typeof email === "string" && !isAccessEmptyGroupEmail(email),
				),
		),
	].sort();
}

function findApplications(
	applications: AccessApplication[],
	config: DeploymentConfig,
): Partial<Record<AccessApplicationKind, AccessApplication>> {
	return Object.fromEntries(
		applicationDefinitions(config).flatMap((definition) => {
			const application = applications.find(
				(candidate) =>
					candidate.type === "self_hosted" &&
					candidate.name === definition.name,
			);
			return application ? [[definition.kind, application]] : [];
		}),
	);
}

function findGroups(
	groups: AccessGroup[],
	config: DeploymentConfig,
): Partial<Record<AccessRole, AccessGroup>> {
	return Object.fromEntries(
		accessRoles.flatMap((role) => {
			const group = groups.find(
				(candidate) => candidate.name === config.access.groupNames[role],
			);
			return group ? [[role, group]] : [];
		}),
	);
}

function groupRuleIds(policy: AccessPolicy | undefined): string[] {
	return [
		...new Set(
			(policy?.include ?? [])
				.map((rule) => {
					const value = rule.group;
					if (
						typeof value !== "object" ||
						value === null ||
						!("id" in value) ||
						typeof value.id !== "string"
					) {
						return undefined;
					}
					return value.id;
				})
				.filter((id): id is string => Boolean(id)),
		),
	].sort();
}

function hasEveryoneRule(policy: AccessPolicy | undefined): boolean {
	return (policy?.include ?? []).some(
		(rule) =>
			typeof rule.everyone === "object" &&
			rule.everyone !== null &&
			Object.keys(rule.everyone).length === 0,
	);
}

export function inspectAccessPolicyBoundary(
	policies: AccessPolicy[],
	expectedName: string,
	decision: "allow" | "bypass",
	expectedGroupIds: string[],
): boolean {
	const policy = policies.find((item) => item.name === expectedName);
	if (!policy || policies.length !== 1 || policy.decision !== decision) {
		return false;
	}
	return decision === "bypass"
		? hasEveryoneRule(policy)
		: JSON.stringify(groupRuleIds(policy)) ===
				JSON.stringify([...expectedGroupIds].sort());
}

export function createAccessPolicy(
	name: string,
	decision: "allow" | "bypass",
	groupIds: string[],
) {
	return {
		name,
		decision,
		include:
			decision === "bypass"
				? [{ everyone: {} }]
				: groupIds.map((id) => ({ group: { id } })),
	};
}

async function inspectPolicies(
	api: CloudflareApi,
	applications: Partial<Record<AccessApplicationKind, AccessApplication>>,
	groups: Partial<Record<AccessRole, AccessGroup>>,
	config: DeploymentConfig,
): Promise<boolean> {
	const definitions = applicationDefinitions(config);
	const results = await Promise.all(
		definitions.map(async (definition) => {
			const application = applications[definition.kind];
			if (!application) return false;
			const policies = await api.request(
				`/access/apps/${application.id}/policies?per_page=100`,
				{ schema: z.array(policySchema) },
			);
			const expectedGroupIds = definition.groupRoles.flatMap((role) => {
				const id = groups[role]?.id;
				return id ? [id] : [];
			});
			return (
				expectedGroupIds.length === definition.groupRoles.length &&
				inspectAccessPolicyBoundary(
					policies,
					definition.policyName,
					definition.decision,
					expectedGroupIds,
				)
			);
		}),
	);
	return results.every(Boolean);
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
			groups: false,
			applications: false,
			policies: false,
			bootstrapOwner: false,
			uniqueMemberships: false,
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
				groups: false,
				applications: false,
				policies: false,
				bootstrapOwner: false,
				uniqueMemberships: false,
			};
		}
		throw error;
	}
	const [providers, allGroups, allApplications] = await Promise.all([
		api.request("/access/identity_providers?per_page=100", {
			schema: z.array(identityProviderSchema),
		}),
		api.request("/access/groups?per_page=100", {
			schema: z.array(groupSchema),
		}),
		api.request("/access/apps?per_page=100", {
			schema: z.array(applicationSchema),
		}),
	]);
	const groups = findGroups(allGroups, config);
	const applications = findApplications(allApplications, config);
	const memberLists = Object.fromEntries(
		accessRoles.map((role) => [role, emailRules(groups[role])]),
	) as Record<AccessRole, string[]>;
	const allMembers = accessRoles.flatMap((role) => memberLists[role]);
	const completeGroups = accessRoles.every((role) => Boolean(groups[role]));
	const completeApplications = accessApplicationKinds.every((kind) =>
		Boolean(applications[kind]),
	);
	const policies =
		completeGroups &&
		completeApplications &&
		(await inspectPolicies(api, applications, groups, config));
	return {
		available: true,
		organization: true,
		identityProvider: providers.some((item) => item.type === "onetimepin"),
		groups: completeGroups,
		applications: completeApplications,
		policies,
		bootstrapOwner: memberLists.owner.includes(
			config.access.bootstrapOwnerEmail,
		),
		uniqueMemberships: new Set(allMembers).size === allMembers.length,
		groupMemberCounts: Object.fromEntries(
			accessRoles.map((role) => [role, memberLists[role].length]),
		) as Record<AccessRole, number>,
		teamDomain: organization.auth_domain,
		applicationIds: Object.fromEntries(
			accessApplicationKinds.flatMap((kind) => {
				const id = applications[kind]?.id;
				return id ? [[kind, id]] : [];
			}),
		),
		groupIds: Object.fromEntries(
			accessRoles.flatMap((role) => {
				const id = groups[role]?.id;
				return id ? [[role, id]] : [];
			}),
		),
	};
}

export async function deleteAccessApplications(
	config: DeploymentConfig,
	applicationIds: string[],
): Promise<void> {
	const api = new CloudflareApi(config.accountId, accessToken());
	for (const applicationId of applicationIds) {
		await api.request(`/access/apps/${applicationId}`, {
			schema: z.unknown(),
			method: "DELETE",
		});
	}
}

export async function deleteAccessGroups(
	config: DeploymentConfig,
	groupIds: string[],
): Promise<void> {
	const api = new CloudflareApi(config.accountId, accessToken());
	for (const groupId of groupIds) {
		await api.request(`/access/groups/${groupId}`, {
			schema: z.unknown(),
			method: "DELETE",
		});
	}
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

async function ensureGroups(
	api: CloudflareApi,
	config: DeploymentConfig,
): Promise<Record<AccessRole, AccessGroup>> {
	const existingGroups = await api.request("/access/groups?per_page=100", {
		schema: z.array(groupSchema),
	});
	const groups = {} as Record<AccessRole, AccessGroup>;
	const assignedEmails = new Set<string>();
	for (const role of accessRoles) {
		const existing = existingGroups.find(
			(group) => group.name === config.access.groupNames[role],
		);
		const otherBootstrapRole = role !== "owner";
		const currentRules = existing?.include ?? [];
		const include = currentRules.flatMap((rule) => {
			const value = rule.email;
			if (
				typeof value !== "object" ||
				value === null ||
				!("email" in value) ||
				typeof value.email !== "string"
			) {
				return [];
			}
			const email = value.email.trim().toLowerCase();
			if (
				isAccessEmptyGroupEmail(email) ||
				(otherBootstrapRole && email === config.access.bootstrapOwnerEmail) ||
				assignedEmails.has(email)
			) {
				return [];
			}
			assignedEmails.add(email);
			return [{ email: { email } }];
		});
		if (
			role === "owner" &&
			!emailRules(existing).includes(config.access.bootstrapOwnerEmail)
		) {
			include.push({
				email: { email: config.access.bootstrapOwnerEmail },
			});
			assignedEmails.add(config.access.bootstrapOwnerEmail);
		}
		if (include.length === 0) {
			include.push({ email: { email: accessEmptyGroupEmails[role] } });
		}
		const body = {
			name: config.access.groupNames[role],
			include,
			exclude: [],
			require: [],
			is_default: false,
		};
		groups[role] = await api.request(
			existing ? `/access/groups/${existing.id}` : "/access/groups",
			{
				schema: groupSchema,
				method: existing ? "PUT" : "POST",
				body,
			},
		);
	}
	return groups;
}

async function ensureApplication(
	api: CloudflareApi,
	definition: ApplicationDefinition,
	existing: AccessApplication | undefined,
	identityProviderId: string,
	config: DeploymentConfig,
): Promise<AccessApplication> {
	const application = await api.request(
		existing ? `/access/apps/${existing.id}` : "/access/apps",
		{
			schema: applicationSchema,
			method: existing ? "PUT" : "POST",
			body: {
				name: definition.name,
				type: "self_hosted",
				domain: definition.destinations[0],
				destinations: definition.destinations.map((uri) => ({
					type: "public",
					uri,
				})),
				session_duration: config.access.sessionDuration,
				allowed_idps: [identityProviderId],
				auto_redirect_to_identity: true,
				app_launcher_visible: definition.kind === "base",
			},
		},
	);
	const policies = await api.request(
		`/access/apps/${application.id}/policies?per_page=100`,
		{ schema: z.array(policySchema) },
	);
	return Object.assign(application, { existingPolicies: policies });
}

async function ensureApplicationPolicy(
	api: CloudflareApi,
	application: AccessApplication & { existingPolicies?: AccessPolicy[] },
	definition: ApplicationDefinition,
	groups: Record<AccessRole, AccessGroup>,
): Promise<void> {
	const policies = application.existingPolicies ?? [];
	const existing = policies.find(
		(policy) => policy.name === definition.policyName,
	);
	const managedPolicy = await api.request(
		existing
			? `/access/apps/${application.id}/policies/${existing.id}`
			: `/access/apps/${application.id}/policies`,
		{
			schema: policySchema,
			method: existing ? "PUT" : "POST",
			body: createAccessPolicy(
				definition.policyName,
				definition.decision,
				definition.groupRoles.map((role) => groups[role].id),
			),
		},
	);
	for (const policy of policies) {
		if (policy.id === managedPolicy.id) continue;
		await api.request(`/access/apps/${application.id}/policies/${policy.id}`, {
			schema: z.unknown(),
			method: "DELETE",
		});
	}
}

export async function ensureAccess(
	config: DeploymentConfig,
): Promise<AccessResult> {
	logger.start("Cloudflare Access 역할 그룹과 경로 정책을 동기화합니다");
	const api = new CloudflareApi(config.accountId, accessToken());
	const organization = await ensureOrganization(api);
	const identityProvider = await ensureOneTimePinIdentityProvider(api, config);
	const groups = await ensureGroups(api, config);
	const existingApplications = findApplications(
		await api.request("/access/apps?per_page=100", {
			schema: z.array(applicationSchema),
		}),
		config,
	);
	const applications = {} as Record<AccessApplicationKind, AccessApplication>;
	for (const definition of applicationDefinitions(config)) {
		const application = await ensureApplication(
			api,
			definition,
			existingApplications[definition.kind],
			identityProvider.id,
			config,
		);
		await ensureApplicationPolicy(api, application, definition, groups);
		applications[definition.kind] = application;
	}
	logger.success(`Access roles updated: ${config.hostname}`);
	return {
		teamDomain: organization.auth_domain,
		audiences: {
			base: applications.base.aud,
			admin: applications.admin.aud,
			owner: applications.owner.aud,
		},
		applicationIds: Object.fromEntries(
			accessApplicationKinds.map((kind) => [kind, applications[kind].id]),
		) as Record<AccessApplicationKind, string>,
		groupIds: Object.fromEntries(
			accessRoles.map((role) => [role, groups[role].id]),
		) as Record<AccessRole, string>,
	};
}
