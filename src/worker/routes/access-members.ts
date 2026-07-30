import { Hono } from "hono";
import { z } from "zod";
import { type AccessMember, accessRoles } from "../../shared/contracts";
import {
	createAccessManagementClient,
	createDevelopmentAccessManagementClient,
} from "../lib/access-management";
import { auditStatement } from "../lib/audit";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

const updateMemberSchema = z.object({
	role: z.enum(accessRoles),
	displayName: z.string().trim().max(80).optional(),
});
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

interface AccessMemberProfileRow {
	email: string;
	display_name: string;
}

function memberEmail(value: string): string {
	const parsed = emailSchema.safeParse(value);
	if (!parsed.success) {
		throw new AppError(
			400,
			"INVALID_EMAIL",
			"올바른 멤버 이메일이 필요합니다.",
		);
	}
	return parsed.data;
}

async function updateInput(request: Request) {
	try {
		return updateMemberSchema.parse(await request.json());
	} catch {
		throw new AppError(
			400,
			"INVALID_MEMBER_INPUT",
			"올바른 역할과 80자 이하의 이름이 필요합니다.",
		);
	}
}

export const accessMembers = new Hono<AppEnv>();

function accessClient(env: Cloudflare.Env) {
	return env.ENVIRONMENT === "development"
		? createDevelopmentAccessManagementClient(env)
		: createAccessManagementClient(env);
}

async function enrichMembers(db: D1Database, members: AccessMember[]) {
	const profileResult = await db
		.prepare("SELECT email, display_name FROM access_member_profiles")
		.all<AccessMemberProfileRow>();
	const names = new Map(
		profileResult.results.map((profile) => [
			profile.email.toLowerCase(),
			profile.display_name,
		]),
	);
	return members.map((member) => {
		const displayName = names.get(member.email.toLowerCase())?.trim();
		return displayName ? { ...member, displayName } : member;
	});
}

async function listMembers(
	env: Cloudflare.Env,
	db: D1Database,
	client = accessClient(env),
) {
	const members = await client.listMembers();
	return env.ENVIRONMENT === "development"
		? members
		: enrichMembers(db, members);
}

function profileStatement(
	db: D1Database,
	email: string,
	displayName: string,
	now: string,
) {
	return db
		.prepare(
			`INSERT INTO access_member_profiles
			  (email, display_name, created_at, updated_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(email) DO UPDATE SET
			   display_name = excluded.display_name,
			   updated_at = excluded.updated_at`,
		)
		.bind(email, displayName, now, now);
}

accessMembers.get("/members", async (c) => {
	const members = await listMembers(c.env, c.env.APP_DB);
	return c.json({ data: { members } });
});

accessMembers.put("/members/:email", async (c) => {
	const email = memberEmail(c.req.param("email"));
	const { role, displayName } = await updateInput(c.req.raw);
	const client = accessClient(c.env);
	const currentMembers = await listMembers(c.env, c.env.APP_DB, client);
	const before = currentMembers.find((member) => member.email === email);
	const nextDisplayName =
		displayName === undefined
			? before?.displayName
			: displayName.trim() || undefined;
	if (
		before?.role === role &&
		(before.displayName?.trim() || undefined) === nextDisplayName
	) {
		return c.json({ data: { members: currentMembers } });
	}
	const rawMembers = await client.setRole(email, role, displayName);
	const actor = c.get("user");
	const audit = auditStatement(
		c.env.APP_DB,
		actor,
		before
			? before.role === role
				? "access.member.name_changed"
				: "access.member.role_changed"
			: "access.member.added",
		"access_member",
		email,
		{
			email,
			previous_display_name: before?.displayName ?? null,
			display_name: nextDisplayName ?? null,
			previous_role: before?.role ?? null,
			role,
		},
	);
	if (c.env.ENVIRONMENT !== "development" && displayName !== undefined) {
		await c.env.APP_DB.batch([
			profileStatement(
				c.env.APP_DB,
				email,
				displayName,
				new Date().toISOString(),
			),
			audit,
		]);
	} else {
		await audit.run();
	}
	const members =
		c.env.ENVIRONMENT === "development"
			? rawMembers
			: await enrichMembers(c.env.APP_DB, rawMembers);
	return c.json({ data: { members } });
});

accessMembers.delete("/members/:email", async (c) => {
	const email = memberEmail(c.req.param("email"));
	const client = accessClient(c.env);
	const before = (await listMembers(c.env, c.env.APP_DB, client)).find(
		(member) => member.email === email,
	);
	const rawMembers = await client.remove(email);
	const actor = c.get("user");
	await auditStatement(
		c.env.APP_DB,
		actor,
		"access.member.removed",
		"access_member",
		email,
		{
			email,
			previous_display_name: before?.displayName ?? null,
			previous_role: before?.role ?? null,
		},
	).run();
	const members =
		c.env.ENVIRONMENT === "development"
			? rawMembers
			: await enrichMembers(c.env.APP_DB, rawMembers);
	return c.json({ data: { members } });
});
