import { describe, expect, it, vi } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";
import {
	type DeploymentStatusDependencies,
	deploymentStatusHasIssues,
	formatDeploymentStatus,
	inspectDeploymentStatus,
	summarizeRedirectLocation,
} from "./status.ts";

const config = {
	hostname: "operations-hub.example.com",
	bootstrapOwnerEmail: "founder@example.com",
} as unknown as DeploymentConfig;

function readyDependencies(): Partial<DeploymentStatusDependencies> {
	return {
		inspectWorker: vi.fn(async () => ({
			name: "operations-hub",
			deploymentId: "deployment-id",
			createdOn: "2026-07-16T00:00:00Z",
		})),
		inspectAccessManagementSecret: vi.fn(async () => true),
		inspectD1: vi.fn(async () => ({
			name: "operations-hub-db",
			id: "database-id",
		})),
		inspectAccess: vi.fn(async () => ({
			available: true,
			organization: true,
			identityProvider: true,
			groups: true,
			applications: true,
			policies: true,
			bootstrapOwner: true,
			uniqueMemberships: true,
			groupMemberCounts: { owner: 1, admin: 0, user: 0 },
			teamDomain: "paper.cloudflareaccess.com",
			applicationIds: { base: "app-id" },
		})),
		inspectEndpoint: vi.fn(async () => ({
			status: 302,
			location: "https://access",
		})),
		loadLifecycle: vi.fn(async () => ({
			schemaVersion: 1 as const,
			production: "deployed" as const,
		})),
	};
}

