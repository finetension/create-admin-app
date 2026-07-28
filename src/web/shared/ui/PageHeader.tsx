import type { ReactNode } from "react";
import { Typography } from "./components";

interface PageHeaderProps {
	eyebrow: string;
	title: string;
	description: string;
	actions?: ReactNode;
	compactOnMobile?: boolean;
}

export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
	compactOnMobile = false,
}: PageHeaderProps) {
	return (
		<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div className="min-w-0">
				<Typography.Paragraph
					className={compactOnMobile ? "hidden md:block" : undefined}
					color="muted"
					size="xs"
				>
					{eyebrow}
				</Typography.Paragraph>
				<Typography.Heading
					className={
						compactOnMobile
							? "sr-only md:not-sr-only md:break-words md:text-3xl md:leading-tight"
							: "break-words text-2xl leading-tight sm:text-3xl"
					}
					level={1}
				>
					{title}
				</Typography.Heading>
				<Typography.Paragraph
					className={
						compactOnMobile
							? "max-w-3xl break-words"
							: "mt-1 max-w-3xl break-words"
					}
					color="muted"
					size="sm"
				>
					{description}
				</Typography.Paragraph>
			</div>
			{actions}
		</header>
	);
}
