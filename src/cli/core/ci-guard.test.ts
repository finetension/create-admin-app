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
			assertGitHubActionsCapability("remote database mutation", {
				CI: "true",
				GITHUB_ACTIONS: "true",
			}),
		).toThrow("PLATFORM_ALLOW_REMOTE_DB_MUTATION");
	});

	it("accepts the exact protected workflow context", () => {
		expect(() =>
			assertGitHubActionsCapability("deploy", {
				CI: "true",
				GITHUB_ACTIONS: "true",
				PLATFORM_ALLOW_DEPLOY: "1",
			}),
		).not.toThrow();
	});

	it("keeps infrastructure destruction behind its own capability", () => {
		expect(() =>
			assertGitHubActionsCapability("infrastructure destruction", {
				CI: "true",
				GITHUB_ACTIONS: "true",
				PLATFORM_ALLOW_REMOTE_DB_MUTATION: "1",
			}),
		).toThrow("PLATFORM_ALLOW_DESTROY");

		expect(() =>
			assertGitHubActionsCapability("infrastructure destruction", {
				CI: "true",
				GITHUB_ACTIONS: "true",
				PLATFORM_ALLOW_DESTROY: "1",
			}),
		).not.toThrow();
	});
});
