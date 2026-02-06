import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

import { getConfig, interpolate, type ReasoningEffort } from "./config";
import {
	JudgeStatblocksResponseSchema,
	PairwiseJudgeResponseSchema,
	parseJsonResponse,
	ThreeWayJudgeResponseSchema,
} from "./schemas";
import { withConcurrencyLimit } from "./semaphore";

// Model slug is now the identifier (OpenRouter format: "provider/model-name")
export type ModelSlug = string;

// Lazily initialize the OpenRouter provider to allow dry-run without a key
let openrouter: ReturnType<typeof createOpenRouter> | null = null;

function getOpenRouter() {
	if (!openrouter) {
		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			throw new Error(
				"OPENROUTER_API_KEY environment variable is required. Please set it before running the script.",
			);
		}
		openrouter = createOpenRouter({ apiKey });
	}
	return openrouter;
}

export interface GenerateResult {
	text: string;
	model: ModelSlug;
}

export interface ReviewResult {
	text: string;
	reviewer: ModelSlug;
	reviewed: ModelSlug;
}

export interface ReviseResult {
	text: string;
	model: ModelSlug;
}

/**
 * Generates a D&D 5e monster statblock using specified model slug.
 * @param modelSlug - OpenRouter model slug (e.g., "anthropic/claude-sonnet-4")
 * @param effort - Reasoning effort level
 * @param temperature - Optional temperature override
 */
export async function generateStatblock(
	modelSlug: ModelSlug,
	effort: ReasoningEffort = "high",
	temperature?: number,
): Promise<GenerateResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();

		const result = await generateText({
			model: getOpenRouter()(modelSlug),
			system: config.prompts.generate.system,
			prompt: config.prompts.generate.user,
			temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort },
				},
			},
		});

		return {
			text: result.text,
			model: modelSlug,
		};
	});
}

/**
 * Reviews a statblock using specified model slug.
 * @param reviewerSlug - OpenRouter model slug for the reviewer
 * @param reviewedSlug - OpenRouter model slug of the original generator (for tracking)
 * @param statblock - The statblock text to review
 * @param effort - Reasoning effort level
 * @param temperature - Optional temperature override
 */
export async function reviewStatblock(
	reviewerSlug: ModelSlug,
	reviewedSlug: ModelSlug,
	statblock: string,
	effort: ReasoningEffort = "medium",
	temperature?: number,
): Promise<ReviewResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();

		const prompt = interpolate(config.prompts.review.userTemplate, {
			statblock,
		});

		const result = await generateText({
			model: getOpenRouter()(reviewerSlug),
			system: config.prompts.review.system,
			prompt,
			temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort },
				},
			},
		});

		return {
			text: result.text,
			reviewer: reviewerSlug,
			reviewed: reviewedSlug,
		};
	});
}

/**
 * Revises a statblock based on feedback using specified model slug.
 * @param modelSlug - OpenRouter model slug for the reviser
 * @param originalStatblock - The original statblock text
 * @param feedback - Review feedback to incorporate
 * @param effort - Reasoning effort level
 * @param temperature - Optional temperature override
 */
export async function reviseStatblock(
	modelSlug: ModelSlug,
	originalStatblock: string,
	feedback: string,
	effort: ReasoningEffort = "high",
	temperature?: number,
): Promise<ReviseResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();

		const prompt = interpolate(config.prompts.revise.userTemplate, {
			statblock: originalStatblock,
			feedback,
		});

		const result = await generateText({
			model: getOpenRouter()(modelSlug),
			system: config.prompts.revise.system,
			prompt,
			temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort },
				},
			},
		});

		return {
			text: result.text,
			model: modelSlug,
		};
	});
}

export interface StatblockRanking {
	id: string; // Opaque ID
	rank: number;
	score: number;
}

export interface JudgeResult {
	judge: ModelSlug;
	rankings: StatblockRanking[];
	reasoning: string;
	raw: string;
}

function buildDeterministicRankings(ids: string[]): StatblockRanking[] {
	return ids.map((id, index) => ({
		id,
		rank: index + 1,
		score: Math.max(0, 100 - index),
	}));
}

