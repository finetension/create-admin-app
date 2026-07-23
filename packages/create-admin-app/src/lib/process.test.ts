import { describe, expect, it } from "vitest";
import { runCommand } from "./process.js";

describe("runCommand", () => {
	it("captures command output", async () => {
		const result = await runCommand(
			process.execPath,
			["-e", "process.stdout.write('ok')"],
			{ cwd: process.cwd(), capture: true },
		);

		expect(result).toEqual({ stdout: "ok", stderr: "", exitCode: 0 });
	});

	it("passes input to stdin", async () => {
		const result = await runCommand(
			process.execPath,
			[
				"-e",
				"process.stdin.setEncoding('utf8'); let input = ''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => process.stdout.write(input.toUpperCase()))",
			],
			{ cwd: process.cwd(), capture: true, input: "hello" },
		);

		expect(result.stdout).toBe("HELLO");
	});

	it("returns non-zero exits only when failures are allowed", async () => {
		const result = await runCommand(
			process.execPath,
			["-e", "process.stderr.write('failed'); process.exit(7)"],
			{ cwd: process.cwd(), capture: true, allowFailure: true },
		);

		expect(result).toEqual({ stdout: "", stderr: "failed", exitCode: 7 });
	});

	it("rejects non-zero exits by default", async () => {
		await expect(
			runCommand(
				process.execPath,
				["-e", "process.stderr.write('failed'); process.exit(7)"],
				{ cwd: process.cwd(), capture: true },
			),
		).rejects.toThrow("failed");
	});
});
