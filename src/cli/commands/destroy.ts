import { setTimeout as delay } from "node:timers/promises";
import * as prompts from "@clack/prompts";
import { defineCommand } from "citty";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { CliError, configurationError, safetyError } from "../core/error.ts";
import { runCommand } from "../core/process.ts";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../core/runtime.ts";
import { loadDeploymentContext } from "../deployment/context.ts";
import { destroyDeployment } from "../deployment/destroy.ts";
import {
	dispatchDestroyWorkflow,
	findWorkflowRun,
	type GitHubWorkflowRun,
	listWorkflowRuns,
	waitForWorkflowRun,
} from "../deployment/github.ts";

function answer<T>(value: T | symbol): T {
	if (prompts.isCancel(value)) {
		throw safetyError(
			"destroy_cancelled",
			"인프라 철거를 취소했습니다.",
			"준비가 되면 같은 명령을 다시 실행하세요.",
		);
	}
	return value as T;
}

async function headSha(): Promise<string> {
	const result = await runCommand("git", ["rev-parse", "HEAD"], {
		capture: true,
		ci: false,
	});
	return result.stdout.trim();
}

export default defineCommand({
	meta: {
		name: "destroy",
		description:
			"Actions에서 Worker와 Access를 철거하고 기본적으로 D1을 보존합니다.",
	},
	args: {
		...commonOutputArgs,
		confirm: {
			type: "string",
			description: "project slug와 정확히 같은 확인값",
			valueHint: "slug",
		},
		"include-data": {
			type: "boolean",
			description: "D1까지 복구 보장 없이 삭제합니다.",
			default: false,
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "표시한 철거 계획을 승인합니다.",
			default: false,
		},
	},
	async run({ args }) {
		const config = await loadDeploymentContext();
		if (!resolveCloudflareApiToken(config.accountId)) {
			throw configurationError(
				"missing_cloudflare_token",
				"철거 계획을 조회할 Cloudflare token이 없습니다.",
				"pnpm cli deploy --interactive로 token을 저장하세요.",
			);
		}
		const repository =
			config.github?.owner && config.github.repository
				? `${config.github.owner}/${config.github.repository}`
				: undefined;
		if (!repository) {
			throw safetyError(
				"missing_github_target",
				"config.toml에 GitHub 배포 대상이 없습니다.",
				"먼저 pnpm cli deploy를 완료하세요.",
			);
		}
		const inspection = await destroyDeployment(config, {
			includeData: args["include-data"],
		});
		const plan = {
			command: "destroy",
			repository,
			confirm: config.slug,
			include_data: args["include-data"],
			worker: inspection.worker?.name ?? null,
			access: inspection.access.appId ?? null,
			d1: {
				name: inspection.d1?.name ?? null,
				action: args["include-data"] ? "delete" : "preserve",
			},
		};
		if (cliRuntime().machine) {
			process.stderr.write(`${JSON.stringify({ plan })}\n`);
		} else {
			prompts.note(JSON.stringify(plan, null, 2), "Destroy plan");
		}

		let confirmation = args.confirm;
		if (cliRuntime().machine) {
			if (!args.yes || confirmation !== config.slug) {
				throw new CliError(
					"destroy_confirmation_required",
					"비인터랙티브 철거에는 --yes와 정확한 --confirm <slug>가 필요합니다.",
					`--yes --confirm ${config.slug}${args["include-data"] ? " --include-data" : ""}`,
					"safety",
					undefined,
					{ plan },
				);
			}
		} else {
			confirmation = answer(
				await prompts.text({
					message: `철거하려면 ${config.slug}를 정확히 입력하세요`,
				}),
			).trim();
			if (confirmation !== config.slug) {
				throw safetyError(
					"destroy_confirmation_mismatch",
					"project slug 확인값이 일치하지 않습니다.",
					`정확히 ${config.slug}를 입력하세요.`,
				);
			}
		}

		const sha = await headSha();
		const excludedRunIds = new Set(
			(await listWorkflowRuns(repository, "application-destroy.yml"))
				.filter((existingRun) => existingRun.headSha === sha)
				.map((existingRun) => existingRun.databaseId),
		);
		await dispatchDestroyWorkflow(
			repository,
			confirmation,
			args["include-data"],
		);
		let run: GitHubWorkflowRun | null = null;
		for (let attempt = 0; attempt < 30 && !run; attempt += 1) {
			run = await findWorkflowRun(
				repository,
				"application-destroy.yml",
				sha,
				excludedRunIds,
			);
			if (!run) await delay(2_000);
		}
		if (!run) {
			throw safetyError(
				"destroy_workflow_not_found",
				"시작한 Application Destroy workflow run을 찾지 못했습니다.",
				`gh run list --repo ${repository} --workflow application-destroy.yml`,
			);
		}
		await waitForWorkflowRun(
			repository,
			run.databaseId,
			run.url,
			`pnpm cli destroy --yes --confirm ${config.slug}${args["include-data"] ? " --include-data" : ""}`,
		);
		await runCommand("git", ["fetch", "origin", "main"], { ci: false });
		const merge = await runCommand(
			"git",
			["merge", "--ff-only", "origin/main"],
			{
				capture: true,
				allowFailure: true,
				ci: false,
			},
		);
		if (merge.exitCode !== 0) {
			throw new CliError(
				"destroy_lifecycle_sync_failed",
				"인프라 철거는 성공했지만 lifecycle commit을 로컬 main에 fast-forward하지 못했습니다.",
				"git pull --ff-only origin main",
				"external",
				undefined,
				{
					destroyed: true,
					data_preserved: !args["include-data"],
					local_sync: "failed",
					actions_url: run.url,
					recovery: "git pull --ff-only origin main",
				},
			);
		}
		const result = {
			destroyed: true,
			data_preserved: !args["include-data"],
			local_sync: "complete",
			actions_url: run.url,
			plan,
		};
		if (cliRuntime().machine) writeCliResult(result);
		else prompts.outro("Cloudflare 인프라 철거가 완료됐습니다.");
	},
});
