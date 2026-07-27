import {
	Alert,
	Avatar,
	Card,
	CloudIcon,
	Code2Icon,
	DatabaseIcon,
	PageHeader,
	ShieldCheckIcon,
	Typography,
} from "../../../shared/ui";

const foundations = [
	{
		title: "역할 기반 접근",
		description:
			"Cloudflare Access가 소유자, 관리자, 구성원 경계를 적용합니다.",
		icon: ShieldCheckIcon,
	},
	{
		title: "단일 D1",
		description: "첫 배포 후 개발과 운영이 하나의 원격 데이터를 사용합니다.",
		icon: DatabaseIcon,
	},
	{
		title: "CI/CD 운영",
		description: "운영 migration과 배포는 검증된 Actions에서만 실행됩니다.",
		icon: CloudIcon,
	},
] as const;

export function DashboardPage() {
	return (
		<div className="grid gap-6">
			<PageHeader
				eyebrow="Management system scaffold"
				title="제품 업무를 구현할 기반이 준비됐습니다"
				description="이 화면은 범용 업무 모듈을 가정하지 않습니다. 실제 회사의 문제를 명시적인 도메인 모델과 흐름으로 추가하세요."
			/>

			<Alert status="accent">
				<Code2Icon />
				<Alert.Content>
					<Alert.Title>첫 업무 흐름</Alert.Title>
					<Alert.Description>
						제품 PRD에서 가장 중요한 업무 흐름 하나를 정한 뒤 contract,
						migration, Worker route와 UI를 끝까지 연결하세요.
					</Alert.Description>
				</Alert.Content>
			</Alert>

			<section className="grid gap-4 md:grid-cols-3" aria-label="기반 구성">
				{foundations.map(({ title, description, icon: Icon }) => (
					<Card key={title}>
						<Card.Content className="gap-4">
							<Avatar variant="soft">
								<Avatar.Fallback>
									<Icon size={19} />
								</Avatar.Fallback>
							</Avatar>
							<div>
								<Typography.Heading level={2}>{title}</Typography.Heading>
								<Typography.Paragraph color="muted" size="sm">
									{description}
								</Typography.Paragraph>
							</div>
						</Card.Content>
					</Card>
				))}
			</section>
		</div>
	);
}
