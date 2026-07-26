import { describe, expect, it } from "vitest";
import {
	buildLogTailArgs,
	extractLogEvents,
	resolveLogTerminationReason,
} from "./logs.ts";

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

	it("reports the actual stream termination reason", () => {
		expect(
			resolveLogTerminationReason({
				timerElapsed: true,
				failed: false,
				signal: "SIGINT",
			}),
		).toBe("duration_elapsed");
		expect(
			resolveLogTerminationReason({
				timerElapsed: false,
				failed: true,
			}),
		).toBe("error");
		expect(
			resolveLogTerminationReason({
				timerElapsed: false,
				failed: false,
			}),
		).toBe("stream_ended");
	});

	it("reassembles pretty-printed Wrangler JSON into complete events", () => {
		const firstChunk = extractLogEvents(
			'{\n  "event": {\n    "request": {"url": "https://example.com/{probe}"}\n',
		);
		expect(firstChunk.events).toEqual([]);

		const secondChunk = extractLogEvents(
			`${firstChunk.remainder}  },\n  "outcome": "ok"\n}\n{\n  "event": "second"\n}\n`,
		);
		expect(secondChunk).toEqual({
			events: [
				{
					event: {
						request: { url: "https://example.com/{probe}" },
					},
					outcome: "ok",
				},
				{ event: "second" },
			],
			remainder: "",
		});
	});

	it("keeps incomplete data buffered and flushes raw diagnostics once", () => {
		const partial = extractLogEvents('connecting to tail\n{"event":');
		expect(partial).toEqual({
			events: ["connecting to tail"],
			remainder: '{"event":',
		});
		expect(extractLogEvents(partial.remainder, true)).toEqual({
			events: ['{"event":'],
			remainder: "",
		});
	});
});
