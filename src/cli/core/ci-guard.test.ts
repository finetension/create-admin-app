import { describe, expect, it } from "vitest";
import { assertGitHubActionsCapability } from "./ci-guard.ts";

describe("GitHub Actions capability guard", () => {
	it("rejects a local shell even when the capability variable is copied", () => {
		expect(() =>
			assertGitHubActionsCapability("deploy", {
				PLATFORM_ALLOW_DEPLOY: "1",
			}),
		).toThrow("GitHub Actions");
	});

	it("requires the explicit capability in GitHub Actions", () => {
		expect(() =>
			assertGitHubActionsCapability("deploy", {
				GITHUB_ACTIONS: "true",
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
			}),
		).toThrow("PLATFORM_ALLOW_DEPLOY");
	});

	it("accepts the exact protected workflow context", () => {
		expect(() =>
			assertGitHubActionsCapability("deploy", {
				GITHUB_ACTIONS: "true",
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "workflow_dispatch",
				PLATFORM_ALLOW_DEPLOY: "1",
			}),
		).not.toThrow();
	});

	it("keeps infrastructure destruction behind its own capability", () => {
		expect(() =>
			assertGitHubActionsCapability("destroy", {
				GITHUB_ACTIONS: "true",
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "workflow_dispatch",
				PLATFORM_ALLOW_DEPLOY: "1",
			}),
		).toThrow("PLATFORM_ALLOW_DESTROY");

		expect(() =>
			assertGitHubActionsCapability("destroy", {
				GITHUB_ACTIONS: "true",
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "workflow_dispatch",
				PLATFORM_ALLOW_DESTROY: "1",
			}),
		).not.toThrow();
	});
});
