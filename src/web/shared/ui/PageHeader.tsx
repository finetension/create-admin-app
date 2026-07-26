import type { ReactNode } from "react";
import { Typography } from "./components";

interface PageHeaderProps {
	eyebrow: string;
	title: string;
	description: string;
	actions?: ReactNode;
}

export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
}: PageHeaderProps) {
	return (
		<header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<Typography.Paragraph color="muted" size="xs">
					{eyebrow}
				</Typography.Paragraph>
				<Typography.Heading level={1}>{title}</Typography.Heading>
				<Typography.Paragraph color="muted">{description}</Typography.Paragraph>
			</div>
			{actions}
		</header>
	);
}
