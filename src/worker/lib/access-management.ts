import { z } from "zod";
import {
	type AccessMember,
	type AccessRole,
	accessEmptyGroupEmails,
	accessRoles,
	isAccessEmptyGroupEmail,
} from "../../shared/contracts";
import { AppError } from "./errors";

const accessRuleSchema = z.record(z.string(), z.unknown());
const accessGroupSchema = z.object({
	id: z.string(),
	name: z.string(),
	include: z.array(accessRuleSchema),
	exclude: z.array(accessRuleSchema).optional(),
	require: z.array(accessRuleSchema).optional(),
});
const cloudflareEnvelopeSchema = z.object({
	success: z.boolean(),
	result: z.unknown(),
	errors: z
		.array(
			z.object({
				message: z.string().optional(),
			}),
		)
		.optional(),
});
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

type AccessGroup = z.output<typeof accessGroupSchema>;
type Fetcher = typeof fetch;
const roleCache = new Map<string, { role: AccessRole; expiresAt: number }>();
const roleCacheTtlMs = 30_000;

export interface AccessManagementBindings {
	ACCESS_ACCOUNT_ID: string;
	ACCESS_GROUP_OWNER_ID: string;
	ACCESS_GROUP_ADMIN_ID: string;
	ACCESS_GROUP_MEMBER_ID: string;
	ACCESS_BOOTSTRAP_OWNER_EMAIL: string;
	ACCESS_MANAGEMENT_TOKEN?: string;
}

export interface AccessManagementClient {
	listMembers(): Promise<AccessMember[]>;
	resolveRole(email: string): Promise<AccessRole>;
	setRole(email: string, role: AccessRole): Promise<AccessMember[]>;
	remove(email: string): Promise<AccessMember[]>;
}

function configuredBindings(env: AccessManagementBindings) {
	const token = env.ACCESS_MANAGEMENT_TOKEN?.trim();
	const accountId = env.ACCESS_ACCOUNT_ID?.trim();
	const bootstrapOwnerEmail = emailSchema.safeParse(
		env.ACCESS_BOOTSTRAP_OWNER_EMAIL,
	);
	const groupIds = {
		owner: env.ACCESS_GROUP_OWNER_ID?.trim(),
		admin: env.ACCESS_GROUP_ADMIN_ID?.trim(),
		member: env.ACCESS_GROUP_MEMBER_ID?.trim(),
	};
	if (
		!token ||
		!accountId ||
		!bootstrapOwnerEmail.success ||
		accessRoles.some((role) => !groupIds[role])
	) {
		throw new AppError(
			503,
			"ACCESS_MANAGEMENT_NOT_CONFIGURED",
			"Access 역할 관리 설정이 완전하지 않습니다.",
		);
	}
	return {
		token,
		accountId,
		bootstrapOwnerEmail: bootstrapOwnerEmail.data,
		groupIds: groupIds as Record<AccessRole, string>,
	};
}

function roleCacheKey(env: AccessManagementBindings, email: string): string {
	return `${env.ACCESS_ACCOUNT_ID}:${env.ACCESS_GROUP_OWNER_ID}:${env.ACCESS_GROUP_ADMIN_ID}:${env.ACCESS_GROUP_MEMBER_ID}:${email}`;
}

function emailFromRule(rule: Record<string, unknown>): string | undefined {
	const value = rule.email;
	if (
		typeof value !== "object" ||
		value === null ||
		!("email" in value) ||
		typeof value.email !== "string"
	) {
		return undefined;
	}
	const parsed = emailSchema.safeParse(value.email);
	return parsed.success && !isAccessEmptyGroupEmail(parsed.data)
		? parsed.data
		: undefined;
}

function groupEmails(group: AccessGroup): string[] {
	return [
		...new Set(
			group.include
				.map(emailFromRule)
				.filter((email): email is string => Boolean(email)),
		),
	].sort();
}

