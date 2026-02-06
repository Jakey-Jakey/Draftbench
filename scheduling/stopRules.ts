import type { RatingStanding } from "../rating/types";

export interface StopRulesConfig {
	enabled: boolean;
	minBatches: number;
	maxBatches: number;
	topK: number;
	minSeparation: number;
	confidence: number;
	stabilityBatches: number;
	budgetMaxCalls?: number;
}

export interface StopRuleContext {
	round: number;
	totalCalls: number;
	standings: RatingStanding[];
	topKHistory: string[][];
}

export interface StopRuleResult {
	shouldStop: boolean;
	reason: string;
	kind:
		| "disabled"
		| "budget_reached"
		| "max_batches"
		| "below_min_batches"
		| "topk_unstable"
		| "stable_not_separated"
		| "stable_separated";
	details?: {
		topK: number;
		boundaryLeftId?: string;
		boundaryRightId?: string;
		separation?: number;
		leftLow?: number;
		rightHigh?: number;
	};
}

function confidenceMultiplier(confidence: number): number {
	if (confidence >= 0.99) return 2.58;
	if (confidence >= 0.95) return 1.96;
	if (confidence >= 0.9) return 1.64;
	if (confidence >= 0.8) return 1.28;
	return 1.0;
}

function isStableTopK(
	topKHistory: string[][],
	stabilityBatches: number,
): boolean {
	if (stabilityBatches <= 1) return true;
	if (topKHistory.length < stabilityBatches) return false;

	const recent = topKHistory.slice(-stabilityBatches);
	const first = recent[0]?.join("|");
	if (!first) return false;
	return recent.every((entry) => entry.join("|") === first);
}

export function evaluateStopRules(
	context: StopRuleContext,
	config: StopRulesConfig,
): StopRuleResult {
	if (!config.enabled) {
		return {
			shouldStop: false,
			reason: "stop rules disabled",
			kind: "disabled",
		};
	}

	if (
		typeof config.budgetMaxCalls === "number" &&
		context.totalCalls >= config.budgetMaxCalls
	) {
		return {
			shouldStop: true,
			reason: "budget max calls reached",
			kind: "budget_reached",
		};
	}

	if (context.round >= config.maxBatches) {
		return {
			shouldStop: true,
			reason: "max batches reached",
			kind: "max_batches",
		};
	}

	if (context.round < config.minBatches) {
		return {
			shouldStop: false,
			reason: "below min batches",
			kind: "below_min_batches",
		};
	}

	const k = Math.max(1, Math.min(config.topK, context.standings.length));
	const stable = isStableTopK(context.topKHistory, config.stabilityBatches);
	if (!stable) {
		return {
			shouldStop: false,
			reason: "top-k not stable yet",
			kind: "topk_unstable",
			details: { topK: k },
		};
	}

	const boundaryLeft = context.standings[k - 1];
	const boundaryRight = context.standings[k];
	if (!boundaryLeft || !boundaryRight) {
		return {
			shouldStop: true,
			reason: "stable top-k with no outside challenger",
			kind: "stable_separated",
			details: { topK: k, boundaryLeftId: boundaryLeft?.id },
		};
	}

	const separation = boundaryLeft.rating - boundaryRight.rating;
	// Treat minSeparation <= 0 as "disabled" rather than "always passes".
	const passesSeparation =
		config.minSeparation > 0 && separation >= config.minSeparation;

	const z = confidenceMultiplier(config.confidence);
	const leftLow = boundaryLeft.rating - z * boundaryLeft.uncertainty;
	const rightHigh = boundaryRight.rating + z * boundaryRight.uncertainty;
	const passesConfidence = leftLow > rightHigh;

	if (passesSeparation || passesConfidence) {
		return {
			shouldStop: true,
			reason: passesConfidence
				? "stable top-k with confidence separation"
				: "stable top-k with rating separation",
			kind: "stable_separated",
			details: {
				topK: k,
				boundaryLeftId: boundaryLeft.id,
				boundaryRightId: boundaryRight.id,
				separation,
				leftLow,
				rightHigh,
			},
		};
	}

	return {
		shouldStop: false,
		reason: "stability achieved but separation not met",
		kind: "stable_not_separated",
		details: {
			topK: k,
			boundaryLeftId: boundaryLeft.id,
			boundaryRightId: boundaryRight.id,
			separation,
			leftLow,
			rightHigh,
		},
	};
}
