import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function workflow(name: string): string {
	return readFileSync(
		resolve(process.cwd(), ".github/workflows", name),
		"utf8",
	);
}

describe("production workflow policy", () => {
	it("deploys private or public generated repositories from main", () => {
		const source = workflow("application-deploy.yml");
		expect(source).toContain("push:");
		expect(source).toContain("workflow_dispatch:");
		expect(source).not.toContain("repository.private");
		expect(source).not.toContain("environment: production");
		expect(source).toContain("validate:");
		expect(source).toContain("run: pnpm check");
		expect(source).toContain("needs: validate");
		expect(source).toContain("pnpm cli internal deploy --json");
		expect(source).toContain("secrets.CLOUDFLARE_API_TOKEN");
		expect(source).toContain("finetension/create-admin-app");
	});

	it("keeps application destroy narrow and omits backup or restore", () => {
		const source = workflow("application-destroy.yml");
		expect(source).toContain("pnpm cli");
		expect(source).toContain("internal destroy");
		expect(source).not.toContain("restore");
		expect(source).not.toContain("artifact");
		expect(source).not.toContain("repository.private");
		expect(source).toContain("contents: write");
		expect(source).toContain("mark production destroyed");
	});

	it("does not provide an Actions log or export workflow", () => {
		expect(() => workflow("operations.yml")).toThrow();
	});
});