function roleRules(
	role: AccessRole,
	emails: string[],
	email: string,
): Array<Record<string, unknown>> {
	const remaining = [
		...new Set(emails.filter((candidate) => candidate !== email)),
	];
	return (
		remaining.length > 0 ? remaining : [accessEmptyGroupEmails[role]]
	).map((candidate) => ({ email: { email: candidate } }));
}

async function cloudflareRequest<T>(
	env: AccessManagementBindings,
	path: string,
	schema: z.ZodType<T>,
	fetcher: Fetcher,
	options: {
		method?: "GET" | "POST" | "PUT";
		body?: Record<string, unknown>;
	} = {},
): Promise<T> {
	const config = configuredBindings(env);
	let response: Response;
	try {
		response = await fetcher(
			`https://api.cloudflare.com/client/v4/accounts/${config.accountId}${path}`,
			{
				method: options.method ?? "GET",
				headers: {
					Authorization: `Bearer ${config.token}`,
					"Content-Type": "application/json",
				},
				...(options.body ? { body: JSON.stringify(options.body) } : {}),
			},
		);
	} catch {
		throw new AppError(
			503,
			"ACCESS_MANAGEMENT_UNAVAILABLE",
			"Cloudflare Access API에 연결하지 못했습니다.",
		);
	}
	let payload: z.output<typeof cloudflareEnvelopeSchema>;
	try {
		payload = cloudflareEnvelopeSchema.parse(await response.json());
	} catch {
		throw new AppError(
			503,
			"ACCESS_MANAGEMENT_INVALID_RESPONSE",
			"Cloudflare Access API 응답을 해석하지 못했습니다.",
		);
	}
	if (!response.ok || !payload.success) {
		throw new AppError(
			503,
			"ACCESS_MANAGEMENT_FAILED",
			"Cloudflare Access 역할을 변경하지 못했습니다.",
			{
				errors:
					payload.errors?.flatMap((error) =>
						error.message ? [error.message] : [],
					) ?? [],
			},
		);
	}
	return schema.parse(payload.result);
}

async function loadGroups(
	env: AccessManagementBindings,
	fetcher: Fetcher,
): Promise<Record<AccessRole, AccessGroup>> {
	const config = configuredBindings(env);
	const entries = await Promise.all(
		accessRoles.map(
			async (role) =>
				[
					role,
					await cloudflareRequest(
						env,
						`/access/groups/${config.groupIds[role]}`,
						accessGroupSchema,
						fetcher,
					),
				] as const,
		),
	);
	return Object.fromEntries(entries) as Record<AccessRole, AccessGroup>;
}

function membersFromGroups(
	groups: Record<AccessRole, AccessGroup>,
	bootstrapOwnerEmail: string,
): AccessMember[] {
	const rolesByEmail = new Map<string, AccessRole[]>();
	for (const role of accessRoles) {
		for (const email of groupEmails(groups[role])) {
			rolesByEmail.set(email, [...(rolesByEmail.get(email) ?? []), role]);
		}
	}
	const priority: AccessRole[] = ["owner", "admin", "member"];
	return [...rolesByEmail.entries()]
		.map(([email, roles]) => ({
			email,
			role: priority.find((role) => roles.includes(role)) ?? "member",
			bootstrap: email === bootstrapOwnerEmail,
		}))
		.sort((left, right) => left.email.localeCompare(right.email));
}

async function updateGroup(
	env: AccessManagementBindings,
	group: AccessGroup,
	role: AccessRole,
	include: Array<Record<string, unknown>>,
	fetcher: Fetcher,
): Promise<void> {
	await cloudflareRequest(
		env,
		`/access/groups/${group.id}`,
		accessGroupSchema,
		fetcher,
		{
			method: "PUT",
			body: {
				name: group.name,
				include:
					include.length > 0
						? include
						: [{ email: { email: accessEmptyGroupEmails[role] } }],
				exclude: [],
				require: [],
				is_default: false,
			},
		},
	);
}

