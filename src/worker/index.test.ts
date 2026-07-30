import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./index";

const baseEnv = {
	ENVIRONMENT: "development",
	APP_NAME: "Management",
	DEV_USER_EMAIL: "founder@example.com",
	DEV_ACCESS_ROLE: "owner",
	DEV_ACCESS_PUBLIC: "false",
	ACCESS_TEAM_DOMAIN: "",
	ACCESS_AUD_BASE: "",
	ACCESS_AUD_ADMIN: "",
	ACCESS_AUD_OWNER: "",
	ACCESS_ACCOUNT_ID: "a".repeat(32),
	ACCESS_GROUP_OWNER_ID: "owner-group",
	ACCESS_GROUP_ADMIN_ID: "admin-group",
	ACCESS_GROUP_MEMBER_ID: "member-group",
	ACCESS_BOOTSTRAP_OWNER_EMAIL: "founder@example.com",
	ACCESS_MANAGEMENT_TOKEN: "test-token",
};

function createDatabase() {
	const userRun = vi.fn(async () => ({}));
	const auditRun = vi.fn(async () => ({}));
	const first = vi.fn(async () => ({
		id: "founder-id",
		email: "founder@example.com",
	}));
	const prepare = vi.fn((sql: string) => ({
		bind: vi.fn(() => {
			if (sql.includes("SELECT id, email")) return { first };
			if (sql.includes("INSERT INTO audit_logs")) return { run: auditRun };
			return { run: userRun };
		}),
	}));
	return {
		db: { prepare } as unknown as D1Database,
		auditRun,
	};
}

function createAuditDatabase() {
	const run = vi.fn(async () => ({}));
	const first = vi.fn(async () => ({
		id: "founder-id",
		email: "founder@example.com",
	}));
	const all = vi.fn(async () => ({
		results: [
			{
				id: "audit-1",
				actor_email: "founder@example.com",
				action: "access.member.role_changed",
				resource_type: "access_member",
				resource_id: "member@example.com",
				details: JSON.stringify({
					email: "member@example.com",
					previous_role: "member",
					role: "admin",
				}),
				created_at: "2026-07-30T09:00:00.000Z",
			},
		],
	}));
	const prepare = vi.fn((sql: string) => ({
		bind: vi.fn(() =>
			sql.includes("FROM audit_logs AS audit") ? { all } : { first, run },
		),
	}));
	return { db: { prepare } as unknown as D1Database, all };
}

function createCloudflareFetch() {
	const groups = {
		"owner-group": {
			id: "owner-group",
			name: "Owners",
			include: [{ email: { email: "founder@example.com" } }],
			exclude: [],
			require: [],
		},
		"admin-group": {
			id: "admin-group",
			name: "Admins",
			include: [],
			exclude: [],
			require: [],
		},
		"member-group": {
			id: "member-group",
			name: "Members",
			include: [],
			exclude: [],
			require: [],
		},
	};
	return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input));
		const groupId = url.pathname.split("/access/groups/")[1];
		if (groupId) {
			const group = groups[groupId as keyof typeof groups];
			if (init?.method === "PUT") {
				Object.assign(group, JSON.parse(String(init.body)));
			}
			return Response.json({ success: true, result: group });
		}
		if (url.pathname.endsWith("/access/organizations/revoke_user")) {
			return Response.json({ success: true, result: true });
		}
		return Response.json({ success: false, result: null }, { status: 404 });
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Worker role routes", () => {
	it("keeps the explicit public health path unauthenticated", async () => {
		const response = await app.request(
			"/api/public/health",
			{},
			{ ...baseEnv, APP_DB: createDatabase().db },
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: "ok" });
	});

	it("lets an Owner list Access members", async () => {
		const cloudflareFetch = createCloudflareFetch();
		vi.stubGlobal("fetch", cloudflareFetch);
		const response = await app.request(
			"/api/owner/members",
			{},
			{ ...baseEnv, APP_DB: createDatabase().db },
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			data: {
				members: [
					{
						email: "founder@example.com",
						role: "owner",
						bootstrap: true,
					},
				],
			},
		});
	});

	it("denies the Owner API to an Admin before calling Cloudflare", async () => {
		const cloudflareFetch = createCloudflareFetch();
		vi.stubGlobal("fetch", cloudflareFetch);
		const response = await app.request(
			"/api/owner/members",
			{},
			{
				...baseEnv,
				DEV_ACCESS_ROLE: "admin",
				APP_DB: createDatabase().db,
			},
		);
		expect(response.status).toBe(403);
		expect(cloudflareFetch).not.toHaveBeenCalled();
	});

	it("audits a successful Owner membership change", async () => {
		vi.stubGlobal("fetch", createCloudflareFetch());
		const database = createDatabase();
		const response = await app.request(
			"/api/owner/members/member%40example.com",
			{
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					role: "member",
					displayName: "New Member",
				}),
			},
			{ ...baseEnv, APP_DB: database.db },
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: {
				members: [
					{
						email: "founder@example.com",
						role: "owner",
						bootstrap: true,
					},
					{
						email: "member@example.com",
						displayName: "New Member",
						role: "member",
						bootstrap: false,
					},
				],
			},
		});
		expect(database.auditRun).toHaveBeenCalledOnce();
	});

	it("does not call Cloudflare or audit an unchanged membership", async () => {
		const cloudflareFetch = createCloudflareFetch();
		vi.stubGlobal("fetch", cloudflareFetch);
		const database = createDatabase();
		const response = await app.request(
			"/api/owner/members/founder%40example.com",
			{
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ role: "owner" }),
			},
			{ ...baseEnv, APP_DB: database.db },
		);

		expect(response.status).toBe(200);
		expect(database.auditRun).not.toHaveBeenCalled();
		expect(
			cloudflareFetch.mock.calls.some(([, init]) => init?.method === "PUT"),
		).toBe(false);
	});

	it("lets only an Owner read newest audit entries", async () => {
		const database = createAuditDatabase();
		const response = await app.request(
			"/api/owner/audit-logs",
			{},
			{ ...baseEnv, APP_DB: database.db },
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			data: {
				entries: [
					{
						id: "audit-1",
						actorEmail: "founder@example.com",
						action: "access.member.role_changed",
						resourceType: "access_member",
						resourceId: "member@example.com",
						details: {
							email: "member@example.com",
							previous_role: "member",
							role: "admin",
						},
						createdAt: "2026-07-30T09:00:00.000Z",
					},
				],
				nextCursor: null,
			},
		});
		expect(database.all).toHaveBeenCalledOnce();

		const forbidden = await app.request(
			"/api/owner/audit-logs",
			{},
			{ ...baseEnv, DEV_ACCESS_ROLE: "admin", APP_DB: database.db },
		);
		expect(forbidden.status).toBe(403);
	});
});
