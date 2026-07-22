import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createContext } from "./context.js";

describe("createContext", () => {
	it("resolves non-interactive local inputs without external setup", async () => {
		const context = await createContext({
			directory: "My Admin",
			name: "Company Console",
			emails: "Owner@Example.com, owner@example.com",
			yes: true,
			skipInstall: true,
			github: false,
			cloudflare: false,
			public: false,
			deploy: false,
			help: false,
		});

		expect(context).toMatchObject({
			interactive: false,
			project: {
				directoryInput: "My Admin",
				destination: resolve("My Admin"),
				packageName: "my-admin",
				displayName: "Company Console",
				allowedEmails: "owner@example.com",
			},
		});
		expect(context.cloudflare).toBeUndefined();
	});

	it("requires explicit inputs in yes mode", async () => {
		await expect(
			createContext({
				yes: true,
				skipInstall: true,
				public: false,
				deploy: false,
				help: false,
			}),
		).rejects.toThrow("디렉터리");
	});
});
