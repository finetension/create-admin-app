import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuditLogPage } from "../../../../shared/contracts";
import { AuditLogViewer } from "./AuditLogViewer";

describe("audit log viewer", () => {
	it("renders actor, action, target, and a readable change summary", () => {
		const queryClient = new QueryClient();
		const page: AuditLogPage = {
			entries: [
				{
					id: "audit-1",
					actorEmail: "owner@example.com",
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
		};
		queryClient.setQueryData(["audit-logs"], {
			pages: [page],
			pageParams: [undefined],
		});

		const markup = renderToStaticMarkup(
			createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(AuditLogViewer),
			),
		);

		expect(markup).toContain("구성원 권한 변경");
		expect(markup).toContain("구성원 → 관리자");
		expect(markup).toContain("owner@example.com");
		expect(markup).toContain("member@example.com");
	});
});
