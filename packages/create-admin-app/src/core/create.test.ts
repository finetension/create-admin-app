import { describe, expect, it, vi } from "vitest";
import type { CreateContext, CreatePhases } from "./context.js";
import { assertSupportedToolVersion, createProject } from "./create.js";

function fixtureContext(): CreateContext {
	return {
		args: {
			yes: false,
			skipInstall: true,
			public: false,
			deploy: false,
			json: true,
			interactive: false,
		},
		machine: true,
		project: {
			directoryInput: "admin",
			destination: "/tmp/admin",
			staging: "",
			packageName: "admin",
			displayName: "Admin",
			allowedEmails: ["admin@example.com"],
		},
	};
}

describe("createProject", () => {
	it("requires the documented Node.js and pnpm versions", () => {
		expect(() => assertSupportedToolVersion("node", "v22.13.0")).not.toThrow();
		expect(() => assertSupportedToolVersion("pnpm", "11.15.1")).not.toThrow();
		expect(() => assertSupportedToolVersion("node", "v22.12.0")).toThrow(
			">=22.13.0",
		);
		expect(() => assertSupportedToolVersion("pnpm", "10.20.0")).toThrow(
			"pnpm 11",
		);
	});

	it("runs phases in a same-filesystem staging directory", async () => {
		const context = fixtureContext();
		const calls: string[] = [];
		const phase = (name: string) =>
			vi.fn(async (received: CreateContext) => {
				expect(received).toBe(context);
				expect(received.project.staging).toBe("/tmp/.admin.create-test");
				calls.push(name);
				if (name === "finalize") received.project.staging = "";
			});
		const phases: CreatePhases = {
			scaffold: phase("scaffold"),
			configure: phase("configure"),
			finalize: phase("finalize"),
		};
		const removeStaging = vi.fn(async () => undefined);
		await createProject(context, phases, {
			preflight: vi.fn(async () => undefined),
			createStaging: vi.fn(async () => "/tmp/.admin.create-test"),
			removeStaging,
		});
		expect(calls).toEqual(["scaffold", "configure", "finalize"]);
		expect(removeStaging).not.toHaveBeenCalled();
	});

	it("cleans staging and leaves destination untouched after failure", async () => {
		const context = fixtureContext();
		const removeStaging = vi.fn(async () => undefined);
		const finalize = vi.fn(async () => undefined);
		await expect(
			createProject(
				context,
				{
					scaffold: vi.fn(async () => undefined),
					configure: vi.fn(async () => {
						throw new Error("check failed");
					}),
					finalize,
				},
				{
					preflight: vi.fn(async () => undefined),
					createStaging: vi.fn(async () => "/tmp/.admin.create-test"),
					removeStaging,
				},
			),
		).rejects.toThrow("check failed");
		expect(finalize).not.toHaveBeenCalled();
		expect(removeStaging).toHaveBeenCalledWith("/tmp/.admin.create-test");
	});
});
