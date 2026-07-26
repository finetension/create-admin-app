import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createContext } from "./context.js";

describe("create context", () => {
	it("resolves machine inputs without remote credentials", async () => {
		const context = await createContext({
			directory: "My Admin",
			name: "Company Console",
			emails: "Owner@Example.com, owner@example.com",
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
				allowedEmails: ["owner@example.com"],
			},
		});
	});

	it("requires directory and emails in machine mode", async () => {
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

	it("requires explicit approval before non-JSON machine deploys", async () => {
		await expect(
			createContext({
				directory: "my-admin",
				emails: "owner@example.com",
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
