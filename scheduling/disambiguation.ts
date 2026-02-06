import { estimateWinProbability } from "../rating/engine";
import type {
	PairwiseObservation,
	RatingStanding,
	RatingState,
} from "../rating/types";

/**
 * Produce a canonical, order-independent key for a pair of identifiers.
 *
 * @param aId - The first identifier
 * @param bId - The second identifier
 * @returns A string key formed by sorting the two IDs and joining them with `::`
 */
function pairKey(aId: string, bId: string): string {
	return [aId, bId].sort().join("::");
}

/**
 * Counts how many times each unordered pair of IDs appears in a history of pairwise observations.
 *
 * @param history - Array of pairwise observations to count; each observation's `aId` and `bId` form an unordered pair
 * @returns A map from canonical pair key (sorted IDs joined with `::`) to the number of occurrences of that pair
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
 * Selects prioritized disambiguation match pairs centered on the top-K boundary contender.
 *
 * Builds candidate pairs between the boundary entry (the Kth standing) and nearby outside challengers,
 * optionally includes a near-boundary internal pair, filters pairs by repeat limits (unless over-cap is allowed),
 * ranks them by how close the estimated win probability is to `targetWinProb`, and returns up to `maxMatches`
 * unique pairs in deterministic order.
 *
 * @param args.standings - Ordered list of standings used to determine the top-K boundary and nearby challengers.
 * @param args.ratingState - Current rating state used to estimate win probabilities.
 * @param args.topK - Number of top standings to consider; the boundary contender is the `topK`th entry (clamped >=1).
 * @param args.candidatesOutsideK - Number of challengers taken from just outside the top-K to consider.
 * @param args.includeTopKInternal - If true, include an additional candidate pairing the boundary with the next-highest inside contender.
 * @param args.repeatCounts - Map of canonical pair keys to how many times each pair has occurred; used to enforce repeat limits.
 * @param args.maxRepeatPairs - Maximum allowed repeats for a pair; pairs with repeats >= this value are excluded unless `allowOverRepeatCap` is true.
 * @param args.allowOverRepeatCap - If true, ignore `maxRepeatPairs` and allow pairs regardless of repeat history.
 * @param args.targetWinProb - Target win probability used to score informativeness; pairs closer to this value are preferred.
 * @param args.maxMatches - Maximum number of unique pairs to return.
 * @returns An array of unique `[aId, bId]` pairs prioritized by closeness to `targetWinProb`, with length at most `maxMatches`.
 */
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