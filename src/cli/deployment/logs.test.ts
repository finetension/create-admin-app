import { describe, expect, it } from "vitest";
import { buildLogTailArgs } from "./logs.ts";

describe("buildLogTailArgs", () => {
	it("builds a readable default tail command", () => {
		expect(buildLogTailArgs("operations-hub")).toEqual([
			"tail",
			"operations-hub",
			"--format",
			"pretty",
		]);
	});

	it("expands comma-separated repeatable filters", () => {
		expect(
			buildLogTailArgs("operations-hub", {
				format: "json",
				status: "ok,error",
				method: "get,POST",
				ip: "self,192.0.2.1",
				samplingRate: "0.25",
				search: "published",
			}),
		).toEqual([
			"tail",
			"operations-hub",
			"--format",
			"json",
			"--status",
			"ok",
			"--status",
			"error",
			"--method",
			"GET",
			"--method",
			"POST",
			"--ip",
			"self",
			"--ip",
			"192.0.2.1",
			"--search",
			"published",
			"--sampling-rate",
			"0.25",
		]);
	});

	it("rejects unsupported filters", () => {
		expect(() =>
			buildLogTailArgs("operations-hub", { status: "timeout" }),
		).toThrow();
		expect(() =>
			buildLogTailArgs("operations-hub", { samplingRate: "2" }),
		).toThrow();
		expect(() =>
			buildLogTailArgs("operations-hub", { samplingRate: "0" }),
		).toThrow();
	});

	it("omits Wrangler sampling when every event is requested", () => {
		expect(buildLogTailArgs("operations-hub", { samplingRate: "1" })).toEqual([
			"tail",
			"operations-hub",
			"--format",
			"pretty",
		]);
	});
});
