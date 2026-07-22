import { useLocation, useNavigate } from "react-router";
import type { ButtonProps, LinkProps } from "./adapters/heroui";
import { Button, Link } from "./components";

type RouterLinkProps = Omit<LinkProps, "href"> & {
	to: string;
	end?: boolean;
	activeClassName?: string;
};

export function RouterLink({
	to,
	end,
	activeClassName = "active",
	className,
	onClick,
	...props
}: RouterLinkProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const active = end
		? location.pathname === to
		: location.pathname === to || location.pathname.startsWith(`${to}/`);
	const resolvedClassName = [
		typeof className === "string" ? className : "",
		active ? activeClassName : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<Link
			{...props}
			href={to}
			className={resolvedClassName}
			onClick={(event) => {
				onClick?.(event);
				if (
					event.defaultPrevented ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				)
					return;
				event.preventDefault();
				void navigate(to);
			}}
		/>
	);
}

type ButtonLinkProps = ButtonProps & { to: string };

export function ButtonLink({ to, onPress, ...props }: ButtonLinkProps) {
	const navigate = useNavigate();
	return (
		<Button
			{...props}
			onPress={(event) => {
				onPress?.(event);
				void navigate(to);
			}}
		/>
	);
}
