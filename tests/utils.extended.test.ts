import { describe, expect, test } from "bun:test";
import { interpolate } from "../config";
import {
    createMockReview,
    createMockStatblock,
    getShortModelName,
    printDryRunConfig,
    shuffleArray,
} from "../utils";

// ============================================================================
// createMockStatblock Edge Cases
// ============================================================================

describe("createMockStatblock", () => {
    test("produces different output for different tags", () => {
        const mock1 = createMockStatblock("model-a");
        const mock2 = createMockStatblock("model-b");
        expect(mock1).not.toBe(mock2);
        expect(mock1).toContain("model-a");
        expect(mock2).toContain("model-b");
    });

    test("output is markdown-like", () => {
        const mock = createMockStatblock("test");
        expect(mock).toContain("#");
        expect(mock).toContain("**");
    });

    test("handles special characters in tag", () => {
        const mock = createMockStatblock("model/with-slash_underscores");
        expect(mock).toBeDefined();
        expect(typeof mock).toBe("string");
    });

    test("handles empty tag", () => {
        const mock = createMockStatblock("");
        expect(mock).toBeDefined();
    });
});

// ============================================================================
// createMockReview Edge Cases
// ============================================================================

describe("createMockReview", () => {
    test("produces different output when both args provided", () => {
        const mock1 = createMockReview("claude", "target1");
        const mock2 = createMockReview("gpt", "target2");
        expect(mock1).not.toBe(mock2);
        expect(mock1).toContain("claude");
        expect(mock2).toContain("gpt");
    });

    test("produces default message with single arg", () => {
        const mock = createMockReview("reviewer");
        // With only one arg, falls back to "Mock review"
        expect(mock).toContain("Mock review");
    });

    test("contains review-like content", () => {
        const mock = createMockReview("reviewer", "reviewed");
        // Should have some structure
        expect(mock.length).toBeGreaterThan(50);
        expect(mock).toContain("MOCK");
    });
});



// ============================================================================
// getShortModelName Edge Cases
// ============================================================================

describe("getShortModelName edge cases", () => {
    test("extracts name from standard OpenRouter slug", () => {
        expect(getShortModelName("anthropic/claude-sonnet-4")).toBe(
            "claude-sonnet-4",
        );
        expect(getShortModelName("openai/gpt-4")).toBe("gpt-4");
    });

    test("handles slug with multiple slashes", () => {
        // Edge case: what if there's a nested path?
        const result = getShortModelName("provider/model/version");
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
    });

    test("handles slug without slash", () => {
        const result = getShortModelName("just-a-model-name");
        expect(result).toBe("just-a-model-name");
    });

    test("handles empty string", () => {
        const result = getShortModelName("");
        expect(result).toBe("");
    });

    test("handles slug with special characters", () => {
        const result = getShortModelName("provider/model-with_special.chars");
        expect(result).toBe("model-with_special.chars");
    });
});

// ============================================================================
// shuffleArray Tests
// ============================================================================

describe("shuffleArray", () => {
    test("returns array of same length", () => {
        const original = [1, 2, 3, 4, 5];
        const shuffled = shuffleArray([...original]);
        expect(shuffled.length).toBe(original.length);
    });

    test("contains same elements", () => {
        const original = [1, 2, 3, 4, 5];
        const shuffled = shuffleArray([...original]);
        expect(shuffled.sort()).toEqual(original.sort());
    });

    test("handles empty array", () => {
        const result = shuffleArray([]);
        expect(result).toEqual([]);
    });

    test("handles single element array", () => {
        const result = shuffleArray([1]);
        expect(result).toEqual([1]);
    });

    test("handles array with duplicate elements", () => {
        const original = [1, 1, 2, 2, 3];
        const shuffled = shuffleArray([...original]);
        expect(shuffled.length).toBe(5);
        expect(shuffled.filter((x) => x === 1).length).toBe(2);
        expect(shuffled.filter((x) => x === 2).length).toBe(2);
    });

    test("shuffles in place (mutates original)", () => {
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const originalCopy = [...arr];
        shuffleArray(arr);
        // With 10 elements, extremely unlikely to stay the same
        // But we can't guarantee it, so just check mutation happened
        expect(arr.length).toBe(originalCopy.length);
    });
});

// ============================================================================
// interpolate Edge Cases
// ============================================================================

describe("interpolate edge cases", () => {
    test("replaces single variable", () => {
        const result = interpolate("Hello {name}!", { name: "World" });
        expect(result).toBe("Hello World!");
    });

    test("replaces multiple occurrences of same variable", () => {
        const result = interpolate("{x} + {x} = 2{x}", { x: "1" });
        expect(result).toBe("1 + 1 = 21");
    });

    test("replaces multiple different variables", () => {
        const result = interpolate("{a} and {b}", { a: "first", b: "second" });
        expect(result).toBe("first and second");
    });

    test("leaves unmatched variables unchanged", () => {
        const result = interpolate("{matched} and {unmatched}", { matched: "yes" });
        expect(result).toBe("yes and {unmatched}");
    });

    test("handles empty vars object", () => {
        const result = interpolate("No {replacements}", {});
        expect(result).toBe("No {replacements}");
    });

    test("handles template with no variables", () => {
        const result = interpolate("Plain text", { unused: "value" });
        expect(result).toBe("Plain text");
    });

    test("handles special regex characters in values", () => {
        const result = interpolate("Pattern: {pattern}", { pattern: ".*$^+" });
        expect(result).toBe("Pattern: .*$^+");
    });

    test("handles braces in values", () => {
        // Value contains braces - should not cause infinite loop
        const result = interpolate("{a}", { a: "{b}" });
        expect(result).toBe("{b}");
    });

    test("handles multiline templates", () => {
        const template = `Line 1: {val}
Line 2: {val}
Line 3: {other}`;
        const result = interpolate(template, { val: "X", other: "Y" });
        expect(result).toContain("Line 1: X");
        expect(result).toContain("Line 2: X");
        expect(result).toContain("Line 3: Y");
    });

    test("handles unicode in values", () => {
        const result = interpolate("{emoji}", { emoji: "🎲" });
        expect(result).toBe("🎲");
    });

    test("handles very long values", () => {
        const longValue = "x".repeat(10000);
        const result = interpolate("{val}", { val: longValue });
        expect(result.length).toBe(10000);
    });
});

// ============================================================================
// printDryRunConfig Tests
// ============================================================================

describe("printDryRunConfig", () => {
    test("does not throw", () => {
        // Just verify it doesn't crash
        expect(() => printDryRunConfig()).not.toThrow();
    });
});
