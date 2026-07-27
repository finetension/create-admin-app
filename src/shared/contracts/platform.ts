export const accessRoles = ["owner", "admin", "user"] as const;

export type AccessRole = (typeof accessRoles)[number];
export type DevelopmentAccessRole = AccessRole | "public";

export const accessEmptyGroupEmails = {
	owner: "create-admin-app-unassigned-owner@example.com",
	admin: "create-admin-app-unassigned-admin@example.com",
	user: "create-admin-app-unassigned-user@example.com",
} as const satisfies Record<AccessRole, string>;

export function isAccessEmptyGroupEmail(email: string): boolean {
	return Object.values(accessEmptyGroupEmails).includes(
		email as (typeof accessEmptyGroupEmails)[AccessRole],
	);
}

export interface CurrentUser {
	id: string;
	email: string;
	role: AccessRole;
}

export interface AccessMember {
	email: string;
	role: AccessRole;
	bootstrap: boolean;
}

export interface AccessMembers {
	members: AccessMember[];
}

export interface UpdateAccessMemberInput {
	role: AccessRole;
}

export interface ApiErrorBody {
	error: {
		code: string;
		message: string;
		details?: unknown;
	};
}
