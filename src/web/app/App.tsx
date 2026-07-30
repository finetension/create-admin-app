import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router";
import { SessionProvider } from "../entities/session";
import {
	canRoleAccessPath,
	getAccessBoundaryForRole,
	getRolePath,
} from "../features/app-navigation";
import { DashboardPage } from "../pages/dashboard";
import { MenuPage } from "../pages/menu";
import { TeamPage } from "../pages/team";
import {
	ApiError,
	accessBoundaryForPath,
	api,
	pathWithoutAccessBoundary,
} from "../shared/api";
import { LoadingState, Surface } from "../shared/ui";
import { AppShell } from "../widgets/app-shell";
import { AccessDeniedPage, NotFoundPage, SessionErrorPage } from "./ErrorPages";

function AuthenticatedApp() {
	const location = useLocation();
	const pathname = location.pathname;
	const currentBoundary = accessBoundaryForPath(pathname);
	const user = useQuery({
		queryKey: ["me", currentBoundary],
		queryFn: api.me,
		retry: false,
	});
	const targetPath = user.data
		? getRolePath(user.data.role, pathWithoutAccessBoundary(pathname))
		: pathname;
	const requiresRoleNavigation = Boolean(user.data && targetPath !== pathname);

	useEffect(() => {
		if (!requiresRoleNavigation) return;
		globalThis.location.replace(
			`${targetPath}${location.search}${location.hash}`,
		);
	}, [location.hash, location.search, requiresRoleNavigation, targetPath]);

	if (user.isLoading) {
		return (
			<Surface className="grid min-h-dvh place-items-center">
				<LoadingState label="관리 시스템에 연결하는 중" />
			</Surface>
		);
	}
	if (user.isError || !user.data) {
		return (
			<SessionErrorPage
				error={user.error}
				onRetry={() => {
					if (user.error instanceof ApiError && user.error.status === 401) {
						globalThis.location.reload();
						return;
					}
					void user.refetch();
				}}
			/>
		);
	}
	if (requiresRoleNavigation) {
		return (
			<Surface className="grid min-h-dvh place-items-center">
				<LoadingState label="권한에 맞는 화면으로 이동하는 중" />
			</Surface>
		);
	}

	const roleBoundary = getAccessBoundaryForRole(user.data.role);
	const routePrefix = roleBoundary.slice(1) || undefined;
	const homePath = getRolePath(user.data.role, "/");
	if (!canRoleAccessPath(user.data.role, pathname)) {
		return (
			<SessionErrorPage
				homePath={homePath}
				error={
					new ApiError(
						403,
						"FORBIDDEN",
						"현재 역할로 접근할 수 없는 화면입니다.",
					)
				}
				onRetry={() => {
					globalThis.location.replace(homePath);
				}}
			/>
		);
	}

	return (
		<SessionProvider user={user.data}>
			<Routes>
				<Route path={routePrefix} element={<AppShell user={user.data} />}>
					<Route index element={<DashboardPage />} />
					<Route path="menu" element={<MenuPage />} />
					{user.data.role === "owner" && (
						<Route path="team" element={<TeamPage />} />
					)}
					<Route path="*" element={<NotFoundPage homePath={homePath} />} />
				</Route>
			</Routes>
		</SessionProvider>
	);
}

export default function App() {
	const { pathname } = useLocation();
	if (pathname === "/public/access-denied") return <AccessDeniedPage />;
	if (pathname.startsWith("/public/")) return <NotFoundPage homePath="/" />;
	return <AuthenticatedApp />;
}
