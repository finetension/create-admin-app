import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	assertCloudflareAccountMayChange,
	loadProjectConfig,
	parseProjectConfig,
	writeProjectConfig,
} from "./config.ts";

describe("project config", () => {
	it("parses the project-only generated form", () => {
		expect(
			parseProjectConfig({
				project: {
					name: "My Company",
					slug: "my-company",
				},
				access: { bootstrap_owner_email: "OWNER@example.com" },
			}),
		).toEqual({
			project: {
				name: "My Company",
				slug: "my-company",
			},
			access: { bootstrap_owner_email: "owner@example.com" },
		});
	});

	it("rejects unknown keys instead of silently dropping them", () => {
		expect(() =>
			parseProjectConfig({
				project: {
					name: "My Company",
					slug: "my-company",
					workspace_id: "unexpected",
				},
				access: { bootstrap_owner_email: "owner@example.com" },
			}),
		).toThrow(/workspace_id/);
	});

	it("validates GitHub targets before they reach gh", () => {
		expect(() =>
			parseProjectConfig({
				project: {
					name: "My Company",
					slug: "my-company",
				},
				access: { bootstrap_owner_email: "owner@example.com" },
				github: {
					owner: "valid-owner",
					repository: "invalid/repository",
				},
			}),
		).toThrow("repository");
	});

	it("rejects changing the Cloudflare account after production deploy", () => {
		expect(() =>
			assertCloudflareAccountMayChange(
				"a".repeat(32),
				"b".repeat(32),
				"deployed",
			),
		).toThrow("변경할 수 없습니다");
		expect(() =>
			assertCloudflareAccountMayChange(
				"a".repeat(32),
				"a".repeat(32),
				"deployed",
			),
		).not.toThrow();
		expect(() =>
			assertCloudflareAccountMayChange(
				"a".repeat(32),
				"b".repeat(32),
				"destroyed",
			),
		).toThrow("변경할 수 없습니다");
		expect(() =>
			assertCloudflareAccountMayChange(
				"a".repeat(32),
				"b".repeat(32),
				"predeploy",
			),
		).not.toThrow();
	});

	it("writes canonical TOML atomically and reads it back", async () => {
		const directory = await mkdtemp(resolve(tmpdir(), "admin-config-"));
		const path = resolve(directory, "config.toml");
		await writeProjectConfig(
			{
				project: {
					name: "My Company",
					slug: "my-company",
				},
				access: { bootstrap_owner_email: "owner@example.com" },
				github: { visibility: "public" },
			},
			path,
		);

		expect(await loadProjectConfig(path)).toMatchObject({
			project: { slug: "my-company" },
			github: { visibility: "public" },
		});
		expect(await readFile(path, "utf8")).toContain("[project]");
		expect(await readFile(path, "utf8")).toContain("[access]");
	});
});
