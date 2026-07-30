export type AccessBoundary = "" | "/admin" | "/owner";

export function accessBoundaryForPath(pathname: string): AccessBoundary {
	if (pathname === "/owner" || pathname.startsWith("/owner/")) return "/owner";
	if (pathname === "/admin" || pathname.startsWith("/admin/")) return "/admin";
	return "";
}

export function pathWithoutAccessBoundary(pathname: string): string {
	const boundary = accessBoundaryForPath(pathname);
	if (!boundary) return pathname || "/";
	const relativePath = pathname.slice(boundary.length);
	return relativePath || "/";
}

export function pathWithAccessBoundary(
	boundary: AccessBoundary,
	pathname: string,
): string {
	const relativePath = pathWithoutAccessBoundary(pathname);
	if (!boundary) return relativePath;
	return relativePath === "/" ? boundary : `${boundary}${relativePath}`;
}
