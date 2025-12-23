import { describe, expect, test } from "bun:test";
import { interpolate } from "../config";
import { getShortModelName, shuffleArray } from "../utils";

describe("getShortModelName", () => {
	test("extracts model name from slug", () => {
		expect(getShortModelName("anthropic/claude-sonnet-4")).toBe(
			"claude-sonnet-4",
		);
		expect(getShortModelName("openai/gpt-4.1")).toBe("gpt-4.1");
		expect(getShortModelName("google/gemini-2.5-pro-preview")).toBe(
			"gemini-2.5-pro-preview",
		);
	});

	test("handles slug without provider", () => {
		expect(getShortModelName("just-a-model")).toBe("just-a-model");
	});

	test("handles multiple slashes", () => {
		expect(getShortModelName("provider/sub/model-name")).toBe("model-name");
	});
});

describe("shuffleArray", () => {
	test("returns new array, does not mutate original", () => {
		const original = [1, 2, 3, 4, 5];
		const originalCopy = [...original];
		const shuffled = shuffleArray(original);

		// Original should be unchanged
		expect(original).toEqual(originalCopy);
		// Shuffled should have same elements
		expect(shuffled.sort()).toEqual(original.sort());
	});

	test("returns same length array", () => {
		const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		expect(shuffleArray(arr).length).toBe(arr.length);
	});

	test("handles empty array", () => {
		expect(shuffleArray([])).toEqual([]);
	});

	test("handles single element", () => {
		expect(shuffleArray([42])).toEqual([42]);
	});
});

describe("interpolate", () => {
	test("replaces single variable", () => {
		const result = interpolate("Hello {name}!", { name: "World" });
		expect(result).toBe("Hello World!");
	});

	test("replaces multiple variables", () => {
		const result = interpolate("{a} + {b} = {c}", { a: "1", b: "2", c: "3" });
		expect(result).toBe("1 + 2 = 3");
	});

	test("leaves unmatched variables as-is", () => {
		const result = interpolate("Hello {name}, {greeting}!", { name: "World" });
		expect(result).toBe("Hello World, {greeting}!");
	});

	test("handles empty template", () => {
		expect(interpolate("", { foo: "bar" })).toBe("");
	});

	test("handles no variables in template", () => {
		expect(interpolate("No vars here", { foo: "bar" })).toBe("No vars here");
	});
});

describe("getTimestamp", () => {
	test("returns timestamp in correct format", () => {
		const { getTimestamp } = require("../utils");
		const ts = getTimestamp();

		// Format: YYYY-MM-DDTHH-MM-SS
		expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
	});

	test("different calls produce different timestamps", async () => {
		const { getTimestamp } = require("../utils");
		const ts1 = getTimestamp();
		await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait > 1 second
		const ts2 = getTimestamp();

		expect(ts1).not.toBe(ts2);
	});

	test("timestamp is sortable chronologically", () => {
		const { getTimestamp } = require("../utils");
		const ts = getTimestamp();

		// Should be lexicographically sortable
		expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
		expect(ts.charAt(0)).toMatch(/[12]/); // Starts with 1 or 2 (year 1xxx or 2xxx)
	});
});

describe("ensureRunsDirectory", () => {
	test("returns directory path", async () => {
		const { ensureRunsDirectory, getConfig } = require("../utils");
		// Don't actually create in dry-run mode
		const dir = await ensureRunsDirectory(undefined, true);
		expect(typeof dir).toBe("string");
		expect(dir).toContain("runs");
	});

	test("returns subdirectory path when specified", async () => {
		const { ensureRunsDirectory } = require("../utils");
		const dir = await ensureRunsDirectory("test-subdir", true);
		expect(dir).toContain("runs");
		expect(dir).toContain("test-subdir");
	});

	test("dry-run mode does not create directory", async () => {
		const { ensureRunsDirectory } = require("../utils");
		const { existsSync } = require("node:fs");

		const testDir = `test-dry-run-${Date.now()}`;
		const dir = await ensureRunsDirectory(testDir, true);

		// Should return path but not create
		expect(existsSync(dir)).toBe(false);
	});
});

describe("createMockStatblock", () => {
	test("creates mock with model name", () => {
		const { createMockStatblock } = require("../utils");
		const mock = createMockStatblock("test-model", "generator");

		expect(mock).toContain("test-model");
		expect(mock).toContain("generator");
		expect(mock).toContain("MOCK");
	});

	test("includes phase in mock", () => {
		const { createMockStatblock } = require("../utils");
		const mock = createMockStatblock("model", "revision");

		expect(mock).toContain("revision");
	});

	test("different models produce different mocks", () => {
		const { createMockStatblock } = require("../utils");
		const mock1 = createMockStatblock("model1", "phase");
		const mock2 = createMockStatblock("model2", "phase");

		expect(mock1).not.toBe(mock2);
		expect(mock1).toContain("model1");
		expect(mock2).toContain("model2");
	});
});

describe("createMockReview", () => {
	test("creates mock review with model names", () => {
		const { createMockReview } = require("../utils");
		const mock = createMockReview("reviewer-model", "reviewed-model");

		expect(mock).toContain("reviewer-model");
		expect(mock).toContain("reviewed-model");
		expect(mock).toContain("MOCK");
	});

	test("different reviewers produce different mocks", () => {
		const { createMockReview } = require("../utils");
		const mock1 = createMockReview("reviewer1", "reviewed");
		const mock2 = createMockReview("reviewer2", "reviewed");

		expect(mock1).not.toBe(mock2);
	});
});

describe("printDryRunConfig", () => {
	test("prints without throwing", () => {
		const { printDryRunConfig, getConfig } = require("../utils");
		const { loadConfig, resetConfig } = require("../config");

		resetConfig();
		loadConfig("config.example.toml");

		// Should not throw
		expect(() => printDryRunConfig()).not.toThrow();
	});
});

describe("edge case handling", () => {
	test("shuffleArray handles arrays with duplicates", () => {
		const arr = [1, 1, 2, 2, 3, 3];
		const shuffled = shuffleArray(arr);

		expect(shuffled.length).toBe(6);
		expect(shuffled.filter((x) => x === 1).length).toBe(2);
		expect(shuffled.filter((x) => x === 2).length).toBe(2);
		expect(shuffled.filter((x) => x === 3).length).toBe(2);
	});

	test("getShortModelName handles edge cases", () => {
		expect(getShortModelName("provider/model-name")).toBe("model-name");
		expect(getShortModelName("model-name")).toBe("model-name");
		expect(getShortModelName("a/b/c/d")).toBe("d");
		expect(getShortModelName("")).toBe("");
	});

	test("interpolate handles special regex characters", () => {
		const template = "Price: {price}";
		const result = interpolate(template, { price: "$10.99" });
		expect(result).toBe("Price: $10.99");
	});

	test("interpolate handles braces in values", () => {
		const template = "Code: {code}";
		const result = interpolate(template, { code: "{ foo: 'bar' }" });
		expect(result).toBe("Code: { foo: 'bar' }");
	});
});
