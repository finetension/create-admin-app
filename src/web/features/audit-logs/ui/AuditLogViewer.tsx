import { useInfiniteQuery } from "@tanstack/react-query";
import type { AuditLogEntry } from "../../../../shared/contracts";
import { ApiError, api } from "../../../shared/api";
import {
	Button,
	Chip,
	ErrorState,
	LoadingState,
	QueryEmptyState,
	Typography,
} from "../../../shared/ui";

const actionLabels: Record<string, string> = {
	"access.member.added": "구성원 추가",
	"access.member.name_changed": "구성원 이름 변경",
	"access.member.role_changed": "구성원 권한 변경",
	"access.member.removed": "구성원 제거",
};

const resourceLabels: Record<string, string> = {
	access_member: "구성원",
};

const roleLabels: Record<string, string> = {
	owner: "소유자",
	admin: "관리자",
	member: "구성원",
};

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function auditSummary(entry: AuditLogEntry): string {
	const details = entry.details;
	const email = text(details.email) ?? entry.resourceId ?? "구성원";
	if (entry.action === "access.member.added") {
		return `${email} · ${roleLabels[text(details.role) ?? ""] ?? text(details.role) ?? "역할 미정"}`;
	}
	if (entry.action === "access.member.role_changed") {
		const before =
			roleLabels[text(details.previous_role) ?? ""] ??
			text(details.previous_role) ??
			"역할 없음";
		const after =
			roleLabels[text(details.role) ?? ""] ?? text(details.role) ?? "역할 미정";
		return `${email} · ${before} → ${after}`;
	}
	if (entry.action === "access.member.name_changed") {
		return `${email} · ${text(details.previous_display_name) ?? "이름 없음"} → ${text(details.display_name) ?? "이름 없음"}`;
	}
	if (entry.action === "access.member.removed") return email;
	const serializedDetails = JSON.stringify(details);
	return serializedDetails === "{}"
		? (entry.resourceId ?? "세부 정보 없음")
		: serializedDetails;
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

function errorMessage(error: unknown): string {
	return error instanceof ApiError
		? error.message
		: "감사 기록을 불러오지 못했습니다.";
}

export function AuditLogViewer() {
	const audit = useInfiniteQuery({
		queryKey: ["audit-logs"],
		queryFn: ({ pageParam }) => api.auditLogs.list(pageParam),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});
	const entries = audit.data?.pages.flatMap((page) => page.entries) ?? [];

	if (audit.isLoading) return <LoadingState label="감사 기록을 불러오는 중" />;
	if (audit.isError) return <ErrorState message={errorMessage(audit.error)} />;

	return (
		<div className="grid gap-3">
			<div>
				<Typography.Heading className="text-xl" level={2}>
					감사 기록
				</Typography.Heading>
				<Typography.Paragraph color="muted" size="xs">
					실제로 반영된 구성원 및 제품 데이터 변경을 최신순으로 표시합니다.
				</Typography.Paragraph>
			</div>
			<section aria-label="감사 기록" className="border-y border-border">
				{entries.length === 0 ? (
					<QueryEmptyState
						title="감사 기록이 없습니다"
						description="데이터를 변경하면 이곳에 기록됩니다."
					/>
				) : (
					<ol>
						{entries.map((entry) => (
							<li
								className="grid gap-1 border-b border-border py-3 last:border-b-0"
								key={entry.id}
							>
								<div className="flex items-start justify-between gap-2">
									<Typography.Paragraph size="sm" weight="semibold">
										{actionLabels[entry.action] ?? entry.action}
									</Typography.Paragraph>
									<Chip className="shrink-0" size="sm" variant="soft">
										{resourceLabels[entry.resourceType] ?? entry.resourceType}
									</Chip>
								</div>
								<Typography.Paragraph className="break-words" size="sm">
									{auditSummary(entry)}
								</Typography.Paragraph>
								<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
									<span className="break-all">{entry.actorEmail}</span>
									<span aria-hidden="true">·</span>
									<time dateTime={entry.createdAt}>
										{formatDate(entry.createdAt)}
									</time>
								</div>
							</li>
						))}
					</ol>
				)}
			</section>
			{audit.hasNextPage && (
				<Button
					className="justify-self-center"
					isPending={audit.isFetchingNextPage}
					variant="secondary"
					onPress={() => void audit.fetchNextPage()}
				>
					이전 기록 더 보기
				</Button>
			)}
		</div>
	);
}