describe("deployment status", () => {
	it("redacts opaque Access challenge details from redirect locations", () => {
		expect(
			summarizeRedirectLocation(
				"https://paper.cloudflareaccess.com/cdn-cgi/access/login/operations.example.com?kid=secret-kid&meta=secret-meta&redirect_url=%2Fapi%2Fhealth#fragment",
			),
		).toBe(
			"https://paper.cloudflareaccess.com/cdn-cgi/access/login/[redacted]",
		);
		expect(
			summarizeRedirectLocation(
				"https://operations.example.com/sign-in?token=secret#fragment",
			),
		).toBe("https://operations.example.com/sign-in");
		expect(
			summarizeRedirectLocation(
				"/cdn-cgi/access/login/opaque?meta=secret-meta",
			),
		).toBe("/cdn-cgi/access/login/[redacted]");
		expect(summarizeRedirectLocation("not a valid redirect secret=value")).toBe(
			"[redacted-redirect]",
		);
	});

	it("returns stable item codes, hints, summary, and no drift when ready", async () => {
		const dependencies = readyDependencies();
		dependencies.inspectEndpoint = vi.fn(async () => ({
			status: 302,
			location:
				"https://paper.cloudflareaccess.com/cdn-cgi/access/login/operations-hub.example.com?kid=secret-kid&meta=secret-meta&redirect_url=%2Fapi%2Fhealth",
		}));
		const status = await inspectDeploymentStatus(config, dependencies);

		expect(status.summary).toEqual({ ok: 5, warning: 0, error: 0 });
		expect(status.drift).toEqual([]);
		expect(status.checks.map((result) => result.code)).toEqual([
			"worker_ready",
			"d1_ready",
			"access_ready",
			"route_access_protected",
			"lifecycle_deployed",
		]);
		expect(formatDeploymentStatus(config, status)).toContain(
			"OK [route_access_protected]",
		);
		expect(status.checks[3]?.details).toMatchObject({
			location:
				"https://paper.cloudflareaccess.com/cdn-cgi/access/login/[redacted]",
		});
		expect(JSON.stringify(status)).not.toContain("secret-kid");
		expect(JSON.stringify(status)).not.toContain("secret-meta");
		expect(JSON.stringify(status)).not.toContain("redirect_url");
		expect(deploymentStatusHasIssues(status)).toBe(false);
	});

	it("reports exact Access policy and lifecycle drift with actionable hints", async () => {
		const dependencies = readyDependencies();
		dependencies.inspectAccess = vi.fn(async () => ({
			available: true,
			organization: true,
			identityProvider: true,
			groups: true,
			applications: true,
			policies: false,
			bootstrapOwner: true,
			uniqueMemberships: true,
		}));
		dependencies.inspectEndpoint = vi.fn(async () => ({
			status: 200,
			location: "",
		}));
		dependencies.loadLifecycle = vi.fn(async () => ({
			schemaVersion: 1 as const,
			production: "predeploy" as const,
		}));

		const status = await inspectDeploymentStatus(config, dependencies);

		expect(status.drift).toEqual([
			"access_policy_drift",
			"route_unprotected",
			"lifecycle_predeploy_remote_exists",
		]);
		expect(status.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "access_policy_drift",
					status: "error",
					hint: expect.stringContaining("pnpm cli deploy"),
				}),
				expect.objectContaining({
					code: "lifecycle_predeploy_remote_exists",
					status: "warning",
				}),
			]),
		);
		expect(deploymentStatusHasIssues(status)).toBe(true);
	});

	it("keeps probe failures structured instead of throwing away other checks", async () => {
		const dependencies = readyDependencies();
		dependencies.inspectWorker = vi.fn(async () => {
			throw new Error("API unavailable");
		});

		const status = await inspectDeploymentStatus(config, dependencies);

		expect(status.checks[0]).toMatchObject({
			id: "worker",
			status: "error",
			code: "worker_probe_failed",
			hint: expect.any(String),
		});
		expect(status.summary.error).toBe(1);
	});

	it("reports a missing runtime Access management secret", async () => {
		const dependencies = readyDependencies();
		dependencies.inspectAccessManagementSecret = vi.fn(async () => false);

		const status = await inspectDeploymentStatus(config, dependencies);

		expect(status.checks[0]).toMatchObject({
			code: "worker_access_secret_missing",
			status: "error",
		});
	});

	it("treats an intentionally destroyed runtime with preserved D1 as healthy", async () => {
		const dependencies = readyDependencies();
		dependencies.inspectWorker = vi.fn(async () => null);
		dependencies.inspectAccess = vi.fn(async () => ({
			available: true,
			organization: true,
			identityProvider: true,
			groups: true,
			applications: false,
			policies: false,
			bootstrapOwner: true,
			uniqueMemberships: true,
		}));
		dependencies.inspectEndpoint = vi.fn(async () => ({
			status: 404,
			location: "",
		}));
		dependencies.loadLifecycle = vi.fn(async () => ({
			schemaVersion: 1 as const,
			production: "destroyed" as const,
		}));

		const status = await inspectDeploymentStatus(config, dependencies);

		expect(status.summary).toEqual({ ok: 5, warning: 0, error: 0 });
		expect(status.drift).toEqual([]);
		expect(status.checks.map((result) => result.code)).toEqual([
			"worker_destroyed",
			"d1_preserved_after_destroy",
			"access_destroyed",
			"route_released_after_destroy",
			"lifecycle_destroyed",
		]);
		expect(deploymentStatusHasIssues(status, true)).toBe(false);
	});

	it("also treats D1 deletion as a valid destroyed state", async () => {
		const dependencies = readyDependencies();
		dependencies.inspectWorker = vi.fn(async () => null);
		dependencies.inspectD1 = vi.fn(async () => null);
		dependencies.inspectAccess = vi.fn(async () => ({
			available: true,
			organization: true,
			identityProvider: true,
			groups: false,
			applications: false,
			policies: false,
			bootstrapOwner: false,
			uniqueMemberships: true,
		}));
		dependencies.inspectEndpoint = vi.fn(async () => {
			throw new Error("hostname no longer resolves");
		});
		dependencies.loadLifecycle = vi.fn(async () => ({
			schemaVersion: 1 as const,
			production: "destroyed" as const,
		}));

		const status = await inspectDeploymentStatus(config, dependencies);

		expect(status.summary).toEqual({ ok: 5, warning: 0, error: 0 });
		expect(status.checks.map((result) => result.code)).toContain(
			"d1_deleted_after_destroy",
		);
		expect(status.checks.map((result) => result.code)).toContain(
			"route_unreachable_after_destroy",
		);
	});

	it("reports runtime resources that remain after destroy as drift", async () => {
		const dependencies = readyDependencies();
		dependencies.loadLifecycle = vi.fn(async () => ({
			schemaVersion: 1 as const,
			production: "destroyed" as const,
		}));

		const status = await inspectDeploymentStatus(config, dependencies);

		expect(status.drift).toEqual([
			"worker_present_after_destroy",
			"access_present_after_destroy",
			"route_protected_after_destroy",
			"lifecycle_destroyed_resource_drift",
		]);
		expect(status.checks[3]?.details).toMatchObject({
			location: "https://access/",
		});
		expect(deploymentStatusHasIssues(status)).toBe(true);
	});
});
