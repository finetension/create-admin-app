import * as prompts from "@clack/prompts";
import { answer } from "../../cli/prompts.js";
import type { CloudflareSetup } from "../../core/context.js";
import { validateSubdomain } from "../../core/project.js";
import {
	type CloudflareAccount,
	listCloudflareAccounts,
	listCloudflareZones,
	verifyCloudflareToken,
} from "./api.js";

export interface ResolveCloudflareOptions {
	interactive: boolean;
	explicit?: boolean;
	projectName: string;
	domain?: string;
	subdomain?: string;
}

export async function resolveCloudflareSetup({
	interactive,
	explicit,
	projectName,
	domain: domainOption,
	subdomain: subdomainOption,
}: ResolveCloudflareOptions): Promise<CloudflareSetup | undefined> {
	const connect =
		explicit ??
		(interactive
			? answer(
					await prompts.confirm({
						message: "Cloudflare를 지금 연결할까요?",
						initialValue: true,
					}),
				)
			: false);
	if (!connect) return undefined;

	const token =
		process.env.CLOUDFLARE_API_TOKEN?.trim() ||
		(interactive
			? answer(
					await prompts.password({
						message: "Cloudflare account-wide API token",
						validate: (value) =>
							value?.trim() ? undefined : "API token을 입력하세요.",
					}),
				).trim()
			: "");
	if (!token) {
		throw new Error(
			"비대화형 Cloudflare 설정에는 CLOUDFLARE_API_TOKEN이 필요합니다.",
		);
	}

	const spinner = prompts.spinner();
	spinner.start("Cloudflare 계정과 도메인을 조회합니다");
	let accounts: CloudflareAccount[];
	try {
		accounts = await listCloudflareAccounts(token);
		const firstAccount = accounts[0];
		if (!firstAccount) {
			throw new Error(
				"이 token으로 접근할 수 있는 Cloudflare 계정이 없습니다.",
			);
		}
		await verifyCloudflareToken(token, firstAccount.id);
		spinner.stop("Cloudflare token을 확인했습니다");
	} catch (error) {
		spinner.stop("Cloudflare token을 확인하지 못했습니다");
		throw error;
	}
	let account = accounts[0];
	if (accounts.length > 1 && interactive) {
		const accountId = answer(
			await prompts.select({
				message: "Cloudflare 계정 선택",
				options: accounts.map((item) => ({
					value: item.id,
					label: item.name,
				})),
			}),
		);
		account = accounts.find((item) => item.id === accountId);
	}
	if (!account) throw new Error("Cloudflare 계정을 선택하지 못했습니다.");

	const zones = await listCloudflareZones(token, account.id);
	let domain = domainOption?.trim().toLowerCase();
	if (domain && !zones.some((zone) => zone.name === domain)) {
		throw new Error(
			`${domain} Zone을 선택한 Cloudflare 계정에서 찾지 못했습니다.`,
		);
	}
	if (!domain && interactive) {
		const route = answer(
			await prompts.select({
				message: "배포 주소 선택",
				options: [
					{
						value: "workers-dev",
						label: "workers.dev",
						hint: "도메인 없이 바로 배포",
					},
					...zones.map((zone) => ({
						value: `zone:${zone.name}`,
						label: zone.name,
						hint: "custom domain",
					})),
				],
			}),
		);
		if (route.startsWith("zone:")) domain = route.slice(5);
	}

	let subdomain = subdomainOption?.trim().toLowerCase();
	if (domain && !subdomain) {
		subdomain = interactive
			? answer(
					await prompts.text({
						message: `${domain} 앞에 사용할 prefix`,
						initialValue: projectName,
						validate: validateSubdomain,
					}),
				).trim()
			: projectName;
	}
	if (subdomain) {
		const error = validateSubdomain(subdomain);
		if (error) throw new Error(error);
	}
	return {
		accountId: account.id,
		accountName: account.name,
		token,
		...(domain ? { domain } : {}),
		...(subdomain ? { subdomain } : {}),
	};
}
