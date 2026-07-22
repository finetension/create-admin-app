import type { CreateContext } from "../core/context.js";
import {
	copyTemplate,
	customizeTemplate,
	ensureDestination,
} from "../template/files.js";

export async function scaffoldProject(context: CreateContext): Promise<void> {
	const { destination, displayName, packageName } = context.project;
	await ensureDestination(destination);
	await copyTemplate(destination);
	await customizeTemplate(destination, packageName, displayName);
}
