import { type ParsedArgs, parseArgs as parseCittyArgs } from "citty";
import type { CreateOptions } from "../core/context.js";

export const createArgs = {
	directory: {
		type: "positional",
		required: false,
		description: "생성할 프로젝트 디렉터리와 slug",
		valueHint: "directory",
	},
	name: {
		type: "string",
		description: "앱에 표시할 이름",
		valueHint: "name",
	},
	emails: {
		type: "string",
		description: "Cloudflare Access 허용 이메일 목록",
		valueHint: "email,...",
	},
	public: {
		type: "boolean",
		default: false,
		description:
			"이후 deploy가 public GitHub repository를 사용하도록 기록합니다.",
	},
	deploy: {
		type: "boolean",
		default: false,
		description: "생성 완료 뒤 프로젝트의 pnpm cli deploy를 실행합니다.",
	},
	message: {
		type: "string",
		description: "deploy가 변경을 commit할 때 사용할 message",
		valueHint: "message",
	},
	"skip-install": {
		type: "boolean",
		default: false,
		description: "pnpm install과 pnpm check를 건너뜁니다.",
	},
	yes: {
		type: "boolean",
		alias: "y",
		default: false,
		description: "deploy 외부 변경 계획을 승인합니다.",
	},
	json: {
		type: "boolean",
		default: false,
		description: "프롬프트 없이 JSON을 출력합니다.",
	},
	interactive: {
		type: "boolean",
		default: false,
		description: "TTY에서 사람용 프롬프트를 강제합니다.",
	},
} as const;

const parsedArgumentKeys = new Set([
	"_",
	"directory",
	"name",
	"emails",
	"public",
	"deploy",
	"message",
	"skip-install",
	"skipInstall",
	"yes",
	"y",
	"json",
	"interactive",
]);

export function resolveCreateOptions(
	parsed: ParsedArgs<typeof createArgs>,
): CreateOptions {
	const unknownArgument = Object.keys(parsed).find(
		(key) => !parsedArgumentKeys.has(key),
	);
	if (unknownArgument) {
		throw new Error(`알 수 없는 옵션입니다: ${unknownArgument}`);
	}
	if (parsed._.length > 1) {
		throw new Error("생성할 디렉터리는 하나만 지정할 수 있습니다.");
	}
	if (parsed.json && parsed.interactive) {
		throw new Error("--json과 --interactive는 함께 사용할 수 없습니다.");
	}
	if (parsed.deploy && parsed["skip-install"]) {
		throw new Error(
			"--deploy와 --skip-install은 함께 사용할 수 없습니다. 배포 전에 install과 check가 필요합니다.",
		);
	}
	if (
		parsed.deploy &&
		parsed.json &&
		(!parsed.yes || !parsed.message?.trim())
	) {
		throw new Error(
			"비인터랙티브 --deploy에는 --yes와 비어 있지 않은 --message가 필요합니다.",
		);
	}
	return {
		yes: parsed.yes,
		skipInstall: parsed["skip-install"],
		public: parsed.public,
		deploy: parsed.deploy,
		json: parsed.json,
		interactive: parsed.interactive,
		...(parsed.directory ? { directory: parsed.directory } : {}),
		...(parsed.name ? { name: parsed.name } : {}),
		...(parsed.emails ? { emails: parsed.emails } : {}),
		...(parsed.message ? { message: parsed.message } : {}),
	};
}

export function normalizePnpmCreateArgs(argv: string[]): string[] {
	return argv[0] === "--" ? argv.slice(1) : argv;
}

export function parseArgs(argv: string[]): CreateOptions {
	return resolveCreateOptions(
		parseCittyArgs<typeof createArgs>(
			normalizePnpmCreateArgs(argv),
			createArgs,
		),
	);
}
