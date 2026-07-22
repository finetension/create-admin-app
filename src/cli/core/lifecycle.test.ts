import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	loadInfrastructureLifecycle,
	markProductionDeployed,
	parseInfrastructureLifecycle,
} from "./lifecycle.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

async function createLifecycleFile(production: "predeploy" | "deployed") {
	const directory = await mkdtemp(resolve(tmpdir(), "infra-lifecycle-"));
	temporaryDirectories.push(directory);
	const path = resolve(directory, "lifecycle.json");
	await writeFile(
		path,
		`${JSON.stringify({ schemaVersion: 1, production }, null, 2)}\n`,
	);
	return path;
}

describe("infrastructure lifecycle", () => {
	it("rejects unknown state so development cannot silently pick a database", () => {
		expect(() =>
			parseInfrastructureLifecycle(
				{ schemaVersion: 1, production: "unknown" },
				"infra/lifecycle.json",
			),
		).toThrow("인프라 생명주기");
	});

	it("marks the first successful production deployment exactly once", async () => {
		const path = await createLifecycleFile("predeploy");
		await expect(markProductionDeployed(path)).resolves.toBe(true);
		await expect(loadInfrastructureLifecycle(path)).resolves.toEqual({
			schemaVersion: 1,
			production: "deployed",
		});
		await expect(markProductionDeployed(path)).resolves.toBe(false);
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
			schemaVersion: 1,
			production: "deployed",
		});
		expect(await readFile(path, "utf8")).toBe(
			'{\n\t"schemaVersion": 1,\n\t"production": "deployed"\n}\n',
		);
	});
});
