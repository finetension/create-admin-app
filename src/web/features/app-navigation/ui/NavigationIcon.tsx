import { LayoutDashboardIcon, UsersIcon } from "../../../shared/ui";
import type { NavigationIconName } from "../model/navigation";

export function NavigationIcon({
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
