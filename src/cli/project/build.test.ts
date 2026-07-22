import { describe, expect, it } from "vitest";
import { buildProject } from "./build.ts";

describe("buildProject", () => {
	it("builds type checks, the application, and the CLI in order", async () => {
		let cleaned = false;
		const commands: string[][] = [];

		await buildProject({
			clean: async () => {
				cleaned = true;
			},
			run: async (args) => {
				commands.push(args);
			},
		});

		expect(cleaned).toBe(true);
		expect(commands).toEqual([
			["exec", "tsc", "-b"],
			["exec", "vite", "build"],
			["exec", "vite", "build", "--config", "./vite.cli.config.ts"],
		]);
	});
});
