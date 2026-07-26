import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("create arguments", () => {
	it("parses complete machine-mode local generation", () => {
		expect(
			parseArgs([
				"my-admin",
				"--json",
				"--emails",
				"admin@example.com",
				"--skip-install",
			]),
		).toMatchObject({
			directory: "my-admin",
			json: true,
			emails: "admin@example.com",
			skipInstall: true,
			public: false,
		});
	});

	it("accepts pnpm create's leading option separator", () => {
		expect(
			parseArgs([
				"--",
				"my-admin",
				"--json",
				"--emails",
				"admin@example.com",
				"--skip-install",
			]),
		).toMatchObject({
			directory: "my-admin",
			json: true,
			emails: "admin@example.com",
			skipInstall: true,
		});
	});

	it("persists public visibility without blocking deploy", () => {
		expect(
			parseArgs([
				"app",
				"--public",
				"--deploy",
				"--yes",
				"--message",
				"feat: deploy app",
				"--json",
			]),
		).toMatchObject({ public: true, deploy: true });
	});

	it("requires deploy approval and message in JSON mode", () => {
		expect(() =>
			parseArgs(["app", "--deploy", "--json", "--emails", "a@example.com"]),
		).toThrow("--yes");
	});

	it("rejects unknown options and extra positional arguments", () => {
		expect(() => parseArgs(["app", "--unknown"])).toThrow("알 수 없는 옵션");
		expect(() => parseArgs(["app", "another-app"])).toThrow(
			"디렉터리는 하나만",
		);
	});

	it("does not deploy an uninstalled project", () => {
		expect(() =>
			parseArgs([
				"app",
				"--deploy",
				"--skip-install",
				"--yes",
				"--message",
				"feat: deploy app",
				"--json",
			]),
		).toThrow("--skip-install");
	});
});
