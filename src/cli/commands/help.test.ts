import { describe, expect, it } from "vitest";
import { buildHelpContract } from "./help.ts";

describe("agent help contract", () => {
	it("describes every public command and its inputs", async () => {
		const contract = await buildHelpContract(false);
		const deploy = contract.commands.find(
			(command) => command.command === "deploy",
		);
		const migrate = contract.commands.find(
			(command) => command.command === "db migrate",
		);
		const authLogin = contract.commands.find(
			(command) => command.command === "auth login",
		);

		expect(deploy?.visibility).toBe("public");
		expect(deploy?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "yes", type: "boolean" }),
				expect.objectContaining({ name: "message", type: "string" }),
				expect.objectContaining({
					name: "cloudflare-account-id",
					type: "string",
				}),
			]),
		);
		expect(migrate?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "remote", type: "boolean" }),
			]),
		);
		expect(authLogin?.visibility).toBe("public");
		expect(authLogin?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "cloudflare-account-id",
					type: "string",
				}),
			]),
		);
		expect(
			contract.commands.some((command) => command.visibility === "internal"),
		).toBe(false);
		expect(contract.inputs).toMatchObject({
			project_config: { path: "config.toml", strict: true },
			environment: expect.arrayContaining([
				expect.objectContaining({
					name: "CLOUDFLARE_API_TOKEN",
					secret: true,
				}),
				expect.objectContaining({
					name: "GOOGLE_OAUTH_CLIENT_ID",
					secret: true,
				}),
				expect.objectContaining({
					name: "GOOGLE_OAUTH_CLIENT_SECRET",
					secret: true,
				}),
			]),
		});
		const tokenInput = contract.inputs.environment.find(
			(input) => input.name === "CLOUDFLARE_API_TOKEN",
		);
		expect(tokenInput?.commands).toEqual(
			expect.arrayContaining(["auth login", "dev", "doctor"]),
		);
		expect(tokenInput?.persistence).toEqual({
			default: "process-only",
			"auth login": "verified-os-credential-store",
		});
	});

	it("documents hidden commands, guards, capabilities, and risk", async () => {
		const contract = await buildHelpContract(true);
		const destroy = contract.commands.find(
			(command) => command.command === "internal destroy",
		);

		expect(destroy).toMatchObject({
			visibility: "internal",
			conditions: {
				environment: "github-actions",
				ref: "refs/heads/main",
				events: ["workflow_dispatch"],
				capability: "PLATFORM_ALLOW_DESTROY",
				risk: "destructive",
			},
		});
		expect(destroy?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "confirm", required: true }),
				expect.objectContaining({ name: "include-data" }),
			]),
		);
	});
});
