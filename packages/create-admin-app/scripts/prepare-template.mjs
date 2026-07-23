import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const templateRoot = resolve(packageRoot, "template");

const excludedFiles = new Set([
	"pnpm-lock.yaml",
	".github/workflows/generator.yml",
	".github/workflows/publish-npm.yml",
	"docs/handbook/publishing.md",
]);

function shouldInclude(path) {
	return !path.startsWith("packages/") && !excludedFiles.has(path);
}

const { stdout: listedFiles } = await execa(
	"git",
	["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
	{ cwd: repositoryRoot },
);
const trackedAndUntracked = listedFiles
	.split("\0")
	.filter(Boolean)
	.filter(shouldInclude);

await rm(templateRoot, { recursive: true, force: true });
await mkdir(templateRoot, { recursive: true });

for (const path of trackedAndUntracked) {
	const destination = resolve(templateRoot, path);
	await mkdir(dirname(destination), { recursive: true });
	await cp(resolve(repositoryRoot, path), destination, {
		recursive: true,
		preserveTimestamps: true,
	});
}

await rename(
	resolve(templateRoot, ".gitignore"),
	resolve(templateRoot, ".gitignore.template"),
);

const packageJsonPath = resolve(templateRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
for (const script of Object.keys(packageJson.scripts ?? {})) {
	if (script === "create" || script.startsWith("generator:")) {
		delete packageJson.scripts[script];
	}
}
if (typeof packageJson.scripts?.check === "string") {
	packageJson.scripts.check = packageJson.scripts.check.replace(
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

const agentsPath = resolve(templateRoot, "AGENTS.md");
const agents = (await readFile(agentsPath, "utf8"))
	.replace(
		"This repository is the Create Admin App monorepo and canonical Cloudflare-native scaffold",
		"This repository is a Cloudflare-native project generated with Create Admin App",
	)
	.replace(
		/^- Keep the repository root independently usable as the canonical generated project\..*\n/m,
		"",
	)
	.replace(
		/^- Project creation may initialize local Git automatically,.*\n/m,
		"",
	)
	.replace(/^pnpm create-admin-app --help\n/m, "")
	.replace(/\n### Generator work\n[\s\S]*?(?=\n### Product work)/, "")
	.replace(/^- npm package publishing: `docs\/handbook\/publishing\.md`\n/m, "")
	.replace(/\n### Package publishing work\n[\s\S]*$/, "");
await writeFile(agentsPath, agents);

const readmePath = resolve(templateRoot, "README.md");
const readme = (await readFile(readmePath, "utf8")).replace(
	/^- \[npm publishing handbook\].*\n/m,
	"",
);
await writeFile(readmePath, readme);
