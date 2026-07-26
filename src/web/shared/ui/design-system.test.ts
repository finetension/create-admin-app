/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	heroUIComponentNames,
	heroUIVariantNames,
} from "./adapters/heroui/registry";
import * as components from "./components";
import { Card, Drawer, Select } from "./components";
import * as variants from "./variants";

const require = createRequire(import.meta.url);

function getHeroUIComponentModules(): string[] {
	const packageJsonPath = require.resolve("@heroui/react/package.json");
	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
		exports: Record<string, unknown>;
	};
	return Object.keys(packageJson.exports)
		.filter(
			(path) =>
				path.startsWith("./") &&
				!["./package.json", "./rac", "./styles"].includes(path),
		)
		.map((path) => path.slice(2))
		.sort();
}

function getWrappedHeroUIComponentModules(): string[] {
	const source = readFileSync(
		new URL("./adapters/heroui/components.ts", import.meta.url),
		"utf8",
	);
	return [...source.matchAll(/from "@heroui\/react\/([^"]+)"/g)]
		.map((match) => match[1] ?? "")
		.filter(Boolean)
		.sort();
}

function collectCssFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return collectCssFiles(path);
		return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
	});
}

describe("HeroUI design system boundary", () => {
	it("wraps every HeroUI component module", () => {
		expect(getWrappedHeroUIComponentModules()).toEqual(
			getHeroUIComponentModules(),
		);
		expect(Object.keys(components).sort()).toEqual(
			[...heroUIComponentNames].sort(),
		);
	});

	it("wraps every HeroUI component variant", () => {
		expect(Object.keys(variants).sort()).toEqual(
			[...heroUIVariantNames].sort(),
		);
	});

	it("preserves HeroUI compound component composition", () => {
		expect(Card.Header).toBeTypeOf("function");
		expect(Card.Content).toBeTypeOf("function");
		expect(Select.Trigger).toBeTypeOf("function");
		expect(Select.Popover).toBeTypeOf("function");
		expect(Drawer.Content).toBeTypeOf("function");
	});

	it("uses HeroUI's CSS-first setup without a JavaScript theme config", () => {
		const css = readFileSync(
			new URL("./styles/index.css", import.meta.url),
			"utf8",
		);
		expect(css).toBe('@import "tailwindcss";\n@import "@heroui/styles";\n');
	});

	it("keeps HeroUI as the only web stylesheet", () => {
		const webRoot = fileURLToPath(new URL("../../", import.meta.url));
		const cssFiles = collectCssFiles(webRoot)
			.map((path) => relative(webRoot, path))
			.sort();

		expect(cssFiles).toEqual(["shared/ui/styles/index.css"]);
	});
});
