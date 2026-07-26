import { basename } from "node:path";
import { z } from "zod";

const emailSchema = z
	.string()
	.trim()
	.transform((email) => email.toLowerCase())
	.pipe(z.email());

export function packageNameFromDirectory(directory: string): string {
	const normalized = basename(directory)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63)
		.replace(/-+$/g, "");
	return normalized || "admin-app";
}

export function displayNameFromPackageName(name: string): string {
	return name
		.split(/[-_.]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

export function normalizeDisplayName(value: string): string {
	const parsed = z
		.string()
		.trim()
		.min(1)
		.max(100)
		.transform((name) => name.replace(/\s+/g, " "))
		.safeParse(value);
	if (!parsed.success) {
		throw new Error("서비스 이름은 1자 이상 100자 이하여야 합니다.");
	}
	return parsed.data;
}

export function normalizeEmails(value: string): string[] {
	const values = value
		.split(/[\n,]+/)
		.map((email) => email.trim())
		.filter(Boolean);
	const parsed = z.array(emailSchema).min(1).safeParse(values);
	if (!parsed.success) {
		throw new Error("올바른 접근 허용 이메일을 하나 이상 입력하세요.");
	}
	return [...new Set(parsed.data)];
}
