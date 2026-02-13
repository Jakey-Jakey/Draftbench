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
 * Return the reasoning effort configured for a model in the given role.
 *
 * @param modelSlug - Model identifier to look up
 * @param role - Role to use when looking up settings (`"generators" | "reviewers" | "revisers"`)
 * @returns The `ReasoningEffort` for the specified model and role; defaults to `"high"` if not configured
 */
export function getEffort(
	modelSlug: string,
	role: "generators" | "reviewers" | "revisers",
): ReasoningEffort {
	return getCallSettings(modelSlug, role).effort;
}

/**
 * Produce call settings for a judge role from a role entry.
 *
 * @param judgeEntry - A role entry for a judge, optionally containing `effort` and `temperature`
 * @returns The call settings where `effort` is `judgeEntry.effort` if present, otherwise `"high"`, and `temperature` is copied from `judgeEntry` (may be undefined)
 */
export function getJudgeSettings(judgeEntry: RoleEntry): CallSettings {
	return {
		effort: judgeEntry.effort ?? "high",
		temperature: judgeEntry.temperature,
	};
}
