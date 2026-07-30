import { type ReactNode, useEffect } from "react";
import { ApiError } from "../shared/api";
import {
	AlertCircleIcon,
	Button,
	ButtonLink,
	Surface,
	Typography,
} from "../shared/ui";

const appName = import.meta.env.VITE_APP_NAME ?? "Management System";

function usePageTitle(title: string) {
	useEffect(() => {
		document.title = `${title} · ${appName}`;
	}, [title]);
}

function FullPageMessage({
	title,
	description,
	actions,
}: {
	title: string;
	description: string;
	actions: ReactNode;
}) {
	return (
		<Surface className="grid min-h-dvh place-items-center px-5 py-12">
			<main className="grid w-full max-w-sm justify-items-center gap-5 text-center">
				<div className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger-soft-foreground">
					<AlertCircleIcon aria-hidden size={24} />
				</div>
				<div className="grid gap-2">
					<Typography.Heading level={1} className="text-xl">
						{title}
					</Typography.Heading>
					<Typography.Paragraph color="muted">
						{description}
					</Typography.Paragraph>
				</div>
				<div className="grid w-full gap-2">{actions}</div>
			</main>
		</Surface>
	);
}

export function AccessDeniedPage() {
	usePageTitle("접근 권한 없음");
	return (
		<FullPageMessage
			title="이 계정에는 접근 권한이 없습니다"
			description={`${appName} 구성원으로 등록된 계정인지 확인해 주세요. 계정이 다르면 로그아웃한 뒤 다시 로그인할 수 있습니다.`}
			actions={
				<>
					<ButtonLink to="/" reloadDocument fullWidth variant="primary">
						홈으로 이동
					</ButtonLink>
					<ButtonLink
						to="/cdn-cgi/access/logout"
						reloadDocument
						fullWidth
						variant="secondary"
					>
						로그아웃하고 다시 로그인
					</ButtonLink>
				</>
			}
		/>
	);
}

export function SessionErrorPage({
	error,
	onRetry,
	homePath = "/",
}: {
	error: unknown;
	onRetry: () => void;
	homePath?: string;
}) {
	const apiError = error instanceof ApiError ? error : undefined;
	const needsLogin =
		apiError?.status === 401 || apiError?.code === "ACCESS_SESSION_REQUIRED";
	const isForbidden = apiError?.status === 403;
	const isNetworkError = apiError?.code === "NETWORK_ERROR";
	usePageTitle(isForbidden ? "권한 없음" : "연결 오류");

	if (isForbidden) {
		return (
			<FullPageMessage
				title="이 화면을 볼 권한이 없습니다"
				description="현재 계정에 할당된 역할을 확인하거나 다른 계정으로 다시 로그인해 주세요."
				actions={
					<>
						<ButtonLink
							to={homePath}
							reloadDocument
							fullWidth
							variant="primary"
						>
							홈으로 이동
						</ButtonLink>
						<ButtonLink
							to="/cdn-cgi/access/logout"
							reloadDocument
							fullWidth
							variant="secondary"
						>
							로그아웃하고 다시 로그인
						</ButtonLink>
					</>
				}
			/>
		);
	}

	return (
		<FullPageMessage
			title={
				needsLogin
					? "로그인이 다시 필요합니다"
					: isNetworkError
						? "서버에 연결할 수 없습니다"
						: "관리 시스템을 불러오지 못했습니다"
			}
			description={
				needsLogin
					? "로그인 세션이 만료되었거나 현재 화면의 권한을 다시 확인해야 합니다."
					: isNetworkError
						? "인터넷 연결을 확인한 뒤 다시 시도해 주세요."
						: "잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 알려주세요."
			}
			actions={
				<Button fullWidth onPress={onRetry} variant="primary">
					{needsLogin ? "로그인 다시 하기" : "다시 시도"}
				</Button>
			}
		/>
	);
}

export function FatalErrorPage({ onRetry }: { onRetry: () => void }) {
	usePageTitle("화면 오류");
	return (
		<FullPageMessage
			title="화면을 표시하지 못했습니다"
			description="예상하지 못한 오류가 발생했습니다. 페이지를 새로 불러와 주세요."
			actions={
				<Button fullWidth onPress={onRetry} variant="primary">
					페이지 새로고침
				</Button>
			}
		/>
	);
}

export function NotFoundPage({ homePath }: { homePath: string }) {
	usePageTitle("페이지를 찾을 수 없음");
	return (
		<div className="grid min-h-64 place-items-center px-4 py-12 text-center">
			<div className="grid max-w-sm justify-items-center gap-4">
				<div className="grid gap-1">
					<Typography.Heading level={1} className="text-xl">
						페이지를 찾을 수 없습니다
					</Typography.Heading>
					<Typography.Paragraph color="muted">
						주소가 바뀌었거나 사용할 수 없는 화면입니다.
					</Typography.Paragraph>
				</div>
				<ButtonLink to={homePath} variant="secondary">
					홈으로 이동
				</ButtonLink>
			</div>
		</div>
	);
}
