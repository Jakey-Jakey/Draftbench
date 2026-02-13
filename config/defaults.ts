import type { PipelineConfig } from "./types";

export const DEFAULT_CONFIG: PipelineConfig = {
	roles: {
		generators: [
			{ model: "openai/gpt-5.2", effort: "high" },
			{ model: "anthropic/claude-opus-4.5", effort: "high" },
			{ model: "google/gemini-3-pro-preview", effort: "high" },
		],
		reviewers: [
			{ model: "openai/gpt-5.2", effort: "high" },
			{ model: "anthropic/claude-opus-4.5", effort: "high" },
			{ model: "google/gemini-3-pro-preview", effort: "high" },
		],
		revisers: [
			{ model: "openai/gpt-5.2", effort: "high" },
			{ model: "anthropic/claude-opus-4.5", effort: "high" },
			{ model: "google/gemini-3-pro-preview", effort: "high" },
		],
		swissJudges: [{ model: "anthropic/claude-opus-4.5", effort: "low" }],
		finaleJudges: [
			{ model: "anthropic/claude-opus-4.5", effort: "low" },
			{ model: "openai/gpt-5.2", effort: "medium" },
		],
	},
	tournament: {
		swissRounds: 7,
		initialGenerations: 1,
		swissFormat: "1v1v1",
		initialLeaderboard: {
			enabled: false,
		},
		rating: {
			enabled: true,
			backend: "elo",
			kFactor: 24,
			initialRating: 1000,
			provisionalMatches: 5,
			tieValue: 0.5,
			btIterations: 200,
			btTolerance: 1e-6,
			ciBootstrapSamples: 200,
		},
		scheduling: {
			mode: "adaptive",
			exploration: 0.15,
			avoidRepeatPenalty: 0.35,
			maxRepeatPairs: 2,
		},
		stopRules: {
			enabled: true,
			minBatches: 3,
			maxBatches: 7,
			topK: 8,
			minSeparation: 65,
			confidence: 0.9,
			stabilityBatches: 2,
		},
		finale: {
			enabled: true,
			maxMatchesPerBatch: 4,
			maxTotalMatches: 30,
			targetWinProb: 0.5,
			confidence: 0.9,
			minSeparation: 0,
			allowOverRepeatCap: false,
		},
	},
	output: {
		runsDirectory: "runs",
	},
	prompts: {
		generate: {
			system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Create well constructed monster statblocks that follow official 5e formatting conventions. Include all standard statblock components: size/type/alignment, AC, HP, speed, ability scores, saving throws, skills, damage immunities/resistances/vulnerabilities, senses, languages, challenge rating, and special abilities/actions.`,
			user: `Create a D&D 5e monster statblock for Doctor Doom (Marvel Comics). This should be a powerful villain suitable for high-level play. Output only the statblock without commentary.`,
		},
		review: {
			system: `You are an expert D&D 5e game designer and balance consultant. Review the monster statblock provided and give constructive feedback on: mechanical balance, CR accuracy, thematic representation of the character, adherence to 5e formatting conventions, action economy, and potential gameplay issues. Be thorough but constructive. Focus on actionable improvements.`,
			userTemplate: `Please review the following D&D 5e monster statblock and provide feedback:\n\n{statblock}`,
		},
		revise: {
			system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Revise the provided monster statblock based on the feedback given.`,
			userTemplate: `Original statblock:\n{statblock}\n\nReview feedback:\n{feedback}\n\nPlease revise the statblock based on the feedback above. Output only the revised statblock without commentary.`,
		},
		judgePairwise: {
			system: `You are an expert D&D 5e game designer. Compare the two statblocks and pick the better one based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "winner": "ID of the better statblock",
  "reasoning": "One sentence explaining why."
}

The IDs are: "{idA}" and "{idB}". Pick exactly one winner.`,
			userTemplate: `Compare these two D&D 5e statblocks:

## Statblock: {idA}

{textA}

---

## Statblock: {idB}

{textB}`,
		},
		judgeThreeWay: {
			system: `You are an expert D&D 5e game designer. Compare the three statblocks and rank them from best to worst based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "first": "ID of the best statblock",
  "second": "ID of the second-best statblock",
  "third": "ID of the worst statblock",
  "reasoning": "One sentence explaining the ranking."
}

The IDs are: "{idA}", "{idB}", "{idC}". Rank all three.`,
			userTemplate: `Compare and rank these three D&D 5e statblocks:

## Statblock: {idA}

{textA}

---

## Statblock: {idB}

{textB}

---

## Statblock: {idC}

{textC}`,
		},
	},
};
