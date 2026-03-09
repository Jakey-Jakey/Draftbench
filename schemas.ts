import { z } from "zod";

// ============================================================================
// LLM Response Schemas
// ============================================================================

/**
 * Schema for pairwise judge responses.
 * Used in finale matches and initial leaderboard comparisons.
 */
export const PairwiseJudgeResponseSchema = z.object({
	winner: z.string(),
	reasoning: z.string(),
});

export type PairwiseJudgeResponse = z.infer<typeof PairwiseJudgeResponseSchema>;

/**
 * Schema for three-way judge responses.
 * Used in Swiss tournament 1v1v1 matches.
 */
export const ThreeWayJudgeResponseSchema = z.object({
	first: z.string(),
	second: z.string(),
	third: z.string(),
	reasoning: z.string(),
});

export type ThreeWayJudgeResponse = z.infer<typeof ThreeWayJudgeResponseSchema>;

/**
 * Schema for statblock ranking entries.
 */
export const StatblockRankingSchema = z.object({
	id: z.string(),
	rank: z.number(),
	score: z.number(),
});

/**
 * Schema for judge statblocks responses.
 * Used when ranking multiple statblocks at once.
 */
export const JudgeStatblocksResponseSchema = z.object({
	rankings: z.array(StatblockRankingSchema),
	reasoning: z.string(),
});

export type JudgeStatblocksResponse = z.infer<
	typeof JudgeStatblocksResponseSchema
>;

// ============================================================================
// JSON Parsing Utilities
// ============================================================================

function findBalancedJsonObjectCandidates(text: string): string[] {
	const candidates: string[] = [];

	for (let start = 0; start < text.length; start++) {
		if (text[start] !== "{") continue;

		let depth = 0;
		let inString = false;
		let escaping = false;

		for (let i = start; i < text.length; i++) {
			const char = text[i];
			if (!char) continue;

			if (escaping) {
				escaping = false;
				continue;
			}

			if (char === "\\") {
				escaping = true;
				continue;
			}

			if (char === '"') {
				inString = !inString;
				continue;
			}

			if (inString) continue;

			if (char === "{") depth += 1;
			if (char === "}") {
				depth -= 1;
				if (depth === 0) {
					candidates.push(text.slice(start, i + 1));
					break;
				}
			}
		}
	}

	return candidates;
}

/**
 * Extracts and validates JSON from LLM text responses.
 *
 * @param text - Raw text response from LLM
 * @param schema - Zod schema to validate against
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed and validated object, or fallback on failure
 */
export function parseJsonResponse<T>(
	text: string,
	schema: z.ZodSchema<T>,
	fallback: T,
): { success: true; data: T } | { success: false; data: T; error: string } {
	const candidates = findBalancedJsonObjectCandidates(text);
	if (candidates.length === 0) {
		return {
			success: false,
			data: fallback,
			error: "No JSON object found in response",
		};
	}

	let lastParseError: string | null = null;
	let lastSchemaError: string | null = null;
	// Prefer schema errors over parse errors when reporting failure: once we have valid
	// JSON, a precise validation mismatch is usually more actionable than an earlier
	// candidate that failed to parse at all.

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);
			const result = schema.safeParse(parsed);

			if (result.success) {
				return { success: true, data: result.data };
			}

			lastSchemaError = result.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; ");
		} catch (e) {
			lastParseError = e instanceof Error ? e.message : String(e);
		}
	}

	// Keep schema failures higher priority here for the same reason: they tell us the
	// model produced parseable JSON, but not in the shape we asked for.
	if (lastSchemaError) {
		return {
			success: false,
			data: fallback,
			error: `Schema validation failed: ${lastSchemaError}`,
		};
	}

	return {
		success: false,
		data: fallback,
		error: `JSON parse error: ${lastParseError ?? "Unknown parse failure"}`,
	};
}