async function revokeUser(
	env: AccessManagementBindings,
	email: string,
	fetcher: Fetcher,
): Promise<void> {
	await cloudflareRequest(
		env,
		"/access/organizations/revoke_user",
		z.boolean(),
		fetcher,
		{ method: "POST", body: { email } },
	);
}

export function createAccessManagementClient(
	env: AccessManagementBindings,
	fetcher: Fetcher = fetch,
): AccessManagementClient {
	return {
		async listMembers(): Promise<AccessMember[]> {
			const config = configuredBindings(env);
			return membersFromGroups(
				await loadGroups(env, fetcher),
				config.bootstrapOwnerEmail,
			);
		},

		async resolveRole(emailInput: string): Promise<AccessRole> {
			const email = emailSchema.parse(emailInput);
			const cacheKey = roleCacheKey(env, email);
			const cached = roleCache.get(cacheKey);
			if (cached && cached.expiresAt > Date.now()) return cached.role;
			const members = await this.listMembers();
			const member = members.find((candidate) => candidate.email === email);
			if (!member) {
				throw new AppError(
					403,
					"USER_NOT_ALLOWED",
					"Cloudflare Access 역할 그룹에 속하지 않은 사용자입니다.",
				);
			}
			roleCache.set(cacheKey, {
				role: member.role,
				expiresAt: Date.now() + roleCacheTtlMs,
			});
			return member.role;
		},

		async setRole(
			emailInput: string,
			role: AccessRole,
		): Promise<AccessMember[]> {
			const config = configuredBindings(env);
			const email = emailSchema.parse(emailInput);
			if (!accessRoles.includes(role)) {
				throw new AppError(400, "INVALID_ROLE", "지원하지 않는 역할입니다.");
			}
			if (email === config.bootstrapOwnerEmail && role !== "owner") {
				throw new AppError(
					409,
					"BOOTSTRAP_OWNER_PROTECTED",
					"초기 Owner는 강등할 수 없습니다.",
				);
			}
			const groups = await loadGroups(env, fetcher);
			const currentRole = accessRoles.find((candidate) =>
				groupEmails(groups[candidate]).includes(email),
			);
			if (
				currentRole === "owner" &&
				role !== "owner" &&
				groupEmails(groups.owner).length <= 1
			) {
				throw new AppError(
					409,
					"LAST_OWNER_PROTECTED",
					"마지막 Owner는 강등할 수 없습니다.",
				);
			}
			if (currentRole !== role) {
				const targetRules = [
					...groupEmails(groups[role]).filter(
						(candidate) => candidate !== email,
					),
					email,
				].map((candidate) => ({ email: { email: candidate } }));
				await updateGroup(env, groups[role], role, targetRules, fetcher);
				for (const otherRole of accessRoles) {
					if (otherRole === role) continue;
					const otherEmails = groupEmails(groups[otherRole]);
					if (otherEmails.includes(email)) {
						await updateGroup(
							env,
							groups[otherRole],
							otherRole,
							roleRules(otherRole, otherEmails, email),
							fetcher,
						);
					}
				}
				await revokeUser(env, email, fetcher);
			}
			roleCache.delete(roleCacheKey(env, email));
			return this.listMembers();
		},

		async remove(emailInput: string): Promise<AccessMember[]> {
			const config = configuredBindings(env);
			const email = emailSchema.parse(emailInput);
			if (email === config.bootstrapOwnerEmail) {
				throw new AppError(
					409,
					"BOOTSTRAP_OWNER_PROTECTED",
					"초기 Owner는 제거할 수 없습니다.",
				);
			}
			const groups = await loadGroups(env, fetcher);
			const ownerEmails = groupEmails(groups.owner);
			if (ownerEmails.includes(email) && ownerEmails.length <= 1) {
				throw new AppError(
					409,
					"LAST_OWNER_PROTECTED",
					"마지막 Owner는 제거할 수 없습니다.",
				);
			}
			let changed = false;
			for (const role of accessRoles) {
				const emails = groupEmails(groups[role]);
				if (emails.includes(email)) {
					await updateGroup(
						env,
						groups[role],
						role,
						roleRules(role, emails, email),
						fetcher,
					);
					changed = true;
				}
			}
			if (changed) await revokeUser(env, email, fetcher);
			roleCache.delete(roleCacheKey(env, email));
			return this.listMembers();
		},
	};
}

