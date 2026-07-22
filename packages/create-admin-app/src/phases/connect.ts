import { realpath } from "node:fs/promises";
import * as prompts from "@clack/prompts";
import { answer } from "../cli/prompts.js";
import type { CreateContext } from "../core/context.js";
import { storeCloudflareCredentials } from "../integrations/credentials.js";
import {
	configureProductionEnvironment,
	createGitHubRepository,
	dispatchFirstDeploy,
	listGitHubOwners,
} from "../integrations/github/api.js";

async function storeCredentials(context: CreateContext): Promise<void> {
	if (!context.cloudflare) return;
	storeCloudflareCredentials(
		await realpath(context.project.destination),
		context.cloudflare.accountId,
		context.cloudflare.token,
	);
	prompts.log.success("Cloudflare token을 OS credential store에 저장했습니다");
}

async function selectGitHubOwner(context: CreateContext): Promise<string> {
	const owners = await listGitHubOwners(context.project.destination);
	let owner = owners[0];
	if (owners.length > 1 && context.interactive) {
		const ownerLogin = answer(
			await prompts.select({
				message: "GitHub 저장소 소유자",
				options: owners.map((item) => ({
					value: item.login,
					label: item.login,
					hint: item.kind,
				})),
			}),
		);
		owner = owners.find((item) => item.login === ownerLogin);
	}
	if (!owner) throw new Error("GitHub 저장소 소유자를 선택하지 못했습니다.");
	return owner.login;
}

export async function connectProject(context: CreateContext): Promise<void> {
	await storeCredentials(context);
	const createRemote =
		context.args.github ??
		(context.interactive
			? answer(
					await prompts.confirm({
						message: "GitHub 저장소를 생성할까요?",
						initialValue: true,
					}),
				)
			: false);
	if (!createRemote) return;

	const owner = await selectGitHubOwner(context);
	context.repository = await createGitHubRepository(
		context.project.destination,
		owner,
		context.project.packageName,
		context.args.public,
	);
	if (context.cloudflare) {
		await configureProductionEnvironment(
			context.project.destination,
			context.repository,
			{
				name: context.project.displayName,
				emails: context.project.allowedEmails,
				accountId: context.cloudflare.accountId,
				token: context.cloudflare.token,
				...(context.cloudflare.domain
					? { domain: context.cloudflare.domain }
					: {}),
				...(context.cloudflare.subdomain
					? { subdomain: context.cloudflare.subdomain }
					: {}),
			},
		);
		prompts.log.success("GitHub production Environment를 설정했습니다");
	}

	if (!context.cloudflare) return;
	const deploy =
		context.args.deploy ||
		(context.interactive &&
			answer(
				await prompts.confirm({
					message: "첫 production 배포를 시작할까요?",
					initialValue: false,
				}),
			));
	if (deploy) {
		await dispatchFirstDeploy(context.project.destination, context.repository);
	}
}
