import {
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rmdir,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "smol-toml";
import writeFileAtomic from "write-file-atomic";

const templateRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../template",
);

export async function assertDestinationAvailable(path: string): Promise<void> {
	try {
		const stat = await lstat(path);
		if (!stat.isDirectory()) {
			throw new Error(`대상 경로가 디렉터리가 아닙니다: ${path}`);
		}
		if ((await readdir(path)).length > 0) {
			throw new Error(`대상 디렉터리가 비어 있지 않습니다: ${path}`);
		}
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
}

export async function createStagingDirectory(
	destination: string,
): Promise<string> {
	const parent = dirname(destination);
	await mkdir(parent, { recursive: true });
	return mkdtemp(resolve(parent, `.${basename(destination)}.create-`));
}

export async function copyTemplate(destination: string): Promise<void> {
	await cp(templateRoot, destination, {
		recursive: true,
		errorOnExist: true,
	});
	await rename(
		resolve(destination, ".gitignore.template"),
		resolve(destination, ".gitignore"),
	);
}

export async function customizeTemplate(
	destination: string,
	packageName: string,
	displayName: string,
): Promise<void> {
	const packageJsonPath = resolve(destination, "package.json");
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
	packageJson.name = packageName;
	packageJson.private = true;
	await writeFile(
		packageJsonPath,
		`${JSON.stringify(packageJson, null, "\t")}\n`,
	);

	for (const relativePath of [
		"README.md",
		"docs/specs/product-requirements.md",
	]) {
		const path = resolve(destination, relativePath);
		const contents = (await readFile(path, "utf8"))
			.replaceAll("{{PROJECT_NAME}}", displayName)
			.replaceAll("{{PROJECT_SLUG}}", packageName);
		await writeFile(path, contents);
	}
}

export async function writeGeneratedConfig(
	destination: string,
	input: {
		name: string;
		slug: string;
		allowedEmails: string[];
		isPublic: boolean;
	},
): Promise<void> {
	const value = {
		project: {
			name: input.name,
			slug: input.slug,
			allowed_emails: input.allowedEmails,
		},
		...(input.isPublic ? { github: { visibility: "public" as const } } : {}),
	};
	await writeFileAtomic(
		resolve(destination, "config.toml"),
		`${stringify(value).trim()}\n`,
		{ encoding: "utf8" },
	);
}

export async function promoteStagingDirectory(
	staging: string,
	destination: string,
): Promise<void> {
	try {
		await rmdir(destination);
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
	}
	await rename(staging, destination);
}
