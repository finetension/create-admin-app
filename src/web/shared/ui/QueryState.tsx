import { Alert, EmptyState, Spinner, Typography } from "./components";
import { AlertCircleIcon, InboxIcon } from "./icons";

export function LoadingState({ label = "불러오는 중" }: { label?: string }) {
	return (
		<div
			className="flex min-h-48 flex-col items-center justify-center gap-3 p-4 text-center"
			aria-live="polite"
		>
			<Spinner size="lg" />
			<Typography.Paragraph color="muted">{label}</Typography.Paragraph>
		</div>
	);
}

export function ErrorState({ message }: { message: string }) {
	return (
		<Alert status="danger">
			<Alert.Indicator>
				<AlertCircleIcon size={22} />
			</Alert.Indicator>
			<Alert.Content>
				<Alert.Title>요청을 완료하지 못했습니다</Alert.Title>
				<Alert.Description>{message}</Alert.Description>
			</Alert.Content>
		</Alert>
	);
}

export function QueryEmptyState({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<EmptyState className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
			<InboxIcon size={26} />
			<Typography.Heading level={3}>{title}</Typography.Heading>
			<Typography.Paragraph color="muted">{description}</Typography.Paragraph>
		</EmptyState>
	);
}
