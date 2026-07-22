import { chmodSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(projectRoot, "dist/cli");
const outputFile = resolve(outputDirectory, "index.mjs");
const nodeBuiltins = new Set([
	...builtinModules,
	...builtinModules.map((module) => `node:${module}`),
]);

export default defineConfig({
	resolve: {
		conditions: ["node"],
	},
	build: {
		target: "node22",
		outDir: outputDirectory,
		emptyOutDir: true,
		minify: false,
		sourcemap: false,
		lib: {
			entry: resolve(projectRoot, "src/cli/index.ts"),
			formats: ["es"],
			fileName: () => "index.mjs",
		},
		rolldownOptions: {
			external: (id) => nodeBuiltins.has(id) || id === "@napi-rs/keyring",
			output: {
				codeSplitting: false,
				entryFileNames: "index.mjs",
				banner: `#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);`,
			},
		},
	},
	plugins: [
		{
			name: "make-cli-executable",
			writeBundle() {
				chmodSync(outputFile, 0o755);
			},
		},
	],
});
