import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { CurrentUser } from "../../shared/contracts";
import { AppError } from "../lib/errors";
import type { AppEnv, UserRow } from "../types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(value: string): string {
	return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function parseAllowedEmails(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) throw new Error("not an array");
		const emails = parsed
			.filter((email): email is string => typeof email === "string")
			.map((email) => email.trim().toLowerCase())
			.filter(Boolean);
		if (emails.length === 0) throw new Error("empty array");
		return [...new Set(emails)];
	} catch {
		throw new AppError(
			503,
			"AUTH_NOT_CONFIGURED",
			"ACCESS_ALLOWED_EMAILS를 JSON 이메일 배열로 설정해야 합니다.",
		);
	}
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

async function verifyAccessIdentity(
	request: Request,
	env: Cloudflare.Env,
): Promise<string> {
	const token = request.headers.get("Cf-Access-Jwt-Assertion");
	const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);

	if (!teamDomain || !env.ACCESS_AUD) {
		throw new AppError(
			503,
			"AUTH_NOT_CONFIGURED",
			"ACCESS_TEAM_DOMAIN과 ACCESS_AUD를 설정해야 합니다.",
		);
	}
	if (!token) {
		throw new AppError(
			401,
			"UNAUTHENTICATED",
			"Cloudflare Access 로그인이 필요합니다.",
		);
	}

	const { payload } = await jwtVerify(token, getJwks(teamDomain), {
		audience: env.ACCESS_AUD,
		issuer: `https://${teamDomain}`,
	});
	const email = payload.email;
	if (typeof email !== "string" || !email.includes("@")) {
		throw new AppError(
			401,
			"INVALID_IDENTITY",
			"Access 토큰에 이메일이 없습니다.",
		);
	}
	return email.toLowerCase();
}

async function resolveUser(
	db: D1Database,
	email: string,
): Promise<CurrentUser> {
	const now = new Date().toISOString();
	await db
		.prepare(
			"INSERT OR IGNORE INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)",
		)
		.bind(crypto.randomUUID(), email, now, now)
		.run();
	const user = await db
		.prepare("SELECT id, email FROM users WHERE email = ? COLLATE NOCASE")
		.bind(email)
		.first<UserRow>();
	if (!user) {
		throw new AppError(
			500,
			"IDENTITY_PERSIST_FAILED",
			"사용자 식별 정보를 저장하지 못했습니다.",
		);
	}
	return user;
}

export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
	let email: string;
	const allowedEmails = parseAllowedEmails(c.env.ACCESS_ALLOWED_EMAILS);
	const defaultEmail = allowedEmails[0];
	if (!defaultEmail) {
		throw new AppError(
			503,
			"AUTH_NOT_CONFIGURED",
			"ACCESS_ALLOWED_EMAILS에는 최소 한 명의 이메일이 필요합니다.",
		);
	}
	const isDevelopment = c.env.ENVIRONMENT === "development";

	if (isDevelopment) {
		email = (c.req.header("X-Dev-User") ?? defaultEmail).toLowerCase();
	} else {
		email = await verifyAccessIdentity(c.req.raw, c.env);
	}

	if (!allowedEmails.includes(email)) {
		throw new AppError(
			403,
			"USER_NOT_ALLOWED",
			"접근이 허용되지 않은 이메일입니다.",
		);
	}

	const user = await resolveUser(c.env.APP_DB, email);
	c.set("user", user);
	await next();
};
