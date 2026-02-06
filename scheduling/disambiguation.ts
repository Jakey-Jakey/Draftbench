import { estimateWinProbability } from "../rating/engine";
import type {
	PairwiseObservation,
	RatingStanding,
	RatingState,
} from "../rating/types";

/**
 * Produces a stable unordered key for a pair of identifiers suitable for use in maps or sets.
 *
 * @param aId - First identifier of the pair
 * @param bId - Second identifier of the pair
 * @returns A deterministic string key representing the unordered pair (identical for `aId,bId` and `bId,aId`)
 */
function pairKey(aId: string, bId: string): string {
	return [aId, bId].sort().join("::");
}

/**
 * Count how many times each unordered pair appears in the observation history.
 *
 * @param history - Observations to tally
 * @returns A map from unordered pair key (sorted IDs joined with `"::"`) to the number of occurrences
 */
export function countRepeatPairs(
	history: PairwiseObservation[],
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const obs of history) {
		const key = pairKey(obs.aId, obs.bId);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/**
 * Selects and prioritized candidate match pairs for disambiguating contender order around a top-K boundary.
 *
 * Builds candidate pairs that compare the boundary contender (the k-th ranked entry) against nearby outside challengers,
 * optionally includes a near-boundary internal match, filters pairs by repeat limits, scores them by closeness of
 * estimated win probability to `targetWinProb`, and returns up to `maxMatches` unique pairs ordered by priority.
 *
 * @param args.standings - Array of ranked contenders (highest first).
 * @param args.ratingState - Current rating state used to estimate win probabilities.
 * @param args.topK - Number of top standings considered "inside" the boundary (clamped to [1, standings.length]).
 * @param args.candidatesOutsideK - Number of contenders taken immediately after the top-K to consider as challengers.
 * @param args.includeTopKInternal - If true, also consider a near-boundary internal match between the last two inside contenders.
 * @param args.repeatCounts - Map from unordered pair key to how many times that pair has been observed.
 * @param args.maxRepeatPairs - Maximum allowed repeats for a pair; pairs with repeats >= this are excluded unless `allowOverRepeatCap` is true.
 * @param args.allowOverRepeatCap - If true, ignore repeat count limits and allow pairs regardless of `repeatCounts`/`maxRepeatPairs`.
 * @param args.targetWinProb - Target win probability used to score informativeness; pairs with estimated probability closest to this are preferred.
 * @param args.maxMatches - Maximum number of pairs to return.
 * @returns An array of `[aId, bId]` pairs chosen for disambiguation, ordered by priority (most informative first).
export function planDisambiguationPairs(args: {
	standings: RatingStanding[];
	ratingState: RatingState;
	topK: number;
	candidatesOutsideK: number;
	includeTopKInternal: boolean;
	repeatCounts: Map<string, number>;
	maxRepeatPairs: number;
	allowOverRepeatCap: boolean;
	targetWinProb: number;
	maxMatches: number;
}): [string, string][] {
	const {
		standings,
		ratingState,
		topK,
		candidatesOutsideK,
		includeTopKInternal,
		repeatCounts,
		maxRepeatPairs,
		allowOverRepeatCap,
		targetWinProb,
		maxMatches,
	} = args;

	if (standings.length < 2) return [];
	if (maxMatches <= 0) return [];

	const k = Math.max(1, Math.min(topK, standings.length));
	const inside = standings.slice(0, k);
	const outside = standings.slice(k, k + Math.max(0, candidatesOutsideK));

	// Always focus on the boundary contender vs just-outside challengers.
	const boundary = inside[k - 1];
	if (!boundary) return [];

	const candidates: { aId: string; bId: string; score: number }[] = [];

	function canUsePair(aId: string, bId: string): boolean {
		if (allowOverRepeatCap) return true;
		const repeats = repeatCounts.get(pairKey(aId, bId)) ?? 0;
		return repeats < maxRepeatPairs;
	}

	function addPair(aId: string, bId: string): void {
		if (aId === bId) return;
		if (!canUsePair(aId, bId)) return;
		const p = estimateWinProbability(ratingState, aId, bId);
		const score = Math.abs(p - targetWinProb); // lower is better
		candidates.push({ aId, bId, score });
	}

	for (const challenger of outside) {
		addPair(boundary.id, challenger.id);
	}

	if (includeTopKInternal && inside.length >= 2) {
		// Optionally add a near-boundary internal match.
		const left = inside[Math.max(0, inside.length - 2)];
		if (left && left.id !== boundary.id) {
			addPair(left.id, boundary.id);
		}
	}

	// Sort by informativeness (closest to target win probability),
	// then stable tie-break for determinism.
	candidates.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score;
		const ak = pairKey(a.aId, a.bId);
		const bk = pairKey(b.aId, b.bId);
		return ak.localeCompare(bk);
	});

	const picked: [string, string][] = [];
	const used = new Set<string>();
	for (const c of candidates) {
		if (picked.length >= maxMatches) break;
		const key = pairKey(c.aId, c.bId);
		if (used.has(key)) continue;
		used.add(key);
		picked.push([c.aId, c.bId]);
	}

	return picked;
}