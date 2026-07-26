import { describe, expect, it } from "vitest";
import { isCliExternal } from "../../../vite.cli.config.ts";

describe("CLI runtime externals", () => {
	it("keeps native and CommonJS runtime dependencies out of the ESM bundle", () => {
		expect(isCliExternal("node:fs")).toBe(true);
		expect(isCliExternal("@napi-rs/keyring")).toBe(true);
		expect(isCliExternal("write-file-atomic")).toBe(true);
		expect(isCliExternal("zod")).toBe(false);
	});
});
