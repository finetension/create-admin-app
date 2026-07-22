import { describe, expect, it, vi } from "vitest";
import type { DoctorDependencies, PortInspection } from "./doctor.ts";
import { doctorHasIssues, formatDoctorReport, runDoctor } from "./doctor.ts";

const accountId = "a".repeat(32);

function commandResult(
	stdout = "",
	stderr = "",
	exitCode = 0,
): { stdout: string; stderr: string; exitCode: number } {
	return { stdout, stderr, exitCode };
}

function createDependencies(
	port: PortInspection = {
		port: 10_050,
		listeners: [],
		registryAvailable: true,
		registeredForProject: true,
		registryConflicts: [],
	},
): Partial<DoctorDependencies> {
	return {
		env: {
			CLOUDFLARE_API_TOKEN: "cloudflare-token",
		},
		nodeVersion: "22.13.0",
		loadConfig: vi.fn(async () => ({
			domain: "example.com",
			name: "Operations Hub",
			allowedEmails: ["admin@example.com"],
			serviceName: "operations-hub",
			routing: "custom-domain" as const,
			hostname: "operations-hub.example.com",
		})),
		readCompatibilityDate: vi.fn(async () => "2026-07-01"),
		inspectIdentity: vi.fn(async () => ({
			loggedIn: true,
			authType: "OAuth Token",
			tokenPermissions: ["zone:read", "workers_routes:write"],
			accounts: [{ id: accountId }],
		})),
		resolveAccountId: vi.fn(async () => accountId),
		inspectAccess: vi.fn(async () => ({
			available: true,
			organization: true,
			identityProvider: true,
			application: false,
			policy: false,
		})),
		inspectZone: vi.fn(async () => ({
			id: "zone-id",
			name: "example.com",
			status: "active" as const,
		})),
		resolveWorkersDevSubdomain: vi.fn(async () => "account-name"),
		inspectPort: vi.fn(async () => port),
		runCommand: vi.fn(async (command) =>
			command === "pnpm" ? commandResult("11.13.0") : commandResult(""),
		),
		runWrangler: vi.fn(async (args) => {
			if (args[0] === "--version") return commandResult("4.110.0");
			if (args[0] === "deployments") {
				return commandResult("", "Worker missing [code: 10007]", 1);
			}
			return commandResult("[]");
		}),
	};
}

describe("runDoctor", () => {
	it("verifies every deployment prerequisite without mutating resources", async () => {
		const report = await runDoctor({}, createDependencies());
		expect(report.checks).toHaveLength(11);
		expect(report.checks.every((item) => item.status === "pass")).toBe(true);
		expect(doctorHasIssues(report)).toBe(false);
	});

	it("reports missing credentials and a foreign port listener", async () => {
		const dependencies = createDependencies({
			port: 10_050,
			listeners: [{ pid: 1234, command: "node", cwd: "/tmp/another-project" }],
			registryAvailable: true,
			registeredForProject: false,
			registryConflicts: ["another (/tmp/another-project)"],
		});
		dependencies.env = {};
		const report = await runDoctor({}, dependencies);
		expect(report.checks.find((item) => item.id === "access")?.status).toBe(
			"fail",
		);
		expect(report.checks.find((item) => item.id === "identity")?.status).toBe(
			"warn",
		);
		expect(report.checks.find((item) => item.id === "port")?.status).toBe(
			"fail",
		);
		expect(doctorHasIssues(report)).toBe(true);
	});

	it("falls back to the main API token when the optional Access secret is empty", async () => {
		const dependencies = createDependencies();
		dependencies.env = {
			...dependencies.env,
			CLOUDFLARE_ACCESS_API_TOKEN: "",
		};

		const report = await runDoctor({}, dependencies);

		expect(report.checks.find((item) => item.id === "access")?.status).toBe(
			"pass",
		);
		expect(dependencies.inspectAccess).toHaveBeenCalledWith(
			expect.any(Object),
			"cloudflare-token",
		);
	});
});

describe("doctor report", () => {
	it("summarizes statuses and can make warnings strict", () => {
		const report = {
			checks: [
				{ id: "one", label: "One", status: "pass" as const, message: "ok" },
				{
					id: "two",
					label: "Two",
					status: "warn" as const,
					message: "check it",
				},
			],
		};
		const output = formatDoctorReport(report);
		expect(output).toContain("✓ PASS");
		expect(output).toContain("! WARN");
		expect(output).toContain("1 passed · 1 warnings · 0 failed");
		expect(doctorHasIssues(report)).toBe(false);
		expect(doctorHasIssues(report, true)).toBe(true);
	});
});
