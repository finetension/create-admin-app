import { basename } from "node:path";

export function packageNameFromDirectory(directory: string): string {
	const normalized = basename(directory)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^[._-]+|[._-]+$/g, "");
	return normalized || "admin-app";
}

export function displayNameFromPackageName(name: string): string {
	return name
		.split(/[-_.]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

export function subdomainFromPackageName(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "admin"
	);
}

export function normalizeEmails(value: string): string {
	const emails = [
		...new Set(
			value
				.split(/[\n,]+/)
				.map((email) => email.trim().toLowerCase())
				.filter(Boolean),
		),
	];
	if (
		emails.length === 0 ||
		emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
	) {
		throw new Error("올바른 접근 허용 이메일을 하나 이상 입력하세요.");
	}
	return emails.join(",");
}

export function validateSubdomain(value?: string): string | undefined {
	return value && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)
		? undefined
		: "영문 소문자, 숫자와 하이픈으로 된 단일 prefix를 입력하세요.";
}
