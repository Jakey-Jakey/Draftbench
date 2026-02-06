import type { StopRulesConfig } from "../config";
import type { RatingStanding } from "../rating/types";
import { confidenceMultiplier } from "../utils";

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

/**
 * Determines whether the top-K snapshots have been identical for the specified number of most recent batches.
 *
 * @param topKHistory - Chronological array of top-K snapshots; each snapshot is an array of item ids in rank order.
 * @param stabilityBatches - Number of most recent snapshots that must be identical to consider the top-K stable.
 * @returns `true` if `stabilityBatches` is less than or equal to 1, or if the last `stabilityBatches` snapshots exist and are identical; `false` otherwise.
 */
function isStableTopK(
	topKHistory: string[][],
	stabilityBatches: number,
): boolean {
	if (stabilityBatches <= 1) return true;
	if (topKHistory.length < stabilityBatches) return false;

	const recent = topKHistory.slice(-stabilityBatches);
	const sep = "\u0000";
	const first = recent[0]?.join(sep);
	if (!first) return false;
	return recent.every((entry) => entry.join(sep) === first);
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