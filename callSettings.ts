import { getRoleEntries, type ReasoningEffort, type RoleEntry } from "./config";

export type Phase = "generate" | "review" | "revise" | "judge";

/** Settings for an LLM call */
export interface CallSettings {
	effort: ReasoningEffort;
	temperature?: number;
}

/**
 * Gets call settings for a model in a specific role.
 * Uses the role-centric configuration to find the effort and temperature.
 */
export function getCallSettings(
	modelSlug: string,
	role: "generators" | "reviewers" | "revisers",
): CallSettings {
	const entries = getRoleEntries(role);
	const entry = entries.find((e) => e.model === modelSlug);

	return {
		effort: entry?.effort ?? "high",
		temperature: entry?.temperature,
	};
}

/**
 * Gets the reasoning effort for a model in a specific role.
 * Convenience wrapper around getCallSettings.
 */
export function getEffort(
	modelSlug: string,
	role: "generators" | "reviewers" | "revisers",
): ReasoningEffort {
	return getCallSettings(modelSlug, role).effort;
}

/**
 * Gets call settings for a judge (swiss or playoff).
 */
export function getJudgeSettings(judgeEntry: RoleEntry): CallSettings {
	return {
		effort: judgeEntry.effort ?? "high",
		temperature: judgeEntry.temperature,
	};
}
