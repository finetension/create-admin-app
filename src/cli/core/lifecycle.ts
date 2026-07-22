import { z } from "zod";
import { readJsonc, writeJson } from "./json.ts";
import { projectPaths } from "./paths.ts";

const infrastructureLifecycleSchema = z.strictObject({
	schemaVersion: z.literal(1),
	production: z.enum(["predeploy", "deployed"]),
});

export type InfrastructureLifecycle = z.infer<
	typeof infrastructureLifecycleSchema
>;

export function parseInfrastructureLifecycle(
	input: unknown,
	label: string,
): InfrastructureLifecycle {
	const result = infrastructureLifecycleSchema.safeParse(input);
	if (!result.success) {
		throw new Error(
			`${label} 인프라 생명주기가 올바르지 않습니다.\n${z.prettifyError(result.error)}`,
		);
	}
	return result.data;
}

export async function loadInfrastructureLifecycle(
	path = projectPaths.infrastructureLifecycle,
): Promise<InfrastructureLifecycle> {
	return parseInfrastructureLifecycle(await readJsonc(path), path);
}

export async function markProductionDeployed(
	path = projectPaths.infrastructureLifecycle,
): Promise<boolean> {
	const lifecycle = await loadInfrastructureLifecycle(path);
	if (lifecycle.production === "deployed") return false;
	await writeJson(path, { ...lifecycle, production: "deployed" });
	return true;
}
