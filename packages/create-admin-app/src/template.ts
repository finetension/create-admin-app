import {
	cp,
	mkdir,
	readdir,
	readFile,
	rename,
	writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const templateRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../template",
);

export async function ensureDestination(path: string): Promise<void> {
	try {
		const entries = await readdir(path);
		if (entries.length > 0) {
			throw new Error(`대상 디렉터리가 비어 있지 않습니다: ${path}`);
		}
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
		await mkdir(path, { recursive: true });
	}
}

export async function copyTemplate(destination: string): Promise<void> {
	await cp(templateRoot, destination, { recursive: true, errorOnExist: true });
	await rename(
		resolve(destination, ".gitignore.template"),
		resolve(destination, ".gitignore"),
	);
}

export async function setGeneratedPackageName(
	destination: string,
	packageName: string,
	displayName: string,
): Promise<void> {
	const path = resolve(destination, "package.json");
	const packageJson = JSON.parse(await readFile(path, "utf8"));
	packageJson.name = packageName;
	packageJson.private = true;
	await writeFile(path, `${JSON.stringify(packageJson, null, "\t")}\n`);

	const readmePath = resolve(destination, "README.md");
	const readme = (await readFile(readmePath, "utf8"))
		.replace(/^# Create Admin App$/m, `# ${displayName}`)
		.replace(
			/\n## Create a project\n[\s\S]*?(?=\n## Develop this template)/,
			"",
		)
		.replace("## Develop this template", "## Development");
	await writeFile(readmePath, readme);
}
