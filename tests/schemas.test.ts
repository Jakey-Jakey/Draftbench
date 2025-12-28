import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
    JudgeStatblocksResponseSchema,
    PairwiseJudgeResponseSchema,
    parseJsonResponse,
    ThreeWayJudgeResponseSchema,
} from "../schemas";

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe("PairwiseJudgeResponseSchema", () => {
    test("validates correct response", () => {
        const valid = { winner: "S1", reasoning: "Better design" };
        const result = PairwiseJudgeResponseSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    test("rejects missing winner", () => {
        const invalid = { reasoning: "Better design" };
        const result = PairwiseJudgeResponseSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    test("rejects missing reasoning", () => {
        const invalid = { winner: "S1" };
        const result = PairwiseJudgeResponseSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    test("rejects non-string winner", () => {
        const invalid = { winner: 1, reasoning: "text" };
        const result = PairwiseJudgeResponseSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

describe("ThreeWayJudgeResponseSchema", () => {
    test("validates correct response", () => {
        const valid = {
            first: "S1",
            second: "S2",
            third: "S3",
            reasoning: "Good rankings",
        };
        const result = ThreeWayJudgeResponseSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    test("rejects missing fields", () => {
        const invalid = { first: "S1", second: "S2", reasoning: "text" };
        const result = ThreeWayJudgeResponseSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    test("rejects empty object", () => {
        const result = ThreeWayJudgeResponseSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

describe("JudgeStatblocksResponseSchema", () => {
    test("validates correct response with rankings", () => {
        const valid = {
            rankings: [
                { id: "A", rank: 1, score: 95 },
                { id: "B", rank: 2, score: 80 },
            ],
            reasoning: "A was better",
        };
        const result = JudgeStatblocksResponseSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    test("validates empty rankings array", () => {
        const valid = { rankings: [], reasoning: "No statblocks" };
        const result = JudgeStatblocksResponseSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    test("rejects invalid ranking entry", () => {
        const invalid = {
            rankings: [{ id: "A", rank: "first", score: 95 }], // rank should be number
            reasoning: "text",
        };
        const result = JudgeStatblocksResponseSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    test("rejects missing score in ranking", () => {
        const invalid = {
            rankings: [{ id: "A", rank: 1 }], // missing score
            reasoning: "text",
        };
        const result = JudgeStatblocksResponseSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

// ============================================================================
// parseJsonResponse Tests
// ============================================================================

describe("parseJsonResponse", () => {
    const testSchema = z.object({
        name: z.string(),
        value: z.number(),
    });
    const fallback = { name: "default", value: 0 };

    describe("successful parsing", () => {
        test("parses clean JSON", () => {
            const text = '{"name": "test", "value": 42}';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ name: "test", value: 42 });
        });

        test("extracts JSON from surrounding text", () => {
            const text =
                'Here is my response:\n\n{"name": "extracted", "value": 99}\n\nHope that helps!';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ name: "extracted", value: 99 });
        });

        test("handles JSON with markdown code block hint", () => {
            const text = '```json\n{"name": "codeblock", "value": 1}\n```';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ name: "codeblock", value: 1 });
        });

        test("handles nested JSON objects", () => {
            const nestedSchema = z.object({
                outer: z.object({ inner: z.string() }),
            });
            const text = '{"outer": {"inner": "value"}}';
            const result = parseJsonResponse(text, nestedSchema, {
                outer: { inner: "" },
            });
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ outer: { inner: "value" } });
        });

        test("handles JSON with whitespace", () => {
            const text = `{
				"name": "multiline",
				"value": 123
			}`;
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ name: "multiline", value: 123 });
        });
    });

    describe("failure cases", () => {
        test("returns fallback for no JSON found", () => {
            const text = "This response has no JSON at all!";
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(false);
            expect(result.data).toEqual(fallback);
            if (!result.success) {
                expect(result.error).toContain("No JSON object found");
            }
        });

        test("returns fallback for malformed JSON", () => {
            const text = '{"name": "broken", value: missing_quotes}';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(false);
            expect(result.data).toEqual(fallback);
            if (!result.success) {
                expect(result.error).toContain("JSON parse error");
            }
        });

        test("returns fallback for schema validation failure", () => {
            const text = '{"name": 123, "value": "not a number"}';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(false);
            expect(result.data).toEqual(fallback);
            if (!result.success) {
                expect(result.error).toContain("Schema validation failed");
            }
        });

        test("returns fallback for missing required fields", () => {
            const text = '{"name": "only name"}';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(false);
            expect(result.data).toEqual(fallback);
        });

        test("returns fallback for empty object when fields required", () => {
            const text = "{}";
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(false);
            expect(result.data).toEqual(fallback);
        });

        test("handles truncated JSON", () => {
            const text = '{"name": "truncat';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(false);
            expect(result.data).toEqual(fallback);
        });
    });

    describe("edge cases", () => {
        test("handles empty string input", () => {
            const result = parseJsonResponse("", testSchema, fallback);
            expect(result.success).toBe(false);
            expect(result.data).toEqual(fallback);
        });

        test("handles JSON array (not object)", () => {
            // parseJsonResponse looks for {} not []
            const text = '[{"name": "array", "value": 1}]';
            const result = parseJsonResponse(text, testSchema, fallback);
            // The regex /{[\s\S]*}/ will match the inner object
            expect(result.success).toBe(true);
        });

        test("greedy regex matches from first { to last }", () => {
            // The regex /{[\s\S]*}/ is greedy, so it matches from first { to last }
            // This means with multiple JSON objects, it may fail to parse
            const text =
                'First: {"name": "first", "value": 1}. Second: {"name": "second", "value": 2}';
            const result = parseJsonResponse(text, testSchema, fallback);
            // The greedy match captures: {"name": "first", "value": 1}. Second: {"name": "second", "value": 2}
            // which is invalid JSON, so it will fail
            expect(result.success).toBe(false);
        });

        test("handles unicode in JSON", () => {
            const text = '{"name": "日本語", "value": 42}';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(true);
            expect(result.data.name).toBe("日本語");
        });

        test("handles escaped quotes in strings", () => {
            const text = '{"name": "with \\"quotes\\"", "value": 1}';
            const result = parseJsonResponse(text, testSchema, fallback);
            expect(result.success).toBe(true);
            expect(result.data.name).toBe('with "quotes"');
        });
    });
});

// ============================================================================
// LLM Response Parsing Edge Cases
// ============================================================================

describe("LLM response parsing scenarios", () => {
    test("parses typical pairwise judge response", () => {
        const llmResponse = `Based on my analysis, I believe S1 is the stronger entry.

{"winner": "S1", "reasoning": "S1 has better ability balance and more thematic flavor text."}

Both entries were good but S1 edges ahead.`;

        const fallback = { winner: "S1", reasoning: "Default" };
        const result = parseJsonResponse(
            llmResponse,
            PairwiseJudgeResponseSchema,
            fallback,
        );
        expect(result.success).toBe(true);
        expect(result.data.winner).toBe("S1");
    });

    test("parses typical three-way judge response", () => {
        const llmResponse = `After comparing all three:

\`\`\`json
{
  "first": "S2",
  "second": "S1", 
  "third": "S3",
  "reasoning": "S2 had the most creative abilities, S1 was solid but conventional, S3 had balance issues."
}
\`\`\``;

        const fallback = { first: "S1", second: "S2", third: "S3", reasoning: "" };
        const result = parseJsonResponse(
            llmResponse,
            ThreeWayJudgeResponseSchema,
            fallback,
        );
        expect(result.success).toBe(true);
        expect(result.data.first).toBe("S2");
    });

    test("handles LLM that returns just JSON", () => {
        const llmResponse = '{"winner": "S2", "reasoning": "Superior design"}';
        const fallback = { winner: "S1", reasoning: "" };
        const result = parseJsonResponse(
            llmResponse,
            PairwiseJudgeResponseSchema,
            fallback,
        );
        expect(result.success).toBe(true);
        expect(result.data.winner).toBe("S2");
    });

    test("handles LLM hallucinating extra fields", () => {
        const llmResponse =
            '{"winner": "S1", "reasoning": "Good", "confidence": 0.95, "notes": "extra"}';
        const fallback = { winner: "S1", reasoning: "" };
        const result = parseJsonResponse(
            llmResponse,
            PairwiseJudgeResponseSchema,
            fallback,
        );
        // Zod strips extra fields by default
        expect(result.success).toBe(true);
        expect(result.data.winner).toBe("S1");
    });
});
