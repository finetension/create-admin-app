import { AccessMemberManager } from "../../../features/access-members";
import { AuditLogViewer } from "../../../features/audit-logs";
import { PageHeader, Tabs } from "../../../shared/ui";

export function TeamPage() {
	return (
		<div className="grid gap-5">
			<PageHeader
				compactOnMobile
				eyebrow="소유자 전용"
				title="시스템 관리"
				description="구성원 권한을 관리하고 실제 데이터 변경 이력을 확인합니다."
			/>
			<Tabs className="w-full" defaultSelectedKey="members" variant="primary">
				<Tabs.ListContainer>
					<Tabs.List
						aria-label="시스템 관리"
						className="w-full *:min-w-0 *:flex-1"
					>
						<Tabs.Tab id="members">
							구성원
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id="audit">
							감사 기록
							<Tabs.Indicator />
						</Tabs.Tab>
					</Tabs.List>
				</Tabs.ListContainer>
				<Tabs.Panel className="pt-4" id="members">
					<AccessMemberManager />
				</Tabs.Panel>
				<Tabs.Panel className="pt-4" id="audit">
					<AuditLogViewer />
				</Tabs.Panel>
			</Tabs>
		</div>
	);
}
