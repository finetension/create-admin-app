import type { CurrentUser } from "../../shared/contracts";

export function auditStatement(
	db: D1Database,
	actor: CurrentUser,
	action: string,
	resourceType: string,
	resourceId: string | null,
	details: Record<string, unknown> = {},
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO audit_logs
        (id, actor_id, action, resource_type, resource_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			crypto.randomUUID(),
			actor.id,
			action,
			resourceType,
			resourceId,
			JSON.stringify(details),
			new Date().toISOString(),
		);
}
