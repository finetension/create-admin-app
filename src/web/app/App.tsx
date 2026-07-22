import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router";
import { SessionProvider } from "../entities/session";
import { DashboardPage } from "../pages/dashboard";
import { api } from "../shared/api";
import { ErrorState, LoadingState, Surface } from "../shared/ui";
import { AppShell } from "../widgets/app-shell";

export default function App() {
	const user = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });
	if (user.isLoading) {
		return (
			<Surface className="grid min-h-dvh place-items-center">
				<LoadingState label="관리 시스템에 연결하는 중" />
			</Surface>
		);
	}
	if (user.isError || !user.data) {
		return (
			<Surface className="grid min-h-dvh place-items-center">
				<ErrorState message="관리 시스템에 접근할 수 없습니다. 인증과 D1 migration 상태를 확인하세요." />
			</Surface>
		);
	}

	return (
		<SessionProvider user={user.data}>
			<Routes>
				<Route element={<AppShell user={user.data} />}>
					<Route index element={<DashboardPage />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Route>
			</Routes>
		</SessionProvider>
	);
}
