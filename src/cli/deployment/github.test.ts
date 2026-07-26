import { describe, expect, it } from "vitest";
import {
	githubRemoteUrl,
	selectWorkflowRun,
	summarizeWorkflowFailure,
} from "./github.ts";

describe("GitHub workflow failure reporting", () => {
	it("uses the GitHub CLI transport preference for repository remotes", () => {
		expect(githubRemoteUrl("finetension/example", "ssh")).toBe(
			"git@github.com:finetension/example.git",
		);
		expect(githubRemoteUrl("finetension/example", "https")).toBe(
			"https://github.com/finetension/example.git",
		);
	});

	it("ignores an older run for the same clean commit", () => {
		const oldRun = {
			databaseId: 1,
			status: "completed",
			conclusion: "success",
			url: "https://github.com/example/actions/runs/1",
			headSha: "same-sha",
		};
		const newRun = {
			...oldRun,
			databaseId: 2,
			status: "queued",
			conclusion: null,
			url: "https://github.com/example/actions/runs/2",
		};

		expect(
			selectWorkflowRun([newRun, oldRun], "same-sha", new Set([1])),
		).toEqual(newRun);
		expect(selectWorkflowRun([oldRun], "same-sha", new Set([1]))).toBeNull();
	});

	it("identifies the failed job, step, and run URL", () => {
		expect(
			summarizeWorkflowFailure({
				url: "https://github.com/finetension/example/actions/runs/42",
				conclusion: "failure",
				jobs: [
					{
						name: "deploy",
						conclusion: "failure",
						steps: [
							{ name: "Install", conclusion: "success" },
							{ name: "Application Deploy", conclusion: "failure" },
						],
					},
				],
			}),
		).toEqual({
			actions_url: "https://github.com/finetension/example/actions/runs/42",
			conclusion: "failure",
			failed_job: "deploy",
			failed_step: "Application Deploy",
		});
	});
});
