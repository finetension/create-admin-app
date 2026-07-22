import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createInitConfig,
	parseAllowedEmails,
	toPersistedUserConfig,
	writeInitConfig,
} from "./init.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
	);
});

describe("project init", () => {
	it("parses comma and newline separated email addresses", () => {
		expect(
			parseAllowedEmails(
				"Founder@Example.com, teammate@example.com\noperator@example.com",
			),
		).toEqual([
			"Founder@Example.com",
			"teammate@example.com",
			"operator@example.com",
		]);
	});

	it("normalizes input and persists only user-controlled fields", () => {
		const config = createInitConfig({
			name: "  Operations   Hub ",
			domain: " EXAMPLE.COM ",
			emails: " Admin@Example.com, admin@example.com ",
		});

		expect(toPersistedUserConfig(config)).toEqual({
			domain: "example.com",
			name: "Operations Hub",
			allowedEmails: ["admin@example.com"],
		});
		expect(config.serviceName).toBe("operations-hub");
	});

	it("persists workers.dev routing without account-specific state", () => {
		const config = createInitConfig({
			name: "Operations Hub",
			emails: "admin@example.com",
		});

		expect(toPersistedUserConfig(config)).toEqual({
			name: "Operations Hub",
			allowedEmails: ["admin@example.com"],
		});
		expect(config.routing).toBe("workers-dev");
	});

	it("protects existing config unless force is enabled", async () => {
		const directory = await mkdtemp(resolve(tmpdir(), "management-init-"));
		temporaryDirectories.push(directory);
		const path = resolve(directory, "nested/deploy.config.json");
		const first = createInitConfig({
			name: "First System",
			domain: "example.com",
			emails: "first@example.com",
		});
		const second = createInitConfig({
			name: "Second System",
			domain: "example.com",
			emails: "second@example.com",
		});

		await writeInitConfig(path, first);
		await expect(writeInitConfig(path, second)).rejects.toThrow("--force");
		await writeInitConfig(path, second, true);

		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
			domain: "example.com",
			name: "Second System",
			allowedEmails: ["second@example.com"],
		});
	});
});
