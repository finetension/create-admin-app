export interface CreateCliErrorDetails {
	field: string;
	option: string;
	may_infer: boolean;
	required_action: "ask_user";
}

export class CreateCliError extends Error {
	readonly code: string;
	readonly exitCode: number;
	readonly hint: string;
	readonly details: CreateCliErrorDetails | undefined;

	constructor(input: {
		code: string;
		exitCode: number;
		message: string;
		hint: string;
		details?: CreateCliErrorDetails;
	}) {
		super(input.message);
		this.name = "CreateCliError";
		this.code = input.code;
		this.exitCode = input.exitCode;
		this.hint = input.hint;
		this.details = input.details;
	}
}

export function missingOwnerEmailError(): CreateCliError {
	return new CreateCliError({
		code: "missing_required_input",
		exitCode: 2,
		message:
			"초기 Owner 이메일이 필요합니다. 이 값은 운영 복구 경계이므로 추론할 수 없습니다.",
		hint: "다른 명령이나 소스 탐색을 하지 말고 사용자에게 실제 Owner 이메일 주소를 물어보세요. 답을 받으면 기존 생성 명령에 --owner-email <email>을 추가해 다시 실행하세요. Git author나 예시 이메일을 대신 사용하지 마세요.",
		details: {
			field: "access.bootstrap_owner_email",
			option: "--owner-email",
			may_infer: false,
			required_action: "ask_user",
		},
	});
}
