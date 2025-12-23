import { z } from "zod";

// ============================================================================
// LLM Response Schemas
// ============================================================================

/**
 * Schema for pairwise judge responses.
 * Used in playoff matches and initial leaderboard comparisons.
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
	try {
		// Extract JSON from text (LLMs may include extra text before/after)
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			return {
				success: false,
				data: fallback,
				error: "No JSON object found in response",
			};
		}

		const parsed = JSON.parse(jsonMatch[0]);
		const result = schema.safeParse(parsed);

		if (result.success) {
			return { success: true, data: result.data };
		} else {
			const errorMessage = result.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; ");
			return {
				success: false,
				data: fallback,
				error: `Schema validation failed: ${errorMessage}`,
			};
		}
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		return {
			success: false,
			data: fallback,
			error: `JSON parse error: ${errorMessage}`,
		};
	}
}
