import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createContext } from "./context.js";

describe("create context", () => {
	it("resolves machine inputs without remote credentials", async () => {
		const context = await createContext({
			directory: "My Admin",
			name: "Company Console",
			ownerEmail: "Owner@Example.com",
			yes: false,
			skipInstall: true,
			public: false,
			deploy: false,
			json: true,
			interactive: false,
		});
		expect(context).toMatchObject({
			machine: true,
			project: {
				destination: resolve("My Admin"),
				packageName: "my-admin",
				displayName: "Company Console",
				bootstrapOwnerEmail: "owner@example.com",
			},
		});
	});

	it("requires directory and an owner email in machine mode", async () => {
		await expect(
			createContext({
				yes: false,
				skipInstall: true,
				public: false,
				deploy: false,
				json: true,
				interactive: false,
			}),
		).rejects.toThrow("디렉터리");
	});

	it("marks a missing Access email as security input that cannot be inferred", async () => {
		await expect(
			createContext({
				directory: "my-admin",
				yes: false,
				skipInstall: true,
				public: false,
				deploy: false,
				json: true,
				interactive: false,
			}),
		).rejects.toMatchObject({
			code: "missing_required_input",
			exitCode: 2,
			details: {
				field: "access.bootstrap_owner_email",
				option: "--owner-email",
				may_infer: false,
				required_action: "ask_user",
			},
		});
	});

	it("requires explicit approval before non-JSON machine deploys", async () => {
		await expect(
			createContext({
				directory: "my-admin",
				ownerEmail: "owner@example.com",
				yes: false,
				skipInstall: true,
				public: false,
				deploy: true,
				json: false,
				interactive: false,
			}),
		).rejects.toThrow("--yes");
	});
});
