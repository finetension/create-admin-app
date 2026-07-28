import { describe, expect, it } from "vitest";
import {
	assertSafeCommitPaths,
	classifyRemoteMain,
	isWorkflowIndexingDelay,
	localDeployPreflightArgs,
	normalizeGitHubRemote,
	parseGitStatusFiles,
} from "./local-deploy.ts";

describe("local deploy target discovery", () => {
	it("keeps only the pre-push secret scan in the local preflight", () => {
		expect(localDeployPreflightArgs).toEqual(["run", "secretlint"]);
	});

	it("uses existing HTTPS and SSH GitHub origins as established targets", () => {
		expect(
			normalizeGitHubRemote("https://github.com/finetension/my-company.git"),
		).toBe("finetension/my-company");
		expect(
			normalizeGitHubRemote("git@github.com:finetension/my-company.git"),
		).toBe("finetension/my-company");
	});

	it("does not infer a target from a non-GitHub remote", () => {
		expect(
			normalizeGitHubRemote("https://gitlab.com/example/project.git"),
		).toBe(undefined);
	});

	it("refuses sensitive filenames before the automatic commit", () => {
		expect(() =>
			assertSafeCommitPaths(["src/index.ts", ".env.production"]),
		).toThrow("민감 파일");
		expect(() =>
			assertSafeCommitPaths(["certificates/production.pem"]),
		).toThrow("민감 파일");
		expect(() =>
			assertSafeCommitPaths(["src/cli/core/credentials.ts"]),
		).not.toThrow();
	});

	it("preserves the first path character and both sides of a rename", () => {
		expect(
			parseGitStatusFiles(
				" M docs/handbook.md\0?? .env.production\0R  safe.txt\0old.txt\0",
			),
		).toEqual(["docs/handbook.md", ".env.production", "safe.txt", "old.txt"]);
		expect(() =>
			assertSafeCommitPaths(parseGitStatusFiles(" M .env.production\0")),
		).toThrow("민감 파일");
	});

	it("retries only the transient new-workflow indexing response", () => {
		expect(
			isWorkflowIndexingDelay(
				new Error(
					"HTTP 404: workflow application-deploy.yml not found on the default branch",
				),
			),
		).toBe(true);
		expect(
			isWorkflowIndexingDelay(new Error("HTTP 401: Bad credentials")),
		).toBe(false);
	});

	it("fast-forwards a completed remote lifecycle transition before redeploying", () => {
		expect(classifyRemoteMain("local", undefined, false, false)).toBe("push");
		expect(classifyRemoteMain("same", "same", false, false)).toBe("dispatch");
		expect(classifyRemoteMain("local", "remote", true, false)).toBe(
			"fast-forward",
		);
		expect(classifyRemoteMain("local", "remote", false, true)).toBe("push");
		expect(classifyRemoteMain("local", "remote", false, false)).toBe(
			"diverged",
		);
	});
});
