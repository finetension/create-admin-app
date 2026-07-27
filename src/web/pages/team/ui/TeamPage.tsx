import { AccessMemberManager } from "../../../features/access-members";
import { PageHeader } from "../../../shared/ui";

export function TeamPage() {
	return (
		<div className="grid gap-6">
			<PageHeader
				eyebrow="소유자"
				title="팀 접근 관리"
				description="소유자, 관리자, 구성원 역할을 Cloudflare Access의 단일 권한 원본으로 관리합니다."
			/>
			<AccessMemberManager />
		</div>
	);
}
