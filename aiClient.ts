import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

// Model IDs - 3 models being tested
export const MODELS = {
  claude: "anthropic/claude-4.5-opus",
  gpt: "openai/gpt-5.2",
  gemini: "google/gemini-3-pro-preview",
} as const;

export type ModelName = keyof typeof MODELS;

// Initialize the OpenRouter provider
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error(
    "OPENROUTER_API_KEY environment variable is required. Please set it before running the script."
  );
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
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

function getReasoningConfig(model: ModelName) {
  switch (model) {
    case "claude":
      // Claude models use reasoning effort or max_tokens. 
      // Mapping 'thinking:high' to high effort.
      return { effort: "high" };
    case "gpt":
      // GPT models (gpt-5.2) support reasoning effort.
      // Mapping 'xhigh' to xhigh effort.
      return { effort: "high" };
    case "gemini":
      // Gemini models support reasoning.
      // Mapping 'high' to high effort.
      return { effort: "high" };
  }
}

/**
 * Generates a D&D 5e monster statblock for Doctor Doom using specified model.
 */
export async function generateStatblock(model: ModelName): Promise<GenerateResult> {
  const result = await generateText({
    model: openrouter(MODELS[model]),
    system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Create well constructedmonster statblocks that follow official 5e formatting conventions. Include all standard statblock components: size/type/alignment, AC, HP, speed, ability scores, saving throws, skills, damage immunities/resistances/vulnerabilities, senses, languages, challenge rating, and special abilities/actions.`,
    prompt: `Create a D&D 5e monster statblock for Doctor Doom (Marvel Comics). This should be a powerful villain suitable for high-level play. Output only the statblock without commentary.`,
    providerOptions: {
      openrouter: {
        reasoning: getReasoningConfig(model),
      },
    },
  });

  return {
    text: result.text,
    model,
  };
}

/**
 * Reviews a statblock using specified model.
 */
export async function reviewStatblock(
  reviewer: ModelName,
  reviewed: ModelName,
  statblock: string
): Promise<ReviewResult> {
  const result = await generateText({
    model: openrouter(MODELS[reviewer]),
    system: `You are an expert D&D 5e game designer and balance consultant. Review the monster statblock provided and give constructive feedback on: mechanical balance, CR accuracy, thematic representation of the character, adherence to 5e formatting conventions, action economy, and potential gameplay issues. Be thorough but constructive. Focus on actionable improvements.`,
    prompt: `Please review the following D&D 5e monster statblock and provide feedback:\n\n${statblock}`,
    providerOptions: {
      openrouter: {
        reasoning: getReasoningConfig(reviewer),
      },
    },
  });

  return {
    text: result.text,
    reviewer,
    reviewed,
  };
}

/**
 * Revises a statblock based on feedback using specified model.
 */
export async function reviseStatblock(
  model: ModelName,
  originalStatblock: string,
  feedback: string
): Promise<ReviseResult> {
  const result = await generateText({
    model: openrouter(MODELS[model]),
    system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Revise the provided monster statblock based on the feedback given.`,
    prompt: `Original statblock:\n${originalStatblock}\n\nReview feedback:\n${feedback}\n\nPlease revise the statblock based on the feedback above. Output only the revised statblock without commentary.`,
    providerOptions: {
      openrouter: {
        reasoning: getReasoningConfig(model),
      },
    },
  });

  return {
    text: result.text,
    model,
  };
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
  statblocks: Map<string, string>
): Promise<JudgeResult> {
  const statblockEntries = Array.from(statblocks.entries())
    .map(([id, text]) => `## Statblock ID: ${id}\n\n${text}`)
    .join("\n\n---\n\n");

  const allIds = Array.from(statblocks.keys());

  const result = await generateText({
    model: openrouter(MODELS[judge]),
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
    providerOptions: {
      openrouter: {
        reasoning: getReasoningConfig(judge),
      },
    },
  });

  // Parse the JSON response
  let parsed: { rankings: StatblockRanking[]; reasoning: string };
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`Failed to parse judge response from ${judge}:`, e);
    // Return a fallback with equal scores
    parsed = {
      rankings: allIds.map((id, i) => ({ id, rank: i + 1, score: 50 })),
      reasoning: "Failed to parse response",
    };
  }

  return {
    judge,
    rankings: parsed.rankings,
    reasoning: parsed.reasoning,
    raw: result.text,
  };
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
 * @param effort - Reasoning effort level (default: low)
 */
export async function pairwiseJudge(
  idA: string,
  textA: string,
  idB: string,
  textB: string,
  judge: ModelName = "claude",
  effort: "low" | "medium" | "high" = "low"
): Promise<PairwiseResult> {
  const result = await generateText({
    model: openrouter(MODELS[judge]),
    system: `You are an expert D&D 5e game designer. Compare the two statblocks and pick the better one based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "winner": "ID of the better statblock",
  "reasoning": "One sentence explaining why."
}

The IDs are: "${idA}" and "${idB}". Pick exactly one winner.`,
    prompt: `Compare these two D&D 5e Doctor Doom statblocks:

## Statblock: ${idA}

${textA}

---

## Statblock: ${idB}

${textB}`,
    providerOptions: {
      openrouter: {
        reasoning: { effort },
      },
    },
  });

  // Parse the JSON response
  let parsed: { winner: string; reasoning: string };
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`Failed to parse pairwise judge response (${judge}):`, e);
    // Fallback: random winner
    parsed = {
      winner: Math.random() > 0.5 ? idA : idB,
      reasoning: "Failed to parse response, random selection.",
    };
  }

  return {
    winner: parsed.winner,
    loser: parsed.winner === idA ? idB : idA,
    reasoning: parsed.reasoning,
    judge,
  };
}

export interface ThreeWayResult {
  first: string;
  second: string;
  third: string;
  reasoning: string;
}

/**
 * Three-way comparison of statblocks. Claude Opus 4.5 only (low thinking).
 * Returns 1st, 2nd, 3rd place rankings with reasoning.
 */
export async function threeWayJudge(
  idA: string,
  textA: string,
  idB: string,
  textB: string,
  idC: string,
  textC: string
): Promise<ThreeWayResult> {
  const result = await generateText({
    model: openrouter(MODELS.claude),
    system: `You are an expert D&D 5e game designer. Compare the three statblocks and rank them from best to worst based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "first": "ID of the best statblock",
  "second": "ID of the second-best statblock",
  "third": "ID of the worst statblock",
  "reasoning": "One sentence explaining the ranking."
}

The IDs are: "${idA}", "${idB}", "${idC}". Rank all three.`,
    prompt: `Compare and rank these three D&D 5e Doctor Doom statblocks:

## Statblock: ${idA}

${textA}

---

## Statblock: ${idB}

${textB}

---

## Statblock: ${idC}

${textC}`,
    providerOptions: {
      openrouter: {
        reasoning: { effort: "low" },
      },
    },
  });

  // Parse the JSON response
  let parsed: { first: string; second: string; third: string; reasoning: string };
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`Failed to parse three-way judge response:`, e);
    // Fallback: random ordering
    const ids = [idA, idB, idC].sort(() => Math.random() - 0.5);
    parsed = {
      first: ids[0]!,
      second: ids[1]!,
      third: ids[2]!,
      reasoning: "Failed to parse response, random selection.",
    };
  }

  return parsed;
}
