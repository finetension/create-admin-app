import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const templateRoot = resolve(packageRoot, "template");
const generatedAssetsRoot = resolve(packageRoot, "assets/generated");

const excludedFiles = new Set([
	"pnpm-lock.yaml",
	".github/workflows/package-ci.yml",
	".github/workflows/package-publish.yml",
	"docs/handbook/publishing.md",
	"src/cli/deployment/package-workflow-policy.test.ts",
]);

function shouldInclude(path) {
	return (
		!path.startsWith("packages/") &&
		!path.startsWith("backups/") &&
		!excludedFiles.has(path)
	);
}

const { stdout: listedFiles } = await execa(
	"git",
	["ls-files", "--cached", "-z"],
	{
		cwd: repositoryRoot,
	},
);
const trackedFiles = listedFiles
	.split("\0")
	.filter(Boolean)
	.filter(shouldInclude)
	.filter((path) => existsSync(resolve(repositoryRoot, path)));

await rm(templateRoot, { recursive: true, force: true });
await mkdir(templateRoot, { recursive: true });

for (const path of trackedFiles) {
	const destination = resolve(templateRoot, path);
	await mkdir(dirname(destination), { recursive: true });
	await cp(resolve(repositoryRoot, path), destination, {
		recursive: true,
		preserveTimestamps: true,
	});
}

for (const path of [
	"README.md",
	"AGENTS.md",
	"docs/specs/product-requirements.md",
	"docs/specs/developer-experience.md",
	"docs/handbook/development.md",
	"docs/handbook/deployment.md",
]) {
	const destination = resolve(templateRoot, path);
	await mkdir(dirname(destination), { recursive: true });
	await cp(resolve(generatedAssetsRoot, path), destination);
}

await rename(
	resolve(templateRoot, ".gitignore"),
	resolve(templateRoot, ".gitignore.template"),
);

const packageJsonPath = resolve(templateRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const generatorPackageJson = JSON.parse(
	await readFile(resolve(packageRoot, "package.json"), "utf8"),
);
packageJson.createAdminApp = { version: generatorPackageJson.version };
for (const script of Object.keys(packageJson.scripts ?? {})) {
	if (script === "create" || script.startsWith("generator:")) {
		delete packageJson.scripts[script];
	}
}
if (typeof packageJson.scripts?.validate === "string") {
	packageJson.scripts.validate = packageJson.scripts.validate.replace(
		" && pnpm run generator:check",
		"",
	);
}
await writeFile(
	packageJsonPath,
	`${JSON.stringify(packageJson, null, "\t")}\n`,
);

const workspacePath = resolve(templateRoot, "pnpm-workspace.yaml");
const workspace = (await readFile(workspacePath, "utf8")).replace(
	/^packages:\n(?: {2}- .*\n)+\n/,
	"",
);
await writeFile(workspacePath, workspace);

await execa("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], {
	cwd: templateRoot,
	stdio: "inherit",
});
