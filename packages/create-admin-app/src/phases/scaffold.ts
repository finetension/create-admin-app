import type { CreateContext } from "../core/context.js";
import {
	copyTemplate,
	customizeTemplate,
	writeGeneratedConfig,
} from "../template/files.js";

export async function scaffoldProject(context: CreateContext): Promise<void> {
	const { staging, displayName, packageName, allowedEmails } = context.project;
	await copyTemplate(staging);
	await customizeTemplate(staging, packageName, displayName);
	await writeGeneratedConfig(staging, {
		name: displayName,
		slug: packageName,
		allowedEmails,
		isPublic: context.args.public,
	});
}
