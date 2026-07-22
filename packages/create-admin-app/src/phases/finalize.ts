import * as prompts from "@clack/prompts";
import type { CreateContext } from "../core/context.js";

export async function finalizeProject(context: CreateContext): Promise<void> {
	const next = [`cd ${context.project.directoryInput}`];
	if (context.args.skipInstall) next.push("pnpm install");
	next.push("pnpm dev");
	prompts.note(
		[
			...next,
			context.cloudflare
				? `Cloudflare: ${context.cloudflare.accountName} · ${context.cloudflare.domain ? `${context.cloudflare.subdomain}.${context.cloudflare.domain}` : "workers.dev"}`
				: "Cloudflare: 나중에 연결",
			context.repository
				? `GitHub: ${context.repository}`
				: "GitHub: local only",
		].join("\n"),
		"Next",
	);
}
