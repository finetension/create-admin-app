import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
	type AccessRole,
	accessRoles,
	type CurrentUser,
} from "../../shared/contracts";
import {
	type AccessManagementBindings,
	createAccessManagementClient,
} from "../lib/access-management";
import { AppError } from "../lib/errors";
import type { AppEnv, UserRow } from "../types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export interface IdentityBindings extends AccessManagementBindings {
	ENVIRONMENT: string;
	DEV_USER_EMAIL?: string;
	DEV_ACCESS_ROLE?: string;
	DEV_ACCESS_PUBLIC?: string;
	ACCESS_TEAM_DOMAIN: string;
	ACCESS_AUD_BASE: string;
	ACCESS_AUD_ADMIN: string;
	ACCESS_AUD_OWNER: string;
}

export interface AccessIdentity {
	email: string;
	role: AccessRole;
}

export type AccessIdentityVerifier = (
	request: Request,
	env: IdentityBindings,
) => Promise<string>;

export type AccessRoleResolver = (
	email: string,
	env: IdentityBindings,
) => Promise<AccessRole>;

type AccessJwtVerifier = (
	token: string,
	jwks: ReturnType<typeof createRemoteJWKSet>,
	options: { issuer: string; audience: string },
) => Promise<{ payload: unknown }>;

const defaultAccessJwtVerifier: AccessJwtVerifier = async (
	token,
	jwks,
	options,
) => {
	const { payload } = await jwtVerify(token, jwks, options);
	return { payload };
};

function normalizeTeamDomain(value: string): string {
	return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function audienceForPath(pathname: string, env: IdentityBindings): string {
	if (pathname === "/api/owner" || pathname.startsWith("/api/owner/")) {
		return env.ACCESS_AUD_OWNER;
	}
	if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
		return env.ACCESS_AUD_ADMIN;
	}
	return env.ACCESS_AUD_BASE;
}

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
	const existing = jwksCache.get(teamDomain);
	if (existing) return existing;
	const jwks = createRemoteJWKSet(
		new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
	);
	jwksCache.set(teamDomain, jwks);
	return jwks;
}

export function accessJwtVerificationOptions(
	teamDomain: string,
	audience: string,
): { issuer: string; audience: string } {
	const normalized = normalizeTeamDomain(teamDomain);
	return {
		issuer: `https://${normalized}`,
		audience,
	};
}

export async function verifyAccessIdentity(
	request: Request,
	env: IdentityBindings,
	verifyJwt: AccessJwtVerifier = defaultAccessJwtVerifier,
): Promise<string> {
	const token = request.headers.get("Cf-Access-Jwt-Assertion");
	const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
	const audience = audienceForPath(new URL(request.url).pathname, env);
	if (!teamDomain || !audience) {
		throw new AppError(
			503,
			"AUTH_NOT_CONFIGURED",
			"Cloudflare Access issuer와 route audience를 설정해야 합니다.",
		);
	}
	if (!token) {
		throw new AppError(
			401,
			"UNAUTHENTICATED",
			"Cloudflare Access 로그인이 필요합니다.",
		);
	}
	let payload: unknown;
	try {
		({ payload } = await verifyJwt(
			token,
			getJwks(teamDomain),
			accessJwtVerificationOptions(teamDomain, audience),
		));
	} catch {
		throw new AppError(
			401,
			"INVALID_ACCESS_ASSERTION",
			"Cloudflare Access assertion을 검증하지 못했습니다.",
		);
	}
	const email =
		typeof payload === "object" && payload !== null && "email" in payload
			? payload.email
			: undefined;
	if (typeof email !== "string" || !email.includes("@")) {
		throw new AppError(
			401,
			"INVALID_IDENTITY",
			"Access 토큰에 이메일이 없습니다.",
		);
	}
	return email.trim().toLowerCase();
}

async function resolveProductionRole(
	email: string,
	env: IdentityBindings,
): Promise<AccessRole> {
	return createAccessManagementClient(env).resolveRole(email);
}

function resolveDevelopmentIdentity(env: IdentityBindings): AccessIdentity {
	const publicAccess = env.DEV_ACCESS_PUBLIC?.trim() ?? "false";
	if (publicAccess !== "true" && publicAccess !== "false") {
		throw new AppError(
			503,
			"AUTH_NOT_CONFIGURED",
			"DEV_ACCESS_PUBLIC은 true 또는 false여야 합니다.",
		);
	}
	if (publicAccess === "true") {
		throw new AppError(
			401,
			"UNAUTHENTICATED",
			"Public 개발 접근에는 인증 사용자가 없습니다.",
		);
	}
	const email = env.DEV_USER_EMAIL?.trim().toLowerCase();
	const role = env.DEV_ACCESS_ROLE?.trim();
	if (!email?.includes("@") || !role) {
		throw new AppError(
			503,
			"AUTH_NOT_CONFIGURED",
			"DEV_USER_EMAIL과 DEV_ACCESS_ROLE을 설정해야 합니다.",
		);
	}
	if (!accessRoles.includes(role as AccessRole)) {
		throw new AppError(
			503,
			"AUTH_NOT_CONFIGURED",
			"DEV_ACCESS_ROLE은 owner, admin, member 중 하나여야 합니다.",
		);
	}
	return { email, role: role as AccessRole };
}

export async function resolveIdentity(
	request: Request,
	env: IdentityBindings,
	verifyIdentity: AccessIdentityVerifier = verifyAccessIdentity,
	resolveRole: AccessRoleResolver = resolveProductionRole,
): Promise<AccessIdentity> {
	if (env.ENVIRONMENT === "development") {
		return resolveDevelopmentIdentity(env);
	}
	const email = await verifyIdentity(request, env);
	return { email, role: await resolveRole(email, env) };
}

function assertRouteRole(pathname: string, role: AccessRole): void {
	if (
		(pathname === "/api/owner" || pathname.startsWith("/api/owner/")) &&
		role !== "owner"
	) {
		throw new AppError(403, "FORBIDDEN", "Owner 권한이 필요합니다.");
	}
	if (
		(pathname === "/api/admin" || pathname.startsWith("/api/admin/")) &&
		role === "member"
	) {
		throw new AppError(403, "FORBIDDEN", "Admin 권한이 필요합니다.");
	}
}

export async function resolveUser(
	db: D1Database,
	identity: AccessIdentity,
): Promise<CurrentUser> {
	const now = new Date().toISOString();
	await db
		.prepare(
			"INSERT OR IGNORE INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)",
		)
		.bind(crypto.randomUUID(), identity.email, now, now)
		.run();
	const user = await db
		.prepare("SELECT id, email FROM users WHERE email = ? COLLATE NOCASE")
		.bind(identity.email)
		.first<UserRow>();
	if (!user) {
		throw new AppError(
			500,
			"IDENTITY_PERSIST_FAILED",
			"사용자 식별 정보를 저장하지 못했습니다.",
		);
	}
	return { ...user, role: identity.role };
}

export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
	const identity = await resolveIdentity(c.req.raw, c.env);
	assertRouteRole(c.req.path, identity.role);
	const user = await resolveUser(c.env.APP_DB, identity);
	c.set("user", user);
	await next();
};