const developmentMembers = new Map<string, AccessMember[]>();

function developmentStateKey(env: AccessManagementBindings): string {
	return env.ACCESS_BOOTSTRAP_OWNER_EMAIL.trim().toLowerCase();
}

function developmentBootstrapOwner(env: AccessManagementBindings): string {
	const parsed = emailSchema.safeParse(env.ACCESS_BOOTSTRAP_OWNER_EMAIL);
	if (!parsed.success) {
		throw new AppError(
			503,
			"ACCESS_MANAGEMENT_NOT_CONFIGURED",
			"로컬 Bootstrap Owner 이메일이 올바르지 않습니다.",
		);
	}
	return parsed.data;
}

function developmentMemberState(env: AccessManagementBindings): AccessMember[] {
	const key = developmentStateKey(env);
	const existing = developmentMembers.get(key);
	if (existing) return existing;
	const initial = [
		{
			email: developmentBootstrapOwner(env),
			role: "owner" as const,
			bootstrap: true,
		},
	];
	developmentMembers.set(key, initial);
	return initial;
}

export function createDevelopmentAccessManagementClient(
	env: AccessManagementBindings,
): AccessManagementClient {
	const save = (members: AccessMember[]) => {
		const sorted = [...members].sort((left, right) =>
			left.email.localeCompare(right.email),
		);
		developmentMembers.set(developmentStateKey(env), sorted);
		return sorted;
	};
	return {
		async listMembers() {
			return [...developmentMemberState(env)];
		},
		async resolveRole(emailInput) {
			const email = emailSchema.parse(emailInput);
			const member = developmentMemberState(env).find(
				(candidate) => candidate.email === email,
			);
			if (!member) {
				throw new AppError(
					403,
					"USER_NOT_ALLOWED",
					"로컬 역할 시뮬레이션에 없는 사용자입니다.",
				);
			}
			return member.role;
		},
		async setRole(emailInput, role) {
			const bootstrapOwnerEmail = developmentBootstrapOwner(env);
			const email = emailSchema.parse(emailInput);
			if (email === bootstrapOwnerEmail && role !== "owner") {
				throw new AppError(
					409,
					"BOOTSTRAP_OWNER_PROTECTED",
					"초기 Owner는 강등할 수 없습니다.",
				);
			}
			const members = developmentMemberState(env);
			const current = members.find((member) => member.email === email);
			return save([
				...members.filter((member) => member.email !== email),
				{
					email,
					role,
					bootstrap: current?.bootstrap ?? false,
				},
			]);
		},
		async remove(emailInput) {
			const bootstrapOwnerEmail = developmentBootstrapOwner(env);
			const email = emailSchema.parse(emailInput);
			if (email === bootstrapOwnerEmail) {
				throw new AppError(
					409,
					"BOOTSTRAP_OWNER_PROTECTED",
					"초기 Owner는 제거할 수 없습니다.",
				);
			}
			const members = developmentMemberState(env);
			const ownerCount = members.filter(
				(member) => member.role === "owner",
			).length;
			const target = members.find((member) => member.email === email);
			if (target?.role === "owner" && ownerCount <= 1) {
				throw new AppError(
					409,
					"LAST_OWNER_PROTECTED",
					"마지막 Owner는 제거할 수 없습니다.",
				);
			}
			return save(members.filter((member) => member.email !== email));
		},
	};
}
