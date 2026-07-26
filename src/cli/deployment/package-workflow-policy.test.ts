import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function workflow(name: string): string {
	return readFileSync(
		resolve(process.cwd(), ".github/workflows", name),
		"utf8",
	);
}

describe("canonical package workflow policy", () => {
	it("smoke-tests the exact public package after publishing", () => {
		const source = workflow("package-publish.yml");
		expect(source).toContain("registry-smoke:");
		expect(source).toContain("needs: publish");
		expect(source).toContain(
			'create "@finetension/admin-app@$RELEASE_VERSION"',
		);
		expect(source).toContain("pnpm check");
		expect(source).toContain("minimum-release-age-exclude");
	});
});
