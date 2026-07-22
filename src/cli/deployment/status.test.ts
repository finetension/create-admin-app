import { describe, expect, it } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";
import { type DeploymentStatus, formatDeploymentStatus } from "./status.ts";

const config = {
	hostname: "operations-hub.example.com",
} as DeploymentConfig;

describe("formatDeploymentStatus", () => {
	it("renders ready resources and an Access-protected endpoint", () => {
		const status: DeploymentStatus = {
			worker: {
				value: {
					name: "operations-hub",
					deploymentId: "deployment-id",
					createdOn: "2026-07-16T00:00:00Z",
				},
			},
			d1: { value: { name: "operations-hub-db", id: "database-id" } },
			access: {
				value: {
					available: true,
					organization: true,
					identityProvider: true,
					application: true,
					policy: true,
					teamDomain: "paper.cloudflareaccess.com",
				},
			},
			endpoint: { value: { status: 302, location: "https://access" } },
		};

		const output = formatDeploymentStatus(config, status);
		expect(output).toContain("Worker: ready · operations-hub");
		expect(output).toContain("D1:     ready · operations-hub-db");
		expect(output).toContain("Access: ready · paper.cloudflareaccess.com");
		expect(output).toContain("Access protected · HTTP 302");
	});

	it("distinguishes missing, unavailable, and failed checks", () => {
		const status: DeploymentStatus = {
			worker: { value: null },
			d1: { value: null },
			access: {
				value: {
					available: false,
					organization: false,
					identityProvider: false,
					application: false,
					policy: false,
				},
			},
			endpoint: { value: { status: 200, location: "" } },
		};

		const output = formatDeploymentStatus(config, status);
		expect(output).toContain("Worker: missing");
		expect(output).toContain("D1:     missing");
		expect(output).toContain("Access API token required");
		expect(output).toContain("reachable but unprotected · HTTP 200");
	});
});
