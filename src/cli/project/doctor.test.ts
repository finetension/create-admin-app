import { describe, expect, it, vi } from "vitest";
import type { DoctorDependencies } from "./doctor.ts";
import { doctorHasIssues, runDoctor } from "./doctor.ts";

function result(stdout = "", exitCode = 0, stderr = "") {
	return { stdout, stderr, exitCode };
}

function dependencies(): Partial<DoctorDependencies> {
	return {
		nodeVersion: "24.1.0",
		nodeModulesExists: true,
		loadConfig: vi.fn(async () => ({
			project: {
				name: "My Company",
				slug: "my-company",
				allowed_emails: ["owner@example.com"],
			},
		})),
		loadLifecycle: vi.fn(async () => ({
			schemaVersion: 1 as const,
			production: "predeploy" as const,
		})),
		run: vi.fn(async (command, args) => {
			if (command === "pnpm") return result("11.15.1");
			if (command === "git" && args[0] === "--version") {
				return result("git version 2.51.0");
			}
			if (command === "gh" && args[0] === "--version") {
				return result("gh version 2.80.0");
			}
			if (args[0] === "branch") return result("main");
			if (args[0] === "status") return result("");
			if (args[0] === "remote") return result("", 1);
			return result("");
		}),
	};
}

describe("doctor", () => {
	it("treats missing remote credentials as healthy before connection", async () => {
		const report = await runDoctor({}, dependencies());
		expect(report.summary.error).toBe(0);
		expect(report.checks).toContainEqual(
			expect.objectContaining({ code: "github_not_connected", status: "ok" }),
		);
		expect(report.checks).toContainEqual(
			expect.objectContaining({
				code: "cloudflare_not_connected",
				status: "ok",
			}),
		);
		expect(doctorHasIssues(report)).toBe(false);
	});

	it("reports strict config errors without mutating anything", async () => {
		const overrides = dependencies();
		overrides.loadConfig = vi.fn(async () => {
			throw new Error("unknown key workspace_id");
		});
		const report = await runDoctor({}, overrides);
		expect(report.checks).toContainEqual(
			expect.objectContaining({ code: "invalid_config", status: "error" }),
		);
		expect(doctorHasIssues(report)).toBe(true);
	});
});
