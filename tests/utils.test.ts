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
