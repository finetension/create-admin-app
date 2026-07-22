import { describe, expect, it } from "vitest";
import { normalizeServiceName, serviceNameMaxLength } from "./naming.ts";

describe("normalizeServiceName", () => {
	it("normalizes common display names", () => {
		expect(normalizeServiceName("Operations Hub")).toBe("operations-hub");
		expect(normalizeServiceName("My__Service")).toBe("my-service");
	});

	it("romanizes Korean display names", () => {
		expect(normalizeServiceName("운영 허브")).toBe("unnyeong-heobeu");
		expect(normalizeServiceName("자동차 관리")).toBe("jadongcha-gwalli");
	});

	it("leaves room for resource suffixes", () => {
		const normalized = normalizeServiceName("a".repeat(100));
		expect(normalized).toHaveLength(serviceNameMaxLength);
		expect(`${normalized}-db`).toHaveLength(59);
	});

	it("returns an empty identifier for unsupported-only input", () => {
		expect(normalizeServiceName("✨🚀")).toBe("");
	});
});
