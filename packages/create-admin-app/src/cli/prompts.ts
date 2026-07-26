import * as prompts from "@clack/prompts";

export function answer<T>(value: T | symbol | undefined): NonNullable<T> {
	if (prompts.isCancel(value)) {
		prompts.cancel("프로젝트 생성을 취소했습니다.");
		process.exit(0);
	}
	if (value === undefined || value === null) {
		throw new Error("입력값을 확인하지 못했습니다.");
	}
	return value as NonNullable<T>;
}
