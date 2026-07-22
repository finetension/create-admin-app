import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productionWorkflows = ["deploy.yml", "operations.yml", "maintenance.yml"];

describe("production workflow visibility", () => {
	for (const workflow of productionWorkflows) {
		it(`${workflow} only runs for private repositories`, () => {
			const source = readFileSync(
				resolve(process.cwd(), ".github/workflows", workflow),
				"utf8",
			);
			expect(source).toContain("    if: github.event.repository.private\n");
		});
	}
});
