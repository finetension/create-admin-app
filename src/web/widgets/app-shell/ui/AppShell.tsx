import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import type { CurrentUser } from "../../../../shared/contracts";
import {
	Avatar,
	BoxesIcon,
	Button,
	ButtonLink,
	Chip,
	Dropdown,
	Label,
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

type NavigationIconName = "dashboard" | "team";

interface NavigationItem {
	id: string;
	label: string;
	to: string;
	icon: NavigationIconName;
	roles?: CurrentUser["role"][];
	reloadDocument?: boolean;
}

interface NavigationSection {
	id: string;
	label: string;
	items: NavigationItem[];
}

const navigationSections: NavigationSection[] = [
	{
		id: "system",
		label: "시스템",
		items: [
			{
				id: "home",
				label: "홈",
				to: "/",
				icon: "dashboard",
			},
		],
	},
	{
		id: "management",
		label: "관리",
		items: [
			{
				id: "team",
				label: "구성원 관리",
				to: "/owner/team",
				icon: "team",
				roles: ["owner"],
				reloadDocument: true,
			},
		],
	},
];

function getNavigationSections(role: CurrentUser["role"]): NavigationSection[] {
	return navigationSections
		.map((section) => ({
			...section,
			items: section.items.filter(
				(item) => !item.roles || item.roles.includes(role),
			),
		}))
		.filter((section) => section.items.length > 0);
}

function getNavigationItems(role: CurrentUser["role"]): NavigationItem[] {
	return getNavigationSections(role).flatMap((section) => section.items);
}

function isNavigationItemActive(
	item: NavigationItem,
	pathname: string,
): boolean {
	return item.to === "/"
		? pathname === "/"
		: pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function getNavigationLabel(pathname: string): string | undefined {
	return navigationSections
		.flatMap((section) => section.items)
		.find((item) => isNavigationItemActive(item, pathname))?.label;
}

function NavigationIcon({
	name,
	size = 18,
}: {
	name: NavigationIconName;
	size?: number;
}) {
	switch (name) {
		case "dashboard":
			return <LayoutDashboardIcon size={size} />;
		case "team":
			return <UsersIcon size={size} />;
	}
}

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
					{section.items.map((item) => {
						const active = isNavigationItemActive(item, location.pathname);
						return (
							<ButtonLink
								to={item.to}
								fullWidth
								key={item.id}
								reloadDocument={item.reloadDocument}
								className="h-10 justify-start"
								variant={active ? "secondary" : "ghost"}
								aria-current={active ? "page" : undefined}
							>
								<NavigationIcon name={item.icon} />
								{item.label}
							</ButtonLink>
						);
					})}
				</div>
			))}
		</nav>
	);
}

function MobileNavigation({ user }: { user: CurrentUser }) {
	const location = useLocation();
	const navigate = useNavigate();
	const items = getNavigationItems(user.role);
	const activeItem = items.find((item) =>
		isNavigationItemActive(item, location.pathname),
	);

	return (
		<Dropdown>
			<Button isIconOnly variant="ghost" aria-label="메뉴 열기">
				<MenuIcon size={20} />
			</Button>
			<Dropdown.Popover className="min-w-56" placement="bottom end">
				<Dropdown.Menu
					aria-label="주 메뉴"
					selectedKeys={activeItem ? new Set([activeItem.id]) : new Set()}
					selectionMode="single"
					onAction={(key) => {
						const item = items.find((candidate) => candidate.id === key);
						if (!item || item.to === location.pathname) return;
						if (item.reloadDocument) {
							globalThis.location.assign(item.to);
							return;
						}
						void navigate(item.to);
					}}
				>
					{items.map((item) => (
						<Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
							<Dropdown.ItemIndicator />
							<NavigationIcon name={item.icon} />
							<Label>{item.label}</Label>
						</Dropdown.Item>
					))}
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
}

function IdentityCard({ user }: { user: CurrentUser }) {
	return (
		<Surface
			className="flex items-center gap-2 rounded-xl p-2.5"
			variant="tertiary"
		>
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
		</Surface>
	);
}

export function AppShell({ user }: { user: CurrentUser }) {
	const location = useLocation();
	const appName = import.meta.env.VITE_APP_NAME ?? "Management System";
	const currentPageLabel = getNavigationLabel(location.pathname) ?? appName;

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
					<IdentityCard user={user} />
				</div>
			</Surface>

			<div className="min-w-0 flex-1">
				<Surface
					className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 px-3 md:hidden"
					role="banner"
					variant="secondary"
				>
					<Typography.Paragraph truncate size="sm" weight="semibold">
						{currentPageLabel}
					</Typography.Paragraph>
					<MobileNavigation user={user} />
				</Surface>
				<main className="mx-auto w-full max-w-6xl p-3 sm:p-6 lg:p-8">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
