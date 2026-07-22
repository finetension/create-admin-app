import { describe, expect, it, vi } from "vitest";
import type { DeploymentConfig } from "../core/config.ts";
import {
	type DestroyInspection,
	destroyDeployment,
	formatDestroyPlan,
} from "./destroy.ts";

const config = {
	serviceName: "operations-hub",
	hostname: "operations-hub.example.com",
} as DeploymentConfig;

const inspection: DestroyInspection = {
	worker: {
		name: "operations-hub",
		deploymentId: "deployment-id",
		createdOn: "2026-07-16T00:00:00Z",
	},
	d1: { name: "operations-hub-db", id: "database-id" },
	access: {
		available: true,
		organization: true,
		identityProvider: true,
		application: true,
		policy: true,
		appId: "access-app-id",
	},
};

function createDependencies() {
	return {
		inspect: vi.fn(async () => inspection),
		deleteAccess: vi.fn(async () => {}),
		deleteWorker: vi.fn(async () => {}),
		deleteD1: vi.fn(async () => {}),
	};
}

describe("destroyDeployment", () => {
	it("is a dry run unless the service name is confirmed", async () => {
		const dependencies = createDependencies();
		await destroyDeployment(config, {}, dependencies);
		expect(dependencies.deleteAccess).not.toHaveBeenCalled();
		expect(dependencies.deleteWorker).not.toHaveBeenCalled();
		expect(dependencies.deleteD1).not.toHaveBeenCalled();
	});

	it("keeps D1 by default", async () => {
		const dependencies = createDependencies();
		await destroyDeployment(
			config,
			{ confirm: "operations-hub" },
			dependencies,
		);
		expect(dependencies.deleteAccess).toHaveBeenCalledOnce();
		expect(dependencies.deleteWorker).toHaveBeenCalledOnce();
		expect(dependencies.deleteD1).not.toHaveBeenCalled();
	});

	it("deletes D1 only with include-data", async () => {
		const dependencies = createDependencies();
		await destroyDeployment(
			config,
			{ confirm: "operations-hub", includeData: true },
			dependencies,
		);
		expect(dependencies.deleteD1).toHaveBeenCalledOnce();
	});

	it("requires an exact confirmation", async () => {
		const dependencies = createDependencies();
		await expect(
			destroyDeployment(config, { confirm: "wrong-name" }, dependencies),
		).rejects.toThrow("정확히 입력");
		expect(dependencies.deleteWorker).not.toHaveBeenCalled();
	});

	it("formats the retained data plan", () => {
		const plan = formatDestroyPlan(config, inspection, false);
		expect(plan).toContain("Worker: delete · operations-hub");
		expect(plan).toContain("D1:     keep · operations-hub-db");
		expect(plan).not.toContain("R2");
	});
});
