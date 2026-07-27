import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import type { CurrentUser } from "../../../../shared/contracts";
import {
	Avatar,
	BoxesIcon,
	Button,
	ButtonLink,
	Card,
	Drawer,
	LayoutDashboardIcon,
	MenuIcon,
	Surface,
	Typography,
	UsersIcon,
} from "../../../shared/ui";

const roleLabels = {
	owner: "소유자",
	admin: "관리자",
	member: "구성원",
} satisfies Record<CurrentUser["role"], string>;

function Navigation({
	user,
	onNavigate,
}: {
	user: CurrentUser;
	onNavigate?: () => void;
}) {
	return (
		<nav aria-label="주 메뉴">
			<ButtonLink
				to="/"
				fullWidth
				onPress={onNavigate}
				className="justify-start"
				variant="secondary"
			>
				<LayoutDashboardIcon size={18} />홈
			</ButtonLink>
			{user.role === "owner" && (
				<ButtonLink
					to="/owner/team"
					fullWidth
					onPress={onNavigate}
					className="justify-start"
					variant="ghost"
				>
					<UsersIcon size={18} />팀 접근
				</ButtonLink>
			)}
		</nav>
	);
}

function IdentityCard({ user }: { user: CurrentUser }) {
	return (
		<Card variant="secondary">
			<Card.Content className="flex-row items-center gap-3">
				<Avatar size="sm">
					<Avatar.Fallback>
						{user.email.slice(0, 1).toUpperCase()}
					</Avatar.Fallback>
				</Avatar>
				<div className="min-w-0">
					<Typography.Paragraph truncate weight="medium">
						{user.email}
					</Typography.Paragraph>
					<Typography.Paragraph color="muted" size="xs">
						{roleLabels[user.role]}
					</Typography.Paragraph>
				</div>
			</Card.Content>
		</Card>
	);
}

export function AppShell({ user }: { user: CurrentUser }) {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const appName = import.meta.env.VITE_APP_NAME ?? "Management System";

	useEffect(() => {
		document.title = appName;
	}, []);

	return (
		<div className="flex min-h-dvh">
			<Surface
				className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col p-4 md:flex"
				role="complementary"
				variant="secondary"
			>
				<div className="flex items-center gap-3 px-2 pb-6">
					<Avatar color="accent" size="md" variant="soft">
						<Avatar.Fallback>
							<BoxesIcon size={20} />
						</Avatar.Fallback>
					</Avatar>
					<div className="min-w-0">
						<Typography.Heading level={2} truncate>
							{appName}
						</Typography.Heading>
						<Typography.Paragraph color="muted" size="xs">
							Internal management
						</Typography.Paragraph>
					</div>
				</div>
				<Navigation user={user} />
				<div className="mt-auto">
					<IdentityCard user={user} />
				</div>
			</Surface>

			<div className="min-w-0 flex-1">
				<Surface
					className="sticky top-0 z-10 flex items-center gap-2 p-3 md:hidden"
					role="banner"
					variant="secondary"
				>
					<Drawer isOpen={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
						<Button isIconOnly variant="ghost" aria-label="메뉴 열기">
							<MenuIcon size={21} />
						</Button>
						<Drawer.Backdrop>
							<Drawer.Content placement="left">
								<Drawer.Dialog>
									<Drawer.Header>
										<Drawer.Heading>{appName}</Drawer.Heading>
										<Drawer.CloseTrigger />
									</Drawer.Header>
									<Drawer.Body>
										<Navigation
											user={user}
											onNavigate={() => setMobileMenuOpen(false)}
										/>
									</Drawer.Body>
									<Drawer.Footer>
										<IdentityCard user={user} />
									</Drawer.Footer>
								</Drawer.Dialog>
							</Drawer.Content>
						</Drawer.Backdrop>
					</Drawer>
					<Typography.Paragraph weight="medium">{appName}</Typography.Paragraph>
				</Surface>
				<main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
