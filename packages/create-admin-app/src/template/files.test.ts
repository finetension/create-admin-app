import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { customizeTemplate, ensureDestination } from "./files.js";

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
	it("creates a missing destination and rejects a non-empty one", async () => {
		const root = await temporaryDirectory();
		const destination = resolve(root, "generated");
		await ensureDestination(destination);
		await writeFile(resolve(destination, "existing.txt"), "existing");

		await expect(ensureDestination(destination)).rejects.toThrow("비어 있지");
	});

	it("customizes package metadata and generated README", async () => {
		const destination = await temporaryDirectory();
		await mkdir(destination, { recursive: true });
		await writeFile(
			resolve(destination, "package.json"),
			`${JSON.stringify({ name: "template", private: false })}\n`,
		);
		await writeFile(
			resolve(destination, "README.md"),
			"# Create Admin App\n\n## Create a project\nremove me\n\n## Develop this template\nkeep me\n",
		);

		await customizeTemplate(destination, "company-admin", "Company Admin");

		const packageJson = JSON.parse(
			await readFile(resolve(destination, "package.json"), "utf8"),
		);
		const readme = await readFile(resolve(destination, "README.md"), "utf8");
		expect(packageJson).toMatchObject({ name: "company-admin", private: true });
		expect(readme).toContain("# Company Admin");
		expect(readme).toContain("## Development");
		expect(readme).not.toContain("remove me");
	});
});
