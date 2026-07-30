import type { CurrentUser } from "../../../../shared/contracts";
import {
	type AccessBoundary,
	pathWithAccessBoundary,
	pathWithoutAccessBoundary,
} from "../../../shared/api";

export type NavigationIconName = "dashboard" | "team";

export interface NavigationItem {
	id: string;
	label: string;
	shortLabel: string;
	description: string;
	to: string;
	icon: NavigationIconName;
	mobilePrimary?: boolean;
	roles?: CurrentUser["role"][];
	reloadDocument?: boolean;
}

export interface NavigationSection {
	id: string;
	label: string;
	items: NavigationItem[];
}

const navigationSections: NavigationSection[] = [
	{
		id: "workspace",
		label: "업무",
		items: [
			{
				id: "dashboard",
				label: "홈",
				shortLabel: "홈",
				description: "관리 시스템의 시작 화면",
				to: "/",
				icon: "dashboard",
				mobilePrimary: true,
			},
		],
	},
	{
		id: "management",
		label: "관리",
		items: [
			{
				id: "team",
				label: "시스템 관리",
				shortLabel: "관리",
				description: "구성원 권한과 데이터 변경 감사 기록",
				to: "/team",
				icon: "team",
				roles: ["owner"],
			},
		],
	},
];

export function getAccessBoundaryForRole(
	role: CurrentUser["role"],
): AccessBoundary {
	if (role === "owner") return "/owner";
	if (role === "admin") return "/admin";
	return "";
}

export function getRolePath(
	role: CurrentUser["role"],
	pathname: string,
): string {
	return pathWithAccessBoundary(getAccessBoundaryForRole(role), pathname);
}

function canViewItem(item: NavigationItem, role: CurrentUser["role"]): boolean {
	return !item.roles || item.roles.includes(role);
}

export function canRoleAccessPath(
	role: CurrentUser["role"],
	pathname: string,
): boolean {
	const relativePath = pathWithoutAccessBoundary(pathname);
	if (relativePath === "/menu") return true;
	const item = navigationSections
		.flatMap((section) => section.items)
		.find((candidate) =>
			candidate.to === "/"
				? relativePath === "/"
				: relativePath === candidate.to ||
					relativePath.startsWith(`${candidate.to}/`),
		);
	return !item || canViewItem(item, role);
}

export function getNavigationSections(
	role: CurrentUser["role"],
): NavigationSection[] {
	return navigationSections
		.map((section) => ({
			...section,
			items: section.items
				.filter((item) => canViewItem(item, role))
				.map((item) => ({
					...item,
					to: getRolePath(role, item.to),
				})),
		}))
		.filter((section) => section.items.length > 0);
}

export function getMobilePrimaryItems(
	role: CurrentUser["role"],
): NavigationItem[] {
	return getNavigationSections(role)
		.flatMap((section) => section.items)
		.filter((item) => item.mobilePrimary)
		.slice(0, 3);
}

export function getNavigationLabel(pathname: string): string | undefined {
	const relativePath = pathWithoutAccessBoundary(pathname);
	return navigationSections
		.flatMap((section) => section.items)
		.find((item) =>
			item.to === "/"
				? relativePath === "/"
				: relativePath === item.to || relativePath.startsWith(`${item.to}/`),
		)?.label;
}

export function isNavigationItemActive(
	item: NavigationItem,
	pathname: string,
): boolean {
	const itemPath = pathWithoutAccessBoundary(item.to);
	const currentPath = pathWithoutAccessBoundary(pathname);
	return itemPath === "/"
		? currentPath === "/"
		: currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}
