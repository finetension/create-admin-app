import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertDestinationAvailable,
	copyTemplate,
	customizeTemplate,
	writeGeneratedConfig,
} from "./files.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(resolve(tmpdir(), "create-admin-files-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("template files", () => {
	it("accepts missing or empty targets and rejects non-empty targets", async () => {
		const root = await temporaryDirectory();
		await expect(
			assertDestinationAvailable(resolve(root, "missing")),
		).resolves.toBeUndefined();
		const destination = resolve(root, "generated");
		await mkdir(destination);
		await expect(
			assertDestinationAvailable(destination),
		).resolves.toBeUndefined();
		await writeFile(resolve(destination, "existing.txt"), "existing");
		await expect(assertDestinationAvailable(destination)).rejects.toThrow(
			"비어 있지",
		);
	});

	it("writes project-only canonical TOML with optional public visibility", async () => {
		const destination = await temporaryDirectory();
		await writeGeneratedConfig(destination, {
			name: "Company Admin",
			slug: "company-admin",
			allowedEmails: ["owner@example.com"],
			isPublic: true,
		});
		const config = await readFile(resolve(destination, "config.toml"), "utf8");
		expect(config).toContain("[project]");
		expect(config).toContain('slug = "company-admin"');
		expect(config).toContain("[github]");
		expect(config).toContain('visibility = "public"');
	});

	it("customizes package metadata and generated README", async () => {
		const destination = await temporaryDirectory();
		await mkdir(resolve(destination, "docs/specs"), { recursive: true });
		await writeFile(
			resolve(destination, "package.json"),
			`${JSON.stringify({ name: "template", private: false })}\n`,
		);
		await writeFile(
			resolve(destination, "README.md"),
			"# {{PROJECT_NAME}}\n\nRun {{PROJECT_SLUG}}.\n",
		);
		await writeFile(
			resolve(destination, "docs/specs/product-requirements.md"),
			"# {{PROJECT_NAME}}\n\nSlug: {{PROJECT_SLUG}}\n",
		);
		await customizeTemplate(destination, "company-admin", "Company Admin");
		const packageJson = JSON.parse(
			await readFile(resolve(destination, "package.json"), "utf8"),
		);
		expect(packageJson).toMatchObject({ name: "company-admin", private: true });
		await expect(
			readFile(resolve(destination, "README.md"), "utf8"),
		).resolves.toContain("# Company Admin");
		await expect(
			readFile(
				resolve(destination, "docs/specs/product-requirements.md"),
				"utf8",
			),
		).resolves.toContain("Slug: company-admin");
	});

	it("guides coding agents to the non-interactive deployment path", async () => {
		const root = await temporaryDirectory();
		const destination = resolve(root, "generated");
		await copyTemplate(destination);

		const readme = await readFile(resolve(destination, "README.md"), "utf8");
		const agents = await readFile(resolve(destination, "AGENTS.md"), "utf8");
		expect(readme).toContain(
			'pnpm cli deploy --yes --message "chore: deploy {{PROJECT_SLUG}}" --json',
		);
		expect(readme.indexOf("--yes")).toBeLessThan(
			readme.indexOf("--interactive"),
		);
		expect(agents).toContain(
			"Use `--json` and documented approval flags for agent-run commands.",
		);
	});
});
