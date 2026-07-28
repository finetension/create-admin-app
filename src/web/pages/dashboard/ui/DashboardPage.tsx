import {
	Alert,
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
		<div className="grid gap-5">
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

			<section
				className="grid border-y border-border md:grid-cols-3 md:divide-x md:divide-border"
				aria-label="기반 구성"
			>
				{foundations.map(({ title, description, icon: Icon }) => (
					<div
						className="flex gap-3 border-b border-border py-4 last:border-b-0 md:border-b-0 md:px-4 md:first:ps-0 md:last:pe-0"
						key={title}
					>
						<Icon className="mt-0.5 shrink-0" size={19} />
						<div className="min-w-0">
							<Typography.Heading className="text-base" level={2}>
								{title}
							</Typography.Heading>
							<Typography.Paragraph color="muted" size="sm">
								{description}
							</Typography.Paragraph>
						</div>
					</div>
				))}
			</section>
		</div>
	);
}
