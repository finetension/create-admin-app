import type { CreateOptions } from "../core/context.js";

const valueFlags: Record<string, "name" | "emails" | "domain" | "subdomain"> = {
	"--name": "name",
	"--emails": "emails",
	"--domain": "domain",
	"--subdomain": "subdomain",
};

const booleanFlags: Record<
	string,
	readonly [
		(
			| "yes"
			| "skipInstall"
			| "github"
			| "cloudflare"
			| "public"
			| "deploy"
			| "help"
		),
		boolean,
	]
> = {
	"--yes": ["yes", true],
	"--skip-install": ["skipInstall", true],
	"--github": ["github", true],
	"--no-github": ["github", false],
	"--cloudflare": ["cloudflare", true],
	"--no-cloudflare": ["cloudflare", false],
	"--public": ["public", true],
	"--deploy": ["deploy", true],
	"--help": ["help", true],
	"-h": ["help", true],
};

export function parseArgs(argv: string[]): CreateOptions {
	const options: CreateOptions = {
		yes: false,
		skipInstall: false,
		public: false,
		deploy: false,
		help: false,
	};
	const positionals: string[] = [];

	for (let index = 0; index < argv.length; index += 1) {
		const raw = argv[index];
		if (!raw) continue;
		const equalsIndex = raw.indexOf("=");
		const flag = equalsIndex === -1 ? raw : raw.slice(0, equalsIndex);
		const inlineValue =
			equalsIndex === -1 ? undefined : raw.slice(equalsIndex + 1);
		const boolean = booleanFlags[flag];
		if (boolean) {
			if (inlineValue !== undefined) {
				throw new Error(`${flag}에는 값을 지정할 수 없습니다.`);
			}
			const [key, value] = boolean;
			(options as unknown as Record<string, unknown>)[key] = value;
			continue;
		}
		const valueKey = valueFlags[flag];
		if (valueKey) {
			const value = inlineValue ?? argv[index + 1];
			if (!value || (inlineValue === undefined && value.startsWith("--"))) {
				throw new Error(`${flag} 값이 필요합니다.`);
			}
			options[valueKey] = value;
			if (inlineValue === undefined) index += 1;
			continue;
		}
		if (raw.startsWith("-")) throw new Error(`알 수 없는 옵션입니다: ${raw}`);
		positionals.push(raw);
	}

	if (positionals.length > 1) {
		throw new Error("생성할 디렉터리는 하나만 지정할 수 있습니다.");
	}
	if (positionals[0]) options.directory = positionals[0];
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

export const helpText = `Usage: pnpm create @finetension/admin-app [directory] [options]

Options:
  --name <name>           Display name
  --emails <email,...>    Cloudflare Access allowlist
  --domain <domain>       Custom domain zone
  --subdomain <prefix>    Editable custom-domain prefix
  --github                Create and push a GitHub repository
  --no-github             Keep the project local
  --cloudflare            Configure Cloudflare (token from prompt or environment)
  --no-cloudflare         Keep local D1 development only
  --public                Create a public, local-only GitHub repository
  --deploy                Dispatch the first production deployment
  --skip-install          Do not install pnpm dependencies
  --yes                   Accept non-destructive defaults
  -h, --help              Show this help`;
