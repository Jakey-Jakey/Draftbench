import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { getCallSettings, type Phase } from "./callSettings";
import {
	getConfig,
	interpolate,
	type ModelName,
	type ReasoningEffort,
} from "./config";
import {
	JudgeStatblocksResponseSchema,
	PairwiseJudgeResponseSchema,
	parseJsonResponse,
	ThreeWayJudgeResponseSchema,
} from "./schemas";
import { withConcurrencyLimit } from "./semaphore";

// Re-export ModelName type
export type { ModelName } from "./config";

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

/**
 * Get the model slug map from config.
 * This is called dynamically to support runtime config loading.
 */
export function getModels(): Record<string, string> {
	const config = getConfig();
	return Object.fromEntries(
		Object.entries(config.models).map(([key, value]) => [key, value.slug]),
	);
}

/**
 * Legacy MODELS export for backwards compatibility.
 * @deprecated Use getModels() instead
 */
export const MODELS = new Proxy({} as Record<string, string>, {
	get(_, prop: string) {
		return getModels()[prop];
	},
	ownKeys() {
		return Object.keys(getModels());
	},
	getOwnPropertyDescriptor() {
		return { enumerable: true, configurable: true };
	},
});

export interface GenerateResult {
	text: string;
	model: ModelName;
}

export interface ReviewResult {
	text: string;
	reviewer: ModelName;
	reviewed: ModelName;
}

export interface ReviseResult {
	text: string;
	model: ModelName;
}

function getReasoningConfig(model: ModelName, phase: Phase = "generate") {
	const settings = getCallSettings(model, phase);
	return { effort: settings.effort ?? "high" };
}

/**
 * Generates a D&D 5e monster statblock using specified model.
 */
export async function generateStatblock(
	model: ModelName,
): Promise<GenerateResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();
		const modelSlug = config.models[model]?.slug;
		if (!modelSlug) {
			throw new Error(`Unknown model: ${model} `);
		}

		const settings = getCallSettings(model, "generate");
		const result = await generateText({
			model: getOpenRouter()(modelSlug),
			system: config.prompts.generate.system,
			prompt: config.prompts.generate.user,
			temperature: settings.temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort: settings.effort ?? "high" },
				},
			},
		});

		return {
			text: result.text,
			model,
		};
	});
}

/**
 * Reviews a statblock using specified model.
 */
export async function reviewStatblock(
	reviewer: ModelName,
	reviewed: ModelName,
	statblock: string,
): Promise<ReviewResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();
		const modelSlug = config.models[reviewer]?.slug;
		if (!modelSlug) {
			throw new Error(`Unknown model: ${reviewer} `);
		}

		const prompt = interpolate(config.prompts.review.userTemplate, {
			statblock,
		});
		const settings = getCallSettings(reviewer, "review");

		const result = await generateText({
			model: getOpenRouter()(modelSlug),
			system: config.prompts.review.system,
			prompt,
			temperature: settings.temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort: settings.effort ?? "high" },
				},
			},
		});

		return {
			text: result.text,
			reviewer,
			reviewed,
		};
	});
}

/**
 * Revises a statblock based on feedback using specified model.
 */
export async function reviseStatblock(
	model: ModelName,
	originalStatblock: string,
	feedback: string,
): Promise<ReviseResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();
		const modelSlug = config.models[model]?.slug;
		if (!modelSlug) {
			throw new Error(`Unknown model: ${model} `);
		}

		const prompt = interpolate(config.prompts.revise.userTemplate, {
			statblock: originalStatblock,
			feedback,
		});
		const settings = getCallSettings(model, "revise");

		const result = await generateText({
			model: getOpenRouter()(modelSlug),
			system: config.prompts.revise.system,
			prompt,
			temperature: settings.temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort: settings.effort ?? "high" },
				},
			},
		});

		return {
			text: result.text,
			model,
		};
	});
}

export interface StatblockRanking {
	id: string; // Opaque ID
	rank: number;
	score: number;
}

export interface JudgeResult {
	judge: ModelName;
	rankings: StatblockRanking[];
	reasoning: string;
	raw: string;
}

/**
 * Judges all statblocks comparatively and returns rankings.
 * Statblocks are passed with anonymous IDs to prevent bias.
 */
