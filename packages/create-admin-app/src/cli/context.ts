import { resolve } from "node:path";
import * as prompts from "@clack/prompts";
import type { CreateContext, CreateOptions } from "../core/context.js";
import {
	displayNameFromPackageName,
	normalizeEmails,
	packageNameFromDirectory,
} from "../core/project.js";
import { answer } from "./prompts.js";

export async function createContext(
	options: CreateOptions,
): Promise<CreateContext> {
	const interactive = !options.yes;
	const directoryInput =
		options.directory ??
		(interactive
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
		throw new Error("--yes를 사용할 때는 생성할 디렉터리를 지정하세요.");
	}

	const destination = resolve(directoryInput);
	const packageName = packageNameFromDirectory(destination);
	const displayName =
		options.name ??
		(interactive
			? answer(
					await prompts.text({
						message: "서비스 이름",
						initialValue: displayNameFromPackageName(packageName),
						validate: (value) =>
							value?.trim() ? undefined : "서비스 이름을 입력하세요.",
					}),
				).trim()
			: displayNameFromPackageName(packageName));
	const rawEmails =
		options.emails ??
		(interactive
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
		throw new Error("--yes를 사용할 때는 --emails를 지정하세요.");
	}
	const allowedEmails = normalizeEmails(rawEmails);

	return {
		args: options,
		interactive,
		project: {
			directoryInput,
			destination,
			packageName,
			displayName,
			allowedEmails,
		},
	};
}
