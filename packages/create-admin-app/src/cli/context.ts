import { resolve } from "node:path";
import * as prompts from "@clack/prompts";
import { hasTTY, isAgent, isCI } from "std-env";
import type { CreateContext, CreateOptions } from "../core/context.js";
import {
	displayNameFromPackageName,
	normalizeDisplayName,
	normalizeEmails,
	packageNameFromDirectory,
} from "../core/project.js";
import { missingAllowedEmailsError } from "./error.js";
import { answer } from "./prompts.js";

export async function createContext(
	options: CreateOptions,
): Promise<CreateContext> {
	if (options.interactive && !hasTTY) {
		throw new Error("--interactive는 TTY에서만 사용할 수 있습니다.");
	}
	const machine =
		options.json || (!options.interactive && (!hasTTY || isCI || isAgent));
	if (machine && options.deploy && (!options.yes || !options.message?.trim())) {
		throw new Error(
			"비인터랙티브 --deploy에는 --yes와 비어 있지 않은 --message가 필요합니다.",
		);
	}
	const directoryInput =
		options.directory ??
		(!machine
			? answer(
					await prompts.text({
						message: "프로젝트 디렉터리",
						placeholder: "my-company",
						validate: (value) =>
							value?.trim() ? undefined : "디렉터리를 입력하세요.",
					}),
				)
			: undefined);
	if (!directoryInput) {
		throw new Error("비인터랙티브 생성에는 프로젝트 디렉터리가 필요합니다.");
	}
	const destination = resolve(directoryInput);
	const packageName = packageNameFromDirectory(destination);
	const displayName = normalizeDisplayName(
		options.name ??
			(!machine
				? answer(
						await prompts.text({
							message: "서비스 이름",
							initialValue: displayNameFromPackageName(packageName),
							validate: (value) =>
								value?.trim() ? undefined : "서비스 이름을 입력하세요.",
						}),
					).trim()
				: displayNameFromPackageName(packageName)),
	);
	const rawEmails =
		options.emails ??
		(!machine
			? answer(
					await prompts.text({
						message: "접근 허용 이메일 (쉼표로 구분)",
						validate: (value) => {
							try {
								normalizeEmails(value ?? "");
								return undefined;
							} catch (error) {
								return error instanceof Error ? error.message : String(error);
							}
						},
					}),
				)
			: undefined);
	if (!rawEmails) {
		throw missingAllowedEmailsError();
	}
	return {
		args: options,
		machine,
		project: {
			directoryInput,
			destination,
			staging: "",
			packageName,
			displayName,
			allowedEmails: normalizeEmails(rawEmails),
		},
	};
}
