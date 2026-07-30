export const accessRoles = ["owner", "admin", "member"] as const;

export type AccessRole = (typeof accessRoles)[number];

export const accessEmptyGroupEmails = {
	owner: "create-admin-app-unassigned-owner@example.com",
	admin: "create-admin-app-unassigned-admin@example.com",
	member: "create-admin-app-unassigned-member@example.com",
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
	displayName?: string;
	role: AccessRole;
	bootstrap: boolean;
}

export interface AccessMembers {
	members: AccessMember[];
}

export interface UpdateAccessMemberInput {
	role: AccessRole;
	displayName?: string;
}

export interface AuditLogEntry {
	id: string;
	actorEmail: string;
	action: string;
	resourceType: string;
	resourceId: string | null;
	details: Record<string, unknown>;
	createdAt: string;
}

export interface AuditLogPage {
	entries: AuditLogEntry[];
	nextCursor: string | null;
}

export interface ApiErrorBody {
	error: {
		code: string;
		message: string;
		details?: unknown;
	};
}
