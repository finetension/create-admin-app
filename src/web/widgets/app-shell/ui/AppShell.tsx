import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import type { CurrentUser } from "../../../../shared/contracts";
import {
	getMobilePrimaryItems,
	getNavigationLabel,
	getNavigationSections,
	getRolePath,
	isNavigationItemActive,
	NavigationIcon,
} from "../../../features/app-navigation";
import {
	Avatar,
	BoxesIcon,
	ButtonLink,
	Chip,
	LogOutIcon,
	MenuIcon,
	Surface,
	Typography,
} from "../../../shared/ui";

const roleLabels = {
	owner: "소유자",
	admin: "관리자",
	member: "구성원",
} satisfies Record<CurrentUser["role"], string>;

function DesktopNavigation({ user }: { user: CurrentUser }) {
	const location = useLocation();
	const sections = getNavigationSections(user.role);

	return (
		<nav aria-label="주 메뉴" className="grid gap-4">
			{sections.map((section) => (
				<div className="grid gap-1" key={section.id}>
					<Typography.Paragraph
						className="px-3"
						color="muted"
						size="xs"
						weight="medium"
					>
						{section.label}
					</Typography.Paragraph>
					{section.items.map((item) => (
						<ButtonLink
							to={item.to}
							fullWidth
							key={item.id}
							reloadDocument={item.reloadDocument}
							className="h-10 justify-start font-medium"
							variant={
								isNavigationItemActive(item, location.pathname)
									? "secondary"
									: "ghost"
							}
							aria-current={
								isNavigationItemActive(item, location.pathname)
									? "page"
									: undefined
							}
						>
							<NavigationIcon name={item.icon} />
							{item.label}
						</ButtonLink>
					))}
				</div>
			))}
		</nav>
	);
}

function MobileNavigation({ user }: { user: CurrentUser }) {
	const location = useLocation();
	const primaryItems = getMobilePrimaryItems(user.role);
	const itemClassName =
		"h-12 min-w-0 flex-col gap-0.5 rounded-lg px-1 text-[11px] font-medium";
	const primaryActive = primaryItems.some((item) =>
		isNavigationItemActive(item, location.pathname),
	);
	const menuPath = getRolePath(user.role, "/menu");
	const menuActive = location.pathname === menuPath || !primaryActive;
	const navigationColumns =
		primaryItems.length >= 3
			? "grid-cols-4"
			: primaryItems.length === 2
				? "grid-cols-3"
				: "grid-cols-2";

	return (
		<Surface
			className="fixed inset-x-0 bottom-0 z-20 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
			variant="secondary"
			render={(props) => <nav {...props} aria-label="모바일 주 메뉴" />}
		>
			<div className={`grid ${navigationColumns} gap-1`}>
				{primaryItems.map((item) => {
					const active = isNavigationItemActive(item, location.pathname);
					return (
						<ButtonLink
							to={item.to}
							fullWidth
							key={item.id}
							reloadDocument={item.reloadDocument}
							className={itemClassName}
							variant={active ? "secondary" : "ghost"}
							aria-current={active ? "page" : undefined}
						>
							<NavigationIcon name={item.icon} />
							{item.shortLabel}
						</ButtonLink>
					);
				})}
				<ButtonLink
					to={menuPath}
					fullWidth
					className={itemClassName}
					variant={menuActive ? "secondary" : "ghost"}
					aria-current={menuActive ? "page" : undefined}
				>
					<MenuIcon size={18} />
					전체
				</ButtonLink>
			</div>
		</Surface>
	);
}

export function IdentityPanel({ user }: { user: CurrentUser }) {
	return (
		<Surface className="grid gap-2 rounded-xl p-2.5" variant="tertiary">
			<div className="flex items-center gap-2">
				<Avatar size="sm">
					<Avatar.Fallback>
						{user.email.slice(0, 1).toUpperCase()}
					</Avatar.Fallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<Typography.Paragraph truncate weight="medium" size="sm">
						{user.email}
					</Typography.Paragraph>
					<Chip size="sm" variant="soft">
						{roleLabels[user.role]}
					</Chip>
				</div>
			</div>
			<ButtonLink
				to="/cdn-cgi/access/logout"
				fullWidth
				reloadDocument
				className="h-9 justify-start"
				size="sm"
				variant="ghost"
			>
				<LogOutIcon size={16} />
				로그아웃
			</ButtonLink>
		</Surface>
	);
}

export function AppShell({ user }: { user: CurrentUser }) {
	const location = useLocation();
	const appName = import.meta.env.VITE_APP_NAME ?? "Management System";
	const menuPath = getRolePath(user.role, "/menu");
	const currentPageLabel =
		location.pathname === menuPath
			? "전체 메뉴"
			: (getNavigationLabel(location.pathname) ?? appName);

	useEffect(() => {
		document.title =
			currentPageLabel === appName
				? appName
				: `${currentPageLabel} · ${appName}`;
	}, [currentPageLabel]);

	return (
		<div className="flex min-h-dvh">
			<Surface
				className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col p-4 md:flex"
				role="complementary"
				variant="secondary"
			>
				<div className="flex items-center gap-3 px-2 pb-5">
					<Avatar color="accent" size="md" variant="soft">
						<Avatar.Fallback>
							<BoxesIcon size={20} />
						</Avatar.Fallback>
					</Avatar>
					<div className="min-w-0">
						<Typography.Paragraph truncate weight="semibold">
							{appName}
						</Typography.Paragraph>
						<Typography.Paragraph color="muted" size="xs">
							Internal management
						</Typography.Paragraph>
					</div>
				</div>
				<DesktopNavigation user={user} />
				<div className="mt-auto">
					<IdentityPanel user={user} />
				</div>
			</Surface>

			<div className="min-w-0 flex-1">
				<Surface
					className="sticky top-0 z-10 flex h-12 items-center px-3 md:hidden"
					role="banner"
					variant="secondary"
				>
					<Typography.Paragraph truncate size="sm" weight="semibold">
						{currentPageLabel}
					</Typography.Paragraph>
				</Surface>
				<main className="mx-auto w-full max-w-7xl p-3 pb-24 sm:p-6 md:pb-6 lg:p-8">
					<Outlet />
				</main>
				<MobileNavigation user={user} />
			</div>
		</div>
	);
}
