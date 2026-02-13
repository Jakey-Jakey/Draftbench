import { estimateWinProbability } from "../rating/engine";
import type { RatingStanding, RatingState } from "../rating/types";
import { confidenceMultiplier } from "../utils";
import { pairKey } from "./pairs";

export type ActiveScoringMode = "heuristic" | "fisher";

export interface ActiveRankingContext {
	standings: RatingStanding[];
	ratingState: RatingState;
	repeatCounts: Map<string, number>;
	maxRepeatPairs: number;
	targetWinProb: number;
	/** Pair scoring strategy: "heuristic" (|p - target|, lower=better) or "fisher" (p*(1-p), higher=better). */
	scoringMode?: ActiveScoringMode;
}

export interface ActiveRankingResult {
	pairs: [string, string][];
	allSeparated: boolean;
	unseparatedPairs: [string, string][];
}

/**
 * Compute a confidence interval for a standing's rating at the specified confidence level.
 *
 * @param standing - The standing containing `rating` and `uncertainty`
 * @param confidenceLevel - Confidence level as a fraction (e.g., 0.95 for 95% confidence)
 * @returns An object with `low` and `high` numeric bounds for the confidence interval
 */
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

/**
 * Determines whether the confidence intervals of two standings do not overlap.
 *
 * @param a - The first standing whose rating confidence interval will be computed
 * @param b - The second standing whose rating confidence interval will be computed
 * @param confidenceLevel - Confidence level used to compute intervals (passed to the CI multiplier)
 * @returns `true` if the two confidence intervals are non-overlapping, `false` otherwise
 */
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
 * Determine whether every adjacent pair of IDs in `scope` has non-overlapping confidence intervals.
 *
 * @param standings - Array of standings used to look up rating and uncertainty by `id`
 * @param scope - Ordered array of standing IDs whose adjacent pairs will be checked
 * @param confidenceLevel - Confidence level used to compute each standing's interval
 * @returns An object with:
 *  - `separated`: `true` if all adjacent pairs have non-overlapping confidence intervals, `false` otherwise
 *  - `unseparated`: list of adjacent `[aId, bId]` pairs from `scope` whose intervals overlap
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
 * Plan the next batch of match pairs to reduce ordering uncertainty among items in a scope.
 *
 * @param context - Active ranking context containing standings, a rating state, a map of pair repeat counts, `maxRepeatPairs`, and `targetWinProb`.
 * @param scope - Ordered list of standing IDs that defines adjacency for CI-based separation checks.
 * @param maxBatchSize - Maximum number of pairs to include in the planned batch (floored to an integer, zero yields no pairs).
 * @param confidenceLevel - Confidence level used to compute confidence intervals for separation checks.
 * @returns An object with:
 *  - `pairs`: an array of selected `[aId, bId]` pairs (up to `maxBatchSize`),
 *  - `allSeparated`: `true` if all adjacent IDs in `scope` have non-overlapping confidence intervals, `false` otherwise,
 *  - `unseparatedPairs`: list of adjacent `[aId, bId]` pairs within `scope` whose confidence intervals overlap.
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

	const useFisher = (context.scoringMode ?? "heuristic") === "fisher";
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

			let score: number;
			if (useFisher) {
				// Fisher information: p*(1-p) is the exact expected information gain
				// from a single pairwise comparison. Higher = more informative.
				// We negate so that sorting ascending still picks the best candidates.
				score = -(p * (1 - p));
			} else {
				// Original heuristic: |p - targetWinProb|, lower is more informative
				score = Math.abs(p - context.targetWinProb);
			}
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