import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

// Model IDs - 3 models being tested
export const MODELS = {
  claude: "anthropic/claude-4.5-opus:thinking:high",
  gpt: "openai/gpt-5.2-xhigh",
  gemini: "google/gemini-3.0-pro:high",
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

/**
 * Generates a D&D 5e monster statblock for Doctor Doom using specified model.
 */
export async function generateStatblock(model: ModelName): Promise<GenerateResult> {
  const result = await generateText({
    model: openrouter(MODELS[model]),
    system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Create detailed, balanced monster statblocks that follow official 5e formatting conventions. Include all standard statblock components: size/type/alignment, AC, HP, speed, ability scores, saving throws, skills, damage immunities/resistances/vulnerabilities, senses, languages, challenge rating, and special abilities/actions.`,
    prompt: `Create a D&D 5e monster statblock for Doctor Doom (Marvel Comics). This should be a powerful villain suitable for high-level play.`,
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
    system: `You are an expert D&D 5e game designer and balance consultant. Review the monster statblock provided and give constructive feedback on: mechanical balance, CR accuracy, thematic representation of the character, adherence to 5e formatting conventions, action economy, and potential gameplay issues. Be thorough but constructive.`,
    prompt: `Please review the following D&D 5e monster statblock and provide detailed feedback:\n\n${statblock}`,
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
    system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Revise the provided monster statblock based on the feedback given, while maintaining the core character concept and improving balance and mechanics.`,
    prompt: `Original statblock:\n${originalStatblock}\n\nReview feedback:\n${feedback}\n\nPlease revise the statblock based on the feedback above.`,
  });

  return {
    text: result.text,
    model,
  };
}

export interface StatblockRanking {
  id: string; // format: "generator_reviewer" e.g., "claude_gpt"
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
 * Judges all 9 statblocks comparatively and returns rankings.
 * Each statblock is identified as "generator_reviewer" (e.g., claude_gpt = claude's statblock revised by gpt's feedback)
 */
export async function judgeStatblocks(
  judge: ModelName,
  statblocks: Map<string, string> // key format: "generator_reviewer"
): Promise<JudgeResult> {
  const statblockEntries = Array.from(statblocks.entries())
    .map(([id, text]) => `## Statblock: ${id}\n(Generator's statblock revised by reviewer's feedback)\n\n${text}`)
    .join("\n\n---\n\n");

  const allIds = Array.from(statblocks.keys());

  const result = await generateText({
    model: openrouter(MODELS[judge]),
    system: `You are an expert D&D 5e game designer judging monster statblocks. Compare ALL the statblocks provided and rank them from best to worst. Consider: mechanical balance, CR accuracy, thematic representation, 5e formatting, creativity, and playability.

Each statblock ID is in format "generator_reviewer" meaning the generator model's statblock revised based on the reviewer model's feedback.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "rankings": [
    { "id": "generator_reviewer", "rank": 1, "score": 95 },
    { "id": "generator_reviewer", "rank": 2, "score": 90 },
    ... (include ALL ${allIds.length} statblocks)
  ],
  "reasoning": "Brief explanation of your ranking decision"
}

Use scores from 0-100. IDs must exactly match: ${allIds.join(", ")}`,
    prompt: `Compare and rank ALL ${allIds.length} D&D 5e Doctor Doom statblocks:\n\n${statblockEntries}`,
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
