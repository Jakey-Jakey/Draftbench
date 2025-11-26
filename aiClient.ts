import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

// Model IDs - easily changeable constants
const ESSAY_MODEL = "anthropic/claude-opus-4.5";
const REVIEW_MODEL = "moonshotai/kimi-k2-thinking";

// Initialize the OpenRouter provider
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error(
    "OPENROUTER_API_KEY environment variable is required. Please set it before running the script."
  );
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export interface EssayResult {
  text: string;
}

export interface ReviewResult {
  text: string;
}

export interface RevisionResult {
  text: string;
}

/**
 * Generates an essay based on the given topic prompt.
 */
export async function generateEssay(topic: string): Promise<EssayResult> {
  const result = await generateText({
    model: openrouter(ESSAY_MODEL),
    system: `You are an expert essay writer. Write a well-structured, thoughtful essay on the given topic. 
The essay should be clear, engaging, and demonstrate strong writing skills.`,
    prompt: `Write an essay on the following topic:\n\n${topic}`,
  });

  return {
    text: result.text,
  };
}

/**
 * Reviews an essay and provides constructive feedback.
 */
export async function reviewEssay(essay: string): Promise<ReviewResult> {
  const result = await generateText({
    model: openrouter(REVIEW_MODEL),
    system: `You are an expert writing tutor and editor. Review the essay provided and give constructive, 
specific feedback on areas such as structure, clarity, argumentation, style, and areas for improvement. 
Be thorough but encouraging.`,
    prompt: `Please review the following essay and provide detailed feedback:\n\n${essay}`,
  });

  return {
    text: result.text,
  };
}

/**
 * Revises an essay based on the original topic, original essay, and review feedback.
 */
export async function reviseEssay(
  topic: string,
  originalEssay: string,
  feedback: string
): Promise<RevisionResult> {
  const result = await generateText({
    model: openrouter(ESSAY_MODEL),
    system: `You are an expert essay writer. Revise the provided essay based on the feedback given, 
while maintaining the core message and improving the areas identified.`,
    prompt: `Original topic: ${topic}\n\nOriginal essay:\n${originalEssay}\n\nReview feedback:\n${feedback}\n\nPlease revise the essay based on the feedback above.`,
  });

  return {
    text: result.text,
  };
}
