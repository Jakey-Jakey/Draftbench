import { estimateWinProbability } from "../rating/engine";
import type { RatingStanding, RatingState } from "../rating/types";
import { pairKey } from "./pairs";

export interface ActiveRankingContext {
	standings: RatingStanding[];
	ratingState: RatingState;
	repeatCounts: Map<string, number>;
	maxRepeatPairs: number;
	targetWinProb: number;
}

export interface ActiveRankingResult {
	pairs: [string, string][];
	allSeparated: boolean;
	unseparatedPairs: [string, string][];
}

function confidenceMultiplier(confidence: number): number {
	// Step-function z-score approximation at common confidence thresholds.
	// Values between thresholds fall to the next lower tier (e.g. 0.97 -> 1.96).
	if (confidence >= 0.99) return 2.58;
	if (confidence >= 0.95) return 1.96;
	if (confidence >= 0.9) return 1.64;
	if (confidence >= 0.8) return 1.28;
	return 1.0;
}

function getCi(
	standing: RatingStanding,
	confidenceLevel: number,
): { low: number; high: number } {
	const z = confidenceMultiplier(confidenceLevel);
	return {
		low: standing.rating - z * standing.uncertainty,
		high: standing.rating + z * standing.uncertainty,
	};
}

function ciSeparated(
	a: RatingStanding,
	b: RatingStanding,
	confidenceLevel: number,
): boolean {
	const ca = getCi(a, confidenceLevel);
	const cb = getCi(b, confidenceLevel);
	// Non-overlap means one interval sits entirely above the other.
	return ca.low > cb.high || cb.low > ca.high;
}

/**
 * Checks if all adjacent pairs in the ordered list have separated CIs.
 */
export function allPairsSeparated(
	standings: RatingStanding[],
	scope: string[],
	confidenceLevel: number,
): { separated: boolean; unseparated: [string, string][] } {
	if (scope.length < 2) return { separated: true, unseparated: [] };

	const byId = new Map(standings.map((s) => [s.id, s] as const));
	const unseparated: [string, string][] = [];

	for (let i = 0; i < scope.length - 1; i++) {
		const aId = scope[i];
		const bId = scope[i + 1];
		if (!aId || !bId) continue;
		const a = byId.get(aId);
		const b = byId.get(bId);
		if (!a || !b) continue;

		if (!ciSeparated(a, b, confidenceLevel)) {
			unseparated.push([aId, bId]);
		}
	}

	return { separated: unseparated.length === 0, unseparated };
}

/**
 * Plans the next batch of matches for active ranking.
 * Focuses on uncertain pairs within a scope. Stop condition is adjacency CI separation.
 */
export function planActiveRankingBatch(
	context: ActiveRankingContext,
	scope: string[],
	maxBatchSize: number,
	confidenceLevel: number,
): ActiveRankingResult {
	const batchSize = Math.max(0, Math.floor(maxBatchSize));
	if (batchSize === 0 || scope.length < 2) {
		const sep = allPairsSeparated(context.standings, scope, confidenceLevel);
		return {
			pairs: [],
			allSeparated: sep.separated,
			unseparatedPairs: sep.unseparated,
		};
	}

	const byId = new Map(context.standings.map((s) => [s.id, s] as const));
	const sep = allPairsSeparated(context.standings, scope, confidenceLevel);

	const candidates: { aId: string; bId: string; score: number }[] = [];
	for (let i = 0; i < scope.length; i++) {
		for (let j = i + 1; j < scope.length; j++) {
			const aId = scope[i];
			const bId = scope[j];
			if (!aId || !bId) continue;
			const a = byId.get(aId);
			const b = byId.get(bId);
			if (!a || !b) continue;

			// Only consider pairs whose CIs overlap (i.e., uncertain ordering between them).
			if (ciSeparated(a, b, confidenceLevel)) continue;

			const repeats = context.repeatCounts.get(pairKey(aId, bId)) ?? 0;
			if (repeats >= context.maxRepeatPairs) continue;

			const p = estimateWinProbability(context.ratingState, aId, bId);
			const score = Math.abs(p - context.targetWinProb); // lower is more informative
			candidates.push({ aId, bId, score });
		}
	}

	candidates.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score;
		return pairKey(a.aId, a.bId).localeCompare(pairKey(b.aId, b.bId));
	});

	const pairs: [string, string][] = [];
	const used = new Set<string>();
	for (const c of candidates) {
		if (pairs.length >= batchSize) break;
		const key = pairKey(c.aId, c.bId);
		if (used.has(key)) continue;
		used.add(key);
		pairs.push([c.aId, c.bId]);
	}

	return {
		pairs,
		allSeparated: sep.separated,
		unseparatedPairs: sep.unseparated,
	};
}
