import type { PairwiseObservation } from "../rating/types";

export function pairKey(aId: string, bId: string): string {
	// Canonicalize regardless of caller order.
	return aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`;
}

export function countRepeatPairs(
	history: PairwiseObservation[],
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const entry of history) {
		const key = pairKey(entry.aId, entry.bId);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}