function validateRankings(
	rankings: StatblockRanking[],
	expectedIds: string[],
): { valid: true } | { valid: false; error: string } {
	const expected = new Set(expectedIds);
	const seenIds = new Set<string>();
	const seenRanks = new Set<number>();
	const size = expectedIds.length;

	if (rankings.length !== size) {
		return {
			valid: false,
			error: `expected ${size} rankings, got ${rankings.length}`,
		};
	}

	for (const ranking of rankings) {
		if (!expected.has(ranking.id)) {
			return { valid: false, error: `unexpected id "${ranking.id}"` };
		}
		if (seenIds.has(ranking.id)) {
			return { valid: false, error: `duplicate id "${ranking.id}"` };
		}
		if (!Number.isInteger(ranking.rank)) {
			return {
				valid: false,
				error: `rank for "${ranking.id}" is not an integer`,
			};
		}
		if (ranking.rank < 1 || ranking.rank > size) {
			return {
				valid: false,
				error: `rank for "${ranking.id}" out of range: ${ranking.rank}`,
			};
		}
		if (seenRanks.has(ranking.rank)) {
			return { valid: false, error: `duplicate rank "${ranking.rank}"` };
		}

		seenIds.add(ranking.id);
		seenRanks.add(ranking.rank);
	}

	return { valid: true };
}

function isValidPairwiseWinner(
	winner: string,
	idA: string,
	idB: string,
): boolean {
	return winner === idA || winner === idB;
}

function isValidThreeWayRanking(
	first: string,
	second: string,
	third: string,
	idA: string,
	idB: string,
	idC: string,
): boolean {
	const expected = new Set([idA, idB, idC]);
	const received = [first, second, third];
	if (new Set(received).size !== 3) {
		return false;
	}
	return received.every((id) => expected.has(id));
}

/**
 * Judges all statblocks comparatively and returns rankings.
 * Statblocks are passed with anonymous IDs to prevent bias.
 * @param judgeSlug - OpenRouter model slug for the judge
 * @param statblocks - Map of anonymous IDs to statblock text
 * @param effort - Reasoning effort level
 * @param temperature - Optional temperature override
 */
export async function judgeStatblocks(
	judgeSlug: ModelSlug,
	statblocks: Map<string, string>,
	effort: ReasoningEffort = "high",
	temperature?: number,
): Promise<JudgeResult> {
	return withConcurrencyLimit(async () => {
		const statblockEntries = Array.from(statblocks.entries())
			.map(([id, text]) => `## Statblock ID: ${id}\n\n${text}`)
			.join("\n\n---\n\n");

		const allIds = Array.from(statblocks.keys());

		const result = await generateText({
			model: getOpenRouter()(judgeSlug),
			system: `You are an expert D&D 5e game designer judging monster statblocks. Compare ALL the statblocks provided and rank them from best to worst. Consider: mechanical balance, CR accuracy, thematic representation, 5e formatting, creativity, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
	"rankings": [
		{ "id": "statblock_id", "rank": 1, "score": 95 },
		{ "id": "statblock_id", "rank": 2, "score": 90 },
		... (include ALL ${allIds.length} statblocks)
	],
	"reasoning": "One sentence summary of your ranking decision."
}

Use scores from 0-100. IDs must exactly match the provided Statblock IDs: ${allIds.join(", ")}`,
			prompt: `Compare and rank ALL ${allIds.length} D&D 5e Doctor Doom statblocks:\n\n${statblockEntries}`,
			temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort },
				},
			},
		});

		// Parse and validate the JSON response
		const fallback = {
			rankings: buildDeterministicRankings(allIds),
			reasoning: "Failed to parse response",
		};
		const parseResult = parseJsonResponse(
			result.text,
			JudgeStatblocksResponseSchema,
			fallback,
		);
		if (!parseResult.success) {
			console.error(
				`Failed to parse judge response from ${judgeSlug}: ${parseResult.error}`,
			);
		}
		const parsed = parseResult.data;
		const rankingCheck = validateRankings(parsed.rankings, allIds);
		if (!rankingCheck.valid) {
			console.error(
				`Invalid ranking payload from ${judgeSlug}: ${rankingCheck.error}. Using deterministic fallback.`,
			);
		}

		return {
			judge: judgeSlug,
			rankings: rankingCheck.valid ? parsed.rankings : fallback.rankings,
			reasoning: parsed.reasoning,
			raw: result.text,
		};
	});
}

export interface PairwiseResult {
	winner: string;
	loser: string;
	reasoning: string;
	judge: ModelSlug;
}

