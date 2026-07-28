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
	it("validates pull requests without duplicating main push validation", () => {
		const source = workflow("application-ci.yml");
		expect(source).toContain("pull_request:");
		expect(source).not.toContain("push:");
		expect(source).toContain("pnpm run application:check");
	});

	it("deploys private or public generated repositories from main", () => {
		const source = workflow("application-deploy.yml");
		expect(source).toContain("push:");
		expect(source).toContain("workflow_dispatch:");
		expect(source).not.toContain("repository.private");
		expect(source).not.toContain("environment: production");
		expect(source.match(/runs-on: ubuntu-latest/g)).toHaveLength(1);
		expect(source).toContain("run: pnpm check");
		expect(source).not.toContain("needs: validate");
		expect(source).toContain(
			"node ./dist/cli/index.mjs internal deploy --json",
		);
		expect(source).toContain("secrets.CLOUDFLARE_API_TOKEN");
		expect(source).toContain("finetension/create-admin-app");

		const check = source.indexOf("run: pnpm check");
		const secret = source.indexOf("CLOUDFLARE_API_TOKEN:");
		const deploy = source.indexOf(
			"run: node ./dist/cli/index.mjs internal deploy --json",
		);
		expect(check).toBeGreaterThan(-1);
		expect(secret).toBeGreaterThan(check);
		expect(deploy).toBeGreaterThan(secret);
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
