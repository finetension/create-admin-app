import { describe, expect, it, vi } from "vitest";
import type { CreateContext } from "../core/context.js";

const { runCommand, promoteStagingDirectory } = vi.hoisted(() => ({
	runCommand: vi.fn(),
	promoteStagingDirectory: vi.fn(),
}));

vi.mock("../lib/process.js", () => ({ runCommand }));
vi.mock("../template/files.js", () => ({ promoteStagingDirectory }));

const { finalizeProject } = await import("./finalize.js");

function context(): CreateContext {
	return {
		args: {
			yes: true,
			skipInstall: false,
			public: false,
			deploy: true,
			message: "feat: deploy app",
			json: true,
			interactive: false,
		},
		machine: true,
		project: {
			directoryInput: "my-company",
			destination: "/tmp/my-company",
			staging: "/tmp/.my-company.create-test",
			packageName: "my-company",
			displayName: "My Company",
			allowedEmails: ["owner@example.com"],
		},
	};
}

describe("generator deploy handoff", () => {
	it("preserves interactive mode when handing off to the project CLI", async () => {
		runCommand.mockResolvedValueOnce({
			exitCode: 0,
			stdout: "",
			stderr: "",
		});
		const createContext = context();
		createContext.args = {
			...createContext.args,
			yes: false,
			message: undefined,
			json: false,
			interactive: true,
		};
		createContext.machine = false;

		await finalizeProject(createContext);

		expect(runCommand).toHaveBeenCalledWith(
			"pnpm",
			["cli", "deploy", "--interactive"],
			{
				cwd: "/tmp/my-company",
				capture: false,
				allowFailure: true,
			},
		);
	});

	it("reports deployment failure without losing the completed local project", async () => {
		runCommand.mockResolvedValueOnce({
			exitCode: 4,
			stdout: JSON.stringify({
				error: {
					code: "deployment_workflow_failed",
					message: "workflow failed",
					hint: "inspect the run",
				},
			}),
			stderr: "",
		});
		const createContext = context();

		await expect(finalizeProject(createContext)).rejects.toMatchObject({
			name: "CreateDeploymentError",
			exitCode: 4,
			partialResult: {
				created: true,
				directory: "/tmp/my-company",
				deploy_requested: true,
				deployment: {
					error: { code: "deployment_workflow_failed" },
				},
			},
		});
		expect(promoteStagingDirectory).toHaveBeenCalledWith(
			"/tmp/.my-company.create-test",
			"/tmp/my-company",
		);
		expect(createContext.project.staging).toBe("");
	});
});
