import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AccessResult } from "../cloudflare/access.ts";
import type { D1Resource } from "../cloudflare/resources.ts";
import type { DeploymentConfig } from "../core/config.ts";
import { projectPaths } from "../core/paths.ts";
import { createDeploymentWranglerConfig } from "./wrangler-config.ts";

describe("deployment Wrangler config", () => {
	it("resolves source, schema, and migrations from the transient runtime path", () => {
		const generated = createDeploymentWranglerConfig(
			{
				workerName: "management",
				accountId: "a".repeat(32),
				compatibilityDate: "2026-07-17",
				hostname: "management.example.com",
				name: "Management",
				bootstrapOwnerEmail: "admin@example.com",
				routing: "custom-domain",
			} as DeploymentConfig,
			{
				teamDomain: "team.cloudflareaccess.com",
				audiences: {
					base: "base-audience",
					admin: "admin-audience",
					owner: "owner-audience",
				},
				applicationIds: {
					base: "base-application",
					admin: "admin-application",
					owner: "owner-application",
					public: "public-application",
				},
				groupIds: {
					owner: "owner-group",
					admin: "admin-group",
					member: "member-group",
				},
			} satisfies AccessResult,
			{ name: "management-db", id: "database" } satisfies D1Resource,
		);
		const configDirectory = dirname(projectPaths.deploymentWranglerConfig);

		expect(resolve(configDirectory, generated.$schema)).toBe(
			resolve(projectPaths.root, "node_modules/wrangler/config-schema.json"),
		);
		expect(resolve(configDirectory, generated.main)).toBe(
			resolve(projectPaths.root, "src/worker/index.ts"),
		);
		expect(
			resolve(configDirectory, generated.d1_databases[0].migrations_dir),
		).toBe(resolve(projectPaths.root, "db/migrations"));
		expect(generated.vars).toEqual({
			ENVIRONMENT: "production",
			APP_NAME: "Management",
			ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
			ACCESS_AUD_BASE: "base-audience",
			ACCESS_AUD_ADMIN: "admin-audience",
			ACCESS_AUD_OWNER: "owner-audience",
			ACCESS_ACCOUNT_ID: "a".repeat(32),
			ACCESS_GROUP_OWNER_ID: "owner-group",
			ACCESS_GROUP_ADMIN_ID: "admin-group",
			ACCESS_GROUP_MEMBER_ID: "member-group",
			ACCESS_BOOTSTRAP_OWNER_EMAIL: "admin@example.com",
		});
		expect("DEV_ACCESS_ROLE" in generated.vars).toBe(false);
		expect("DEV_ACCESS_PUBLIC" in generated.vars).toBe(false);
	});

	it("enables workers.dev without creating a custom-domain route", () => {
		const generated = createDeploymentWranglerConfig(
			{
				workerName: "management",
				accountId: "a".repeat(32),
				compatibilityDate: "2026-07-17",
				hostname: "management.account-name.workers.dev",
				name: "Management",
				bootstrapOwnerEmail: "admin@example.com",
				routing: "workers-dev",
			} as DeploymentConfig,
			{
				teamDomain: "team.cloudflareaccess.com",
				audiences: {
					base: "base-audience",
					admin: "admin-audience",
					owner: "owner-audience",
				},
				applicationIds: {
					base: "base-application",
					admin: "admin-application",
					owner: "owner-application",
					public: "public-application",
				},
				groupIds: {
					owner: "owner-group",
					admin: "admin-group",
					member: "member-group",
				},
			} satisfies AccessResult,
			{ name: "management-db", id: "database" } satisfies D1Resource,
		);

		expect(generated.workers_dev).toBe(true);
		expect("routes" in generated).toBe(false);
	});
});
