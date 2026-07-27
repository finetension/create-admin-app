import { describe, expect, it, vi } from "vitest";
import { accessEmptyGroupEmails } from "../../shared/contracts";
import { createAccessManagementClient } from "./access-management";

const bindings = {
	ACCESS_ACCOUNT_ID: "a".repeat(32),
	ACCESS_GROUP_OWNER_ID: "owner-group",
	ACCESS_GROUP_ADMIN_ID: "admin-group",
	ACCESS_GROUP_MEMBER_ID: "member-group",
	ACCESS_BOOTSTRAP_OWNER_EMAIL: "founder@example.com",
	ACCESS_MANAGEMENT_TOKEN: "secret-token",
};

function emailRules(emails: string[]) {
	return emails.map((email) => ({ email: { email } }));
}

function cloudflareMock(initial: {
	owner: string[];
	admin: string[];
	member: string[];
}) {
	const groups = {
		"owner-group": {
			id: "owner-group",
			name: "Owners",
			include: emailRules(initial.owner),
			exclude: [],
			require: [],
		},
		"admin-group": {
			id: "admin-group",
			name: "Admins",
			include: emailRules(initial.admin),
			exclude: [],
			require: [],
		},
		"member-group": {
			id: "member-group",
			name: "Members",
			include: emailRules(initial.member),
			exclude: [],
			require: [],
		},
	};
	let revokeCount = 0;
	const fetcher = vi.fn(
		async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(String(input));
			const groupId = url.pathname.split("/access/groups/")[1];
			if (groupId) {
				const group = groups[groupId as keyof typeof groups];
				if (init?.method === "PUT") {
					const body = JSON.parse(String(init.body));
					Object.assign(group, body);
				}
				return Response.json({ success: true, result: group });
			}
			if (url.pathname.endsWith("/access/organizations/revoke_user")) {
				revokeCount += 1;
				return Response.json({ success: true, result: true });
			}
			return Response.json(
				{ success: false, result: null, errors: [{ message: "unexpected" }] },
				{ status: 404 },
			);
		},
	);
	return {
		fetcher: fetcher as typeof fetch,
		groups,
		revokeCount: () => revokeCount,
	};
}

describe("Access role management", () => {
	it("lists exclusive role memberships without exposing the token", async () => {
		const mock = cloudflareMock({
			owner: ["founder@example.com"],
			admin: ["admin@example.com"],
			member: [accessEmptyGroupEmails.member],
		});
		const members = await createAccessManagementClient(
			bindings,
			mock.fetcher,
		).listMembers();
		expect(members).toEqual([
			{ email: "admin@example.com", role: "admin", bootstrap: false },
			{ email: "founder@example.com", role: "owner", bootstrap: true },
		]);
		expect(JSON.stringify(members)).not.toContain("secret-token");
	});

	it("moves a member to exactly one group and revokes existing sessions", async () => {
		const mock = cloudflareMock({
			owner: ["founder@example.com"],
			admin: [],
			member: ["member@example.com"],
		});
		const members = await createAccessManagementClient(
			bindings,
			mock.fetcher,
		).setRole("member@example.com", "admin");
		expect(members).toContainEqual({
			email: "member@example.com",
			role: "admin",
			bootstrap: false,
		});
		expect(mock.groups["admin-group"].include).toEqual(
			emailRules(["member@example.com"]),
		);
		expect(mock.groups["member-group"].include).toEqual(
			emailRules([accessEmptyGroupEmails.member]),
		);
		expect(mock.revokeCount()).toBe(1);
	});

	it("protects the bootstrap Owner from demotion and removal", async () => {
		const mock = cloudflareMock({
			owner: ["founder@example.com"],
			admin: [],
			member: [],
		});
		const client = createAccessManagementClient(bindings, mock.fetcher);
		await expect(
			client.setRole("founder@example.com", "admin"),
		).rejects.toMatchObject({ code: "BOOTSTRAP_OWNER_PROTECTED" });
		await expect(client.remove("founder@example.com")).rejects.toMatchObject({
			code: "BOOTSTRAP_OWNER_PROTECTED",
		});
		expect(mock.revokeCount()).toBe(0);
	});

	it("protects the final Owner even when remote state has drifted", async () => {
		const mock = cloudflareMock({
			owner: ["other-owner@example.com"],
			admin: [],
			member: [],
		});
		await expect(
			createAccessManagementClient(bindings, mock.fetcher).remove(
				"other-owner@example.com",
			),
		).rejects.toMatchObject({ code: "LAST_OWNER_PROTECTED" });
	});
});
