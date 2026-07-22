import { describe, expect, it, vi } from "vitest";
import type { CreateContext, CreatePhases } from "./context.js";
import { createProject } from "./create.js";

function fixtureContext(): CreateContext {
	return {
		args: {
			yes: true,
			skipInstall: true,
			public: false,
			deploy: false,
			help: false,
		},
		interactive: false,
		project: {
			directoryInput: "admin",
			destination: "/tmp/admin",
			packageName: "admin",
			displayName: "Admin",
			allowedEmails: "admin@example.com",
		},
	};
}

describe("createProject", () => {
	it("runs the explicit creation phases in order with one context", async () => {
		const context = fixtureContext();
		const calls: string[] = [];
		const phase = (name: string) =>
			vi.fn(async (received: CreateContext) => {
				expect(received).toBe(context);
				calls.push(name);
			});
		const phases: CreatePhases = {
			scaffold: phase("scaffold"),
			configure: phase("configure"),
			connect: phase("connect"),
			finalize: phase("finalize"),
		};

		await createProject(context, phases);

		expect(calls).toEqual(["scaffold", "configure", "connect", "finalize"]);
	});

	it("stops before later phases when a phase fails", async () => {
		const context = fixtureContext();
		const configure = vi.fn(async () => {
			throw new Error("configuration failed");
		});
		const connect = vi.fn(async () => undefined);
		const finalize = vi.fn(async () => undefined);

		await expect(
			createProject(context, {
				scaffold: vi.fn(async () => undefined),
				configure,
				connect,
				finalize,
			}),
		).rejects.toThrow("configuration failed");
		expect(connect).not.toHaveBeenCalled();
		expect(finalize).not.toHaveBeenCalled();
	});
});
