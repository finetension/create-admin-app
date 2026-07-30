import { useLocation } from "react-router";
import { useSession } from "../../../entities/session";
import {
	getNavigationSections,
	isNavigationItemActive,
	NavigationIcon,
} from "../../../features/app-navigation";
import { ButtonLink, PageHeader, Typography } from "../../../shared/ui";
import { IdentityPanel } from "../../../widgets/app-shell";

export function MenuPage() {
	const { user } = useSession();
	const location = useLocation();
	const sections = getNavigationSections(user.role);
	const appName = import.meta.env.VITE_APP_NAME ?? "Management System";

	return (
		<div className="grid gap-5">
			<PageHeader
				compactOnMobile
				eyebrow={appName}
				title="전체 메뉴"
				description="업무와 관리 기능을 한곳에서 찾습니다."
			/>
			<section aria-label="내 계정" className="md:hidden">
				<IdentityPanel user={user} />
			</section>
			<div className="grid gap-5">
				{sections.map((section) => (
					<section className="grid gap-2" key={section.id}>
						<Typography.Paragraph
							className="px-1"
							color="muted"
							size="xs"
							weight="semibold"
						>
							{section.label}
						</Typography.Paragraph>
						<div className="grid border-y border-border">
							{section.items.map((item) => (
								<ButtonLink
									className="h-auto min-h-14 justify-start gap-3 rounded-none border-b border-border px-2 py-2 text-left last:border-b-0"
									fullWidth
									key={item.id}
									reloadDocument={item.reloadDocument}
									to={item.to}
									variant={
										isNavigationItemActive(item, location.pathname)
											? "secondary"
											: "ghost"
									}
								>
									<NavigationIcon name={item.icon} size={19} />
									<span className="min-w-0">
										<span className="block text-sm font-semibold">
											{item.label}
										</span>
										<span className="block text-xs font-normal text-muted">
											{item.description}
										</span>
									</span>
								</ButtonLink>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
