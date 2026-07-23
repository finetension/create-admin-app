import { type ParsedArgs, parseArgs as parseCittyArgs } from "citty";
import type { CreateOptions } from "../core/context.js";

export const createArgs = {
	directory: {
		type: "positional",
		required: false,
		description: "생성할 프로젝트 디렉터리",
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
	domain: {
		type: "string",
		description: "사용할 Cloudflare Zone",
		valueHint: "domain",
	},
	subdomain: {
		type: "string",
		description: "수정 가능한 custom-domain prefix",
		valueHint: "prefix",
	},
	github: {
		type: "boolean",
		description: "GitHub 저장소를 생성하고 push합니다.",
		negativeDescription: "프로젝트를 로컬에만 생성합니다.",
	},
	cloudflare: {
		type: "boolean",
		description: "Cloudflare 운영 환경을 연결합니다.",
		negativeDescription: "local D1 개발 환경만 설정합니다.",
	},
	public: {
		type: "boolean",
		default: false,
		description: "Cloudflare 연결 없는 공개 GitHub 저장소를 생성합니다.",
	},
	deploy: {
		type: "boolean",
		default: false,
		description: "첫 production deployment를 dispatch합니다.",
	},
	"skip-install": {
		type: "boolean",
		default: false,
		description: "pnpm 의존성 설치를 건너뜁니다.",
	},
	yes: {
		type: "boolean",
		alias: "y",
		default: false,
		description: "비파괴 기본값을 승인합니다.",
	},
} as const;

const parsedArgumentKeys = new Set([
	"_",
	"directory",
	"name",
	"emails",
	"domain",
	"subdomain",
	"github",
	"cloudflare",
	"public",
	"deploy",
	"skip-install",
	"skipInstall",
	"yes",
	"y",
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

	const options: CreateOptions = {
		yes: parsed.yes,
		skipInstall: parsed["skip-install"],
		public: parsed.public,
		deploy: parsed.deploy,
		...(parsed.directory ? { directory: parsed.directory } : {}),
		...(parsed.name ? { name: parsed.name } : {}),
		...(parsed.emails ? { emails: parsed.emails } : {}),
		...(parsed.domain ? { domain: parsed.domain } : {}),
		...(parsed.subdomain ? { subdomain: parsed.subdomain } : {}),
		...(parsed.github === undefined ? {} : { github: parsed.github }),
		...(parsed.cloudflare === undefined
			? {}
			: { cloudflare: parsed.cloudflare }),
	};

	if (options.subdomain && !options.domain) {
		throw new Error("--subdomain은 --domain과 함께 사용해야 합니다.");
	}
	if (options.domain) {
		if (options.cloudflare === false) {
			throw new Error("--domain은 Cloudflare 연결과 함께 사용해야 합니다.");
		}
		options.cloudflare = true;
	}
	if (options.deploy && options.cloudflare === false) {
		throw new Error("--deploy는 Cloudflare 연결과 함께 사용해야 합니다.");
	}
	if (options.deploy && options.github === false) {
		throw new Error("--deploy는 GitHub 저장소 생성과 함께 사용해야 합니다.");
	}
	if (options.deploy) {
		options.cloudflare = true;
		options.github = true;
	}
	if (options.public) {
		if (options.github === false) {
			throw new Error("--public과 --no-github는 함께 사용할 수 없습니다.");
		}
		if (options.cloudflare === true) {
			throw new Error(
				"--public과 Cloudflare 운영 연결은 함께 사용할 수 없습니다. 운영 저장소는 private으로 생성하세요.",
			);
		}
		options.github = true;
		options.cloudflare = false;
	}

	return options;
}

export function parseArgs(argv: string[]): CreateOptions {
	return resolveCreateOptions(
		parseCittyArgs<typeof createArgs>(argv, createArgs),
	);
}
