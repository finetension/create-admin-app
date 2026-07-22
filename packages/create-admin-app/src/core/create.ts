import { configureProject } from "../phases/configure.js";
import { connectProject } from "../phases/connect.js";
import { finalizeProject } from "../phases/finalize.js";
import { scaffoldProject } from "../phases/scaffold.js";
import type { CreateContext, CreatePhases } from "./context.js";

export const defaultCreatePhases: CreatePhases = {
	scaffold: scaffoldProject,
	configure: configureProject,
	connect: connectProject,
	finalize: finalizeProject,
};

export async function createProject(
	context: CreateContext,
	phases: CreatePhases = defaultCreatePhases,
): Promise<void> {
	await phases.scaffold(context);
	await phases.configure(context);
	await phases.connect(context);
	await phases.finalize(context);
}
