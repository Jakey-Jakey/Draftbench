import { getConfig, type PhaseSettings, type ReasoningEffort } from "./config";

export type Phase = "generate" | "review" | "revise" | "judge";

/**
 * Resolves call settings for a specific model and phase.
 * Resolution order (highest priority first):
 * 1. models[model].phases[phase] (model-specific phase override)
 * 2. models[model].reasoningEffort / temperature (model defaults)
 * 3. Fallback: effort = "high"
 */
export function getCallSettings(model: string, phase: Phase): PhaseSettings {
	const config = getConfig();
	const modelConfig = config.models[model];

	// Start with model defaults
	const result: PhaseSettings = {
		effort: modelConfig?.reasoningEffort ?? "high",
		temperature: modelConfig?.temperature,
	};

	// Check model's phase-specific override (highest priority)
	const phaseOverride = modelConfig?.phases?.[phase];
	if (phaseOverride) {
		result.effort = phaseOverride.effort ?? result.effort;
		result.temperature = phaseOverride.temperature ?? result.temperature;
	}

	return result;
}

/**
 * Gets the reasoning effort for a model and phase.
 * Convenience wrapper around getCallSettings.
 */
export function getEffort(model: string, phase: Phase): ReasoningEffort {
	return getCallSettings(model, phase).effort ?? "high";
}
