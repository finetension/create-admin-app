import { defineCommand } from "citty";
import { usageError } from "../core/error.ts";
import { commonOutputArgs } from "../core/runtime.ts";
import { runLocalDeploy } from "../deployment/local-deploy.ts";

export default defineCommand({
	meta: {
		name: "deploy",
		description:
			"GitHub repository를 준비하고 protected Actions production 배포를 기다립니다.",
	},
	args: {
		...commonOutputArgs,
		"github-owner": {
			type: "string",
			description: "GitHub 개인 계정 또는 organization owner",
			valueHint: "owner",
		},
		"github-repository": {
			type: "string",
			description: "GitHub repository 이름",
			valueHint: "repository",
		},
		public: {
			type: "boolean",
			description: "public GitHub repository를 사용합니다.",
			default: false,
		},
		private: {
			type: "boolean",
			description: "private GitHub repository를 사용합니다.",
			default: false,
		},
		"cloudflare-account-id": {
			type: "string",
			description: "Cloudflare account ID",
			valueHint: "account-id",
		},
		"workers-dev": {
			type: "boolean",
			description: "workers.dev 주소를 사용합니다.",
			default: false,
		},
		domain: {
			type: "string",
			description: "active Cloudflare Zone",
			valueHint: "example.com",
		},
		subdomain: {
			type: "string",
			description: "custom domain prefix",
			valueHint: "my-company",
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "표시한 외부 변경 계획을 승인합니다.",
			default: false,
		},
		message: {
			type: "string",
			description: "변경이 있을 때 사용할 자동 commit message",
			valueHint: "message",
		},
		"dry-run": {
			type: "boolean",
			description: "원격 또는 파일 변경 없이 최종 계획만 출력합니다.",
			default: false,
		},
		reconfigure: {
			type: "boolean",
			description:
				"확정된 repository, visibility 또는 route 변경을 계획합니다.",
			default: false,
		},
	},
	async run({ args }) {
		if (args.public && args.private) {
			throw usageError(
				"conflicting_repository_visibility",
				"--public과 --private는 함께 사용할 수 없습니다.",
				"둘 중 하나만 선택하세요.",
			);
		}
		await runLocalDeploy({
			githubOwner: args["github-owner"],
			githubRepository: args["github-repository"],
			...(args.public
				? { visibility: "public" as const }
				: args.private
					? { visibility: "private" as const }
					: {}),
			cloudflareAccountId: args["cloudflare-account-id"],
			workersDev: args["workers-dev"],
			domain: args.domain,
			subdomain: args.subdomain,
			yes: args.yes,
			message: args.message,
			dryRun: args["dry-run"],
			reconfigure: args.reconfigure,
		});
	},
});