/**
 * Pairwise comparison of two statblocks.
 * Returns the winner ID, reasoning, and which judge was used.
 * @param idA - Anonymous ID for first statblock
 * @param textA - Text of first statblock
 * @param idB - Anonymous ID for second statblock
 * @param textB - Text of second statblock
 * @param judgeSlug - OpenRouter model slug for the judge
 * @param effort - Reasoning effort level
 * @param temperature - Optional temperature override
 */
export async function pairwiseJudge(
	idA: string,
	textA: string,
	idB: string,
	textB: string,
	judgeSlug: ModelSlug,
	effort: ReasoningEffort = "low",
	temperature?: number,
): Promise<PairwiseResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();

		const systemPrompt = interpolate(config.prompts.judgePairwise.system, {
			idA,
			idB,
		});
		const userPrompt = interpolate(config.prompts.judgePairwise.userTemplate, {
			idA,
			idB,
			textA,
			textB,
		});

		const result = await generateText({
			model: getOpenRouter()(judgeSlug),
			system: systemPrompt,
			prompt: userPrompt,
			temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort },
				},
			},
		});

		// Parse and validate the JSON response
		// Deterministic fallback preserves reproducibility; callers randomize S1/S2 order.
		const fallback = {
			winner: idA,
			reasoning: "Failed to parse response, defaulted to first statblock.",
		};
		const parseResult = parseJsonResponse(
			result.text,
			PairwiseJudgeResponseSchema,
			fallback,
		);
		if (!parseResult.success) {
			console.error(
				`Failed to parse pairwise judge response (${judgeSlug}): ${parseResult.error}`,
			);
		}
		const parsed = parseResult.data;
		const validWinner = isValidPairwiseWinner(parsed.winner, idA, idB);
		if (!validWinner) {
			console.error(
				`Invalid pairwise winner from ${judgeSlug}: "${parsed.winner}". Expected ${idA} or ${idB}. Using fallback.`,
			);
		}
		const winner = validWinner ? parsed.winner : idA;

		return {
			winner,
			loser: winner === idA ? idB : idA,
			reasoning: parsed.reasoning,
			judge: judgeSlug,
		};
	});
}

export interface ThreeWayResult {
	first: string;
	second: string;
	third: string;
	reasoning: string;
}

/**
 * Three-way comparison of statblocks.
 * Returns 1st, 2nd, 3rd place rankings with reasoning.
 * @param idA - Anonymous ID for first statblock
 * @param textA - Text of first statblock
 * @param idB - Anonymous ID for second statblock
 * @param textB - Text of second statblock
 * @param idC - Anonymous ID for third statblock
 * @param textC - Text of third statblock
 * @param judgeSlug - OpenRouter model slug for the judge
 * @param effort - Reasoning effort level
 * @param temperature - Optional temperature override
 */
export async function threeWayJudge(
	idA: string,
	textA: string,
	idB: string,
	textB: string,
	idC: string,
	textC: string,
	judgeSlug: ModelSlug,
	effort: ReasoningEffort = "low",
	temperature?: number,
): Promise<ThreeWayResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();

		const systemPrompt = interpolate(config.prompts.judgeThreeWay.system, {
			idA,
			idB,
			idC,
		});
		const userPrompt = interpolate(config.prompts.judgeThreeWay.userTemplate, {
			idA,
			idB,
			idC,
			textA,
			textB,
			textC,
		});

		const result = await generateText({
			model: getOpenRouter()(judgeSlug),
			system: systemPrompt,
			prompt: userPrompt,
			temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort },
				},
			},
		});

		// Parse and validate the JSON response
		// Deterministic fallback preserves reproducibility; callers randomize S1/S2/S3 order.
		const fallback = {
			first: idA,
			second: idB,
			third: idC,
			reasoning: "Failed to parse response, defaulted to original order.",
		};
		const parseResult = parseJsonResponse(
			result.text,
			ThreeWayJudgeResponseSchema,
			fallback,
		);
		if (!parseResult.success) {
			console.error(
				`Failed to parse three-way judge response: ${parseResult.error}`,
			);
		}
		const parsed = parseResult.data;
		if (
			!isValidThreeWayRanking(
				parsed.first,
				parsed.second,
				parsed.third,
				idA,
				idB,
				idC,
			)
		) {
			console.error(
				`Invalid three-way ranking from ${judgeSlug}: [${parsed.first}, ${parsed.second}, ${parsed.third}]. Using fallback.`,
			);
			return fallback;
		}

		return parsed;
	});
}
