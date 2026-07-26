import { romanize } from "es-hangul";

export const serviceNameMaxLength = 56;

export function normalizeServiceName(name: string): string {
	return romanize(name.normalize("NFKC"))
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-+/g, "-")
		.slice(0, serviceNameMaxLength)
		.replace(/-+$/g, "");
}
