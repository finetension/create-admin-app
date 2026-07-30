import { Hono } from "hono";
import type { AuditLogEntry, AuditLogPage } from "../../shared/contracts";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

interface AuditLogRow {
	id: string;
	actor_email: string;
	action: string;
	resource_type: string;
	resource_id: string | null;
	details: string;
	created_at: string;
}

const pageSize = 30;

function encodeCursor(row: AuditLogRow): string {
	return btoa(JSON.stringify([row.created_at, row.id]))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

function decodeCursor(value: string | undefined): [string, string] | null {
	if (!value) return null;
	try {
		const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
		const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
		const parsed: unknown = JSON.parse(atob(`${normalized}${padding}`));
		if (
			!Array.isArray(parsed) ||
			parsed.length !== 2 ||
			parsed.some((item) => typeof item !== "string" || item.length === 0)
		) {
			throw new Error("invalid cursor");
		}
		return [parsed[0], parsed[1]];
	} catch {
		throw new AppError(
			400,
			"INVALID_AUDIT_CURSOR",
			"감사 기록 페이지 정보가 올바르지 않습니다.",
		);
	}
}

function parseDetails(value: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(value);
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function mapEntry(row: AuditLogRow): AuditLogEntry {
	return {
		id: row.id,
		actorEmail: row.actor_email,
		action: row.action,
		resourceType: row.resource_type,
		resourceId: row.resource_id,
		details: parseDetails(row.details),
		createdAt: row.created_at,
	};
}

export const auditLogs = new Hono<AppEnv>().get("/audit-logs", async (c) => {
	const cursor = decodeCursor(c.req.query("cursor"));
	const statement = cursor
		? c.env.APP_DB.prepare(
				`SELECT audit.id, actor.email AS actor_email, audit.action,
				        audit.resource_type, audit.resource_id, audit.details,
				        audit.created_at
				   FROM audit_logs AS audit
				   JOIN users AS actor ON actor.id = audit.actor_id
				  WHERE audit.created_at < ?
				     OR (audit.created_at = ? AND audit.id < ?)
				  ORDER BY audit.created_at DESC, audit.id DESC
				  LIMIT ?`,
			).bind(cursor[0], cursor[0], cursor[1], pageSize + 1)
		: c.env.APP_DB.prepare(
				`SELECT audit.id, actor.email AS actor_email, audit.action,
				        audit.resource_type, audit.resource_id, audit.details,
				        audit.created_at
				   FROM audit_logs AS audit
				   JOIN users AS actor ON actor.id = audit.actor_id
				  ORDER BY audit.created_at DESC, audit.id DESC
				  LIMIT ?`,
			).bind(pageSize + 1);
	const result = await statement.all<AuditLogRow>();
	const hasNextPage = result.results.length > pageSize;
	const rows = result.results.slice(0, pageSize);
	const data: AuditLogPage = {
		entries: rows.map(mapEntry),
		nextCursor: hasNextPage ? encodeCursor(rows.at(-1) as AuditLogRow) : null,
	};
	return c.json({ data });
});
