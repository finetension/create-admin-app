import { Hono } from "hono";
import { z } from "zod";
import { accessRoles } from "../../shared/contracts";
import {
	createAccessManagementClient,
	createDevelopmentAccessManagementClient,
} from "../lib/access-management";
import { auditStatement } from "../lib/audit";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

const updateMemberSchema = z.object({
	role: z.enum(accessRoles),
});
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

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
			"owner, admin 또는 user 역할이 필요합니다.",
		);
	}
}

export const accessMembers = new Hono<AppEnv>();

function accessClient(env: Cloudflare.Env) {
	return env.ENVIRONMENT === "development"
		? createDevelopmentAccessManagementClient(env)
		: createAccessManagementClient(env);
}

accessMembers.get("/members", async (c) => {
	const members = await accessClient(c.env).listMembers();
	return c.json({ data: { members } });
});

accessMembers.put("/members/:email", async (c) => {
	const email = memberEmail(c.req.param("email"));
	const { role } = await updateInput(c.req.raw);
	const client = accessClient(c.env);
	const before = (await client.listMembers()).find(
		(member) => member.email === email,
	);
	const members = await client.setRole(email, role);
	const actor = c.get("user");
	await auditStatement(
		c.env.APP_DB,
		actor,
		before ? "access.member.role_changed" : "access.member.added",
		"access_member",
		email,
		{
			email,
			previous_role: before?.role ?? null,
			role,
		},
	).run();
	return c.json({ data: { members } });
});

accessMembers.delete("/members/:email", async (c) => {
	const email = memberEmail(c.req.param("email"));
	const client = accessClient(c.env);
	const before = (await client.listMembers()).find(
		(member) => member.email === email,
	);
	const members = await client.remove(email);
	const actor = c.get("user");
	await auditStatement(
		c.env.APP_DB,
		actor,
		"access.member.removed",
		"access_member",
		email,
		{ email, previous_role: before?.role ?? null },
	).run();
	return c.json({ data: { members } });
});
