import { estimateWinProbability } from "../rating/engine";
import type { RatingStanding, RatingState } from "../rating/types";
import { countRepeatPairs, pairKey } from "./pairs";

export { countRepeatPairs };

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