export async function judgeStatblocks(
	judge: ModelName,
	statblocks: Map<string, string>,
): Promise<JudgeResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();
		const modelSlug = config.models[judge]?.slug;
		if (!modelSlug) {
			throw new Error(`Unknown model: ${judge} `);
		}

		const statblockEntries = Array.from(statblocks.entries())
			.map(([id, text]) => `## Statblock ID: ${id} \n\n${text} `)
			.join("\n\n---\n\n");

		const allIds = Array.from(statblocks.keys());
		const settings = getCallSettings(judge, "judge");

		const result = await generateText({
			model: getOpenRouter()(modelSlug),
			system: `You are an expert D & D 5e game designer judging monster statblocks.Compare ALL the statblocks provided and rank them from best to worst.Consider: mechanical balance, CR accuracy, thematic representation, 5e formatting, creativity, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
	"rankings": [
		{ "id": "statblock_id", "rank": 1, "score": 95 },
		{ "id": "statblock_id", "rank": 2, "score": 90 },
		... (include ALL ${allIds.length} statblocks)
	],
		"reasoning": "One sentence summary of your ranking decision."
}

Use scores from 0 - 100. IDs must exactly match the provided Statblock IDs: ${allIds.join(", ")} `,
			prompt: `Compare and rank ALL ${allIds.length} D & D 5e Doctor Doom statblocks: \n\n${statblockEntries} `,
			temperature: settings.temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort: settings.effort ?? "high" },
				},
			},
		});

		// Parse and validate the JSON response
		const fallback = {
			rankings: allIds.map((id, i) => ({ id, rank: i + 1, score: 50 })),
			reasoning: "Failed to parse response",
		};
		const parseResult = parseJsonResponse(
			result.text,
			JudgeStatblocksResponseSchema,
			fallback,
		);
		if (!parseResult.success) {
			console.error(
				`Failed to parse judge response from ${judge}: ${parseResult.error} `,
			);
		}
		const parsed = parseResult.data;

		return {
			judge,
			rankings: parsed.rankings,
			reasoning: parsed.reasoning,
			raw: result.text,
		};
	});
}

export interface PairwiseResult {
	winner: string;
	loser: string;
	reasoning: string;
	judge: ModelName;
}

/**
 * Pairwise comparison of two statblocks.
 * Returns the winner ID, reasoning, and which judge was used.
 * @param judge - Which model to use as judge (default: claude)
 * @param effort - Reasoning effort level (default: from callSettings)
 */
export async function pairwiseJudge(
	idA: string,
	textA: string,
	idB: string,
	textB: string,
	judge: ModelName = "claude",
	effort?: ReasoningEffort,
): Promise<PairwiseResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();
		const modelSlug = config.models[judge]?.slug;
		if (!modelSlug) {
			throw new Error(`Unknown model: ${judge} `);
		}

		const settings = getCallSettings(judge, "judge");
		const reasoningEffort = effort ?? settings.effort ?? "high";

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
			model: getOpenRouter()(modelSlug),
			system: systemPrompt,
			prompt: userPrompt,
			temperature: settings.temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort: reasoningEffort },
				},
			},
		});

		// Parse and validate the JSON response
		const fallback = {
			winner: Math.random() > 0.5 ? idA : idB,
			reasoning: "Failed to parse response, random selection.",
		};
		const parseResult = parseJsonResponse(
			result.text,
			PairwiseJudgeResponseSchema,
			fallback,
		);
		if (!parseResult.success) {
			console.error(
				`Failed to parse pairwise judge response(${judge}): ${parseResult.error} `,
			);
		}
		const parsed = parseResult.data;

		return {
			winner: parsed.winner,
			loser: parsed.winner === idA ? idB : idA,
			reasoning: parsed.reasoning,
			judge,
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
 * Three-way comparison of statblocks. Uses the first configured model
 * and its reasoning effort (unless overridden).
 * Returns 1st, 2nd, 3rd place rankings with reasoning.
 */
export async function threeWayJudge(
	idA: string,
	textA: string,
	idB: string,
	textB: string,
	idC: string,
	textC: string,
	judge: ModelName | null = null,
	effort?: ReasoningEffort,
): Promise<ThreeWayResult> {
	return withConcurrencyLimit(async () => {
		const config = getConfig();
		const modelKeys = Object.keys(config.models);
		if (modelKeys.length === 0) {
			throw new Error("No models configured");
		}
		const judgeModel = judge ?? modelKeys[0]!;
		const modelSlug = config.models[judgeModel]?.slug;
		if (!modelSlug) {
			throw new Error("No models configured");
		}

		const settings = getCallSettings(judgeModel, "judge");
		const reasoningEffort = effort ?? settings.effort ?? "high";

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
			model: getOpenRouter()(modelSlug),
			system: systemPrompt,
			prompt: userPrompt,
			temperature: settings.temperature,
			providerOptions: {
				openrouter: {
					reasoning: { effort: reasoningEffort },
				},
			},
		});

		// Parse and validate the JSON response
		const ids = [idA, idB, idC].sort(() => Math.random() - 0.5);
		const fallback = {
			first: ids[0]!,
			second: ids[1]!,
			third: ids[2]!,
			reasoning: "Failed to parse response, random selection.",
		};
		const parseResult = parseJsonResponse(
			result.text,
			ThreeWayJudgeResponseSchema,
			fallback,
		);
		if (!parseResult.success) {
			console.error(
				`Failed to parse three - way judge response: ${parseResult.error} `,
			);
		}
		const parsed = parseResult.data;

		return parsed;
	});
}
