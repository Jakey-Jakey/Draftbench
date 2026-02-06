import type { SwissContestant } from "../leaderboard";
import { estimateWinProbability, STARTING_UNCERTAINTY } from "../rating/engine";
import type { PairwiseObservation, RatingState } from "../rating/types";

export interface AdaptiveSchedulerOptions {
	exploration: number;
	avoidRepeatPenalty: number;
	maxRepeatPairs: number;
	randomSeed?: number;
}

export interface AdaptiveScheduleDiagnostics {
	skippedByRepeatLimit: number;
	candidateCount: number;
	forcedRepeatPairs: number;
}

export interface AdaptiveScheduleResult {
	pairs: [string, string][];
	bye: string | null;
	/**
	 * IDs that could not be legally paired without exceeding maxRepeatPairs.
	 * Caller can treat these as additional byes or handle them at a higher level.
	 */
	unpairedIds: string[];
	diagnostics: AdaptiveScheduleDiagnostics;
}

interface CandidatePair {
	aId: string;
	bId: string;
	score: number;
	repeats: number;
}

/**
 * Creates a deterministic pseudo-random number generator function seeded from an integer.
 *
 * @param seed - The initial seed; treated as an unsigned 32-bit integer to initialize the sequence.
 * @returns A function with no arguments that returns a pseudo-random number in [0, 1) on each call, producing a deterministic sequence derived from `seed`.
 */
function hashInt(seed: number): () => number {
	let value = seed >>> 0;
	return () => {
		value += 0x6d2b79f5;
		let t = value;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Creates a canonical key for an unordered pair of IDs.
 *
 * @param aId - First identifier of the pair
 * @param bId - Second identifier of the pair
 * @returns A string in the form `smallerId::largerId` that is identical regardless of input order
 */
function pairKey(aId: string, bId: string): string {
	return aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`;
}

/**
 * Counts how many times each unordered pair appears in the given history.
 *
 * @param history - List of pairwise observations to aggregate
 * @returns A map from canonical pair key (`minId::maxId`) to the number of occurrences
 */
function buildRepeatCounts(
	history: PairwiseObservation[],
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const entry of history) {
		const key = pairKey(entry.aId, entry.bId);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/**
 * Selects which contestant should receive a bye when there is an odd number of contestants.
 *
 * The selected contestant is the one with the fewest matches played, breaking ties by lower rating
 * (falling back to the state's initial rating if a contestant has no recorded rating), and finally by
 * lexicographic order of contestant ID.
 *
 * @param contestants - List of contestants to consider
 * @param state - Rating state containing match records and configuration (used for match counts and initial rating fallback)
 * @returns The ID of the contestant chosen to receive a bye, or `null` if no bye is required
 */
function chooseByeId(
	contestants: SwissContestant[],
	state: RatingState,
): string | null {
	if (contestants.length % 2 === 0) return null;
	const sorted = [...contestants].sort((a, b) => {
		const matchesA = state.records.get(a.id)?.matches ?? 0;
		const matchesB = state.records.get(b.id)?.matches ?? 0;
		if (matchesA !== matchesB) return matchesA - matchesB;
		const ratingA =
			state.records.get(a.id)?.rating ?? state.config.initialRating;
		const ratingB =
			state.records.get(b.id)?.rating ?? state.config.initialRating;
		if (ratingA !== ratingB) return ratingA - ratingB;
		return a.id.localeCompare(b.id);
	});
	return sorted[0]?.id ?? null;
}

/**
 * Compute pairings for a round using an adaptive heuristic that balances uncertainty, rating closeness, match coverage, exploration, and repeat avoidance.
 *
 * Uses the provided rating state and match history to score candidate pairs, respects `options.maxRepeatPairs` (skipping pairs that exceed the limit), applies an exploration boost per `options.exploration`, and selects a greedy set of non-overlapping pairs. If the contestant count is odd, selects a bye candidate. Any contestants that cannot be paired without exceeding the repeat limit are returned in `unpairedIds`.
 *
 * @param contestants - All contestants to consider for pairing
 * @param ratingState - Current rating state used to compute uncertainty, matches, and win probabilities
 * @param history - Past pairwise observations used to compute repeat counts for pair-avoidance
 * @param options - Scheduler configuration (exploration probability, avoidRepeatPenalty, maxRepeatPairs, optional randomSeed)
 * @returns The scheduling result containing:
 *   - `pairs`: an array of paired contestant id tuples
 *   - `bye`: the id chosen to receive a bye, or `null` if none
 *   - `unpairedIds`: ids that could not be paired without exceeding `maxRepeatPairs`
 *   - `diagnostics`: counters `{ skippedByRepeatLimit, candidateCount, forcedRepeatPairs }` describing scheduling decisions
 */
export function scheduleAdaptivePairs(
	contestants: SwissContestant[],
	ratingState: RatingState,
	history: PairwiseObservation[],
	options: AdaptiveSchedulerOptions,
): AdaptiveScheduleResult {
	if (contestants.length < 2) {
		return {
			pairs: [],
			bye: null,
			unpairedIds: [],
			diagnostics: {
				skippedByRepeatLimit: 0,
				candidateCount: 0,
				forcedRepeatPairs: 0,
			},
		};
	}

	const rng = hashInt(options.randomSeed ?? 123456789);
	const repeatCounts = buildRepeatCounts(history);
	const bye = chooseByeId(contestants, ratingState);
	const active = contestants.filter((c) => c.id !== bye);

	const candidates: CandidatePair[] = [];
	let skippedByRepeatLimit = 0;
	const forcedRepeatPairs = 0;
	const unpairedIds: string[] = [];

	for (let i = 0; i < active.length; i++) {
		for (let j = i + 1; j < active.length; j++) {
			const left = active[i];
			const right = active[j];
			if (!left || !right) continue;

			const key = pairKey(left.id, right.id);
			const repeats = repeatCounts.get(key) ?? 0;
			if (repeats >= options.maxRepeatPairs) {
				skippedByRepeatLimit += 1;
				continue;
			}

			const leftRecord = ratingState.records.get(left.id);
			const rightRecord = ratingState.records.get(right.id);
			const uncertaintyTerm =
				((leftRecord?.uncertainty ?? STARTING_UNCERTAINTY) +
					(rightRecord?.uncertainty ?? STARTING_UNCERTAINTY)) /
				(STARTING_UNCERTAINTY * 2);
			const p = estimateWinProbability(ratingState, left.id, right.id);
			const closenessTerm = 1 - Math.abs(p - 0.5) * 2;
			const coverageTerm =
				1 / (1 + (leftRecord?.matches ?? 0)) +
				1 / (1 + (rightRecord?.matches ?? 0));
			const repeatPenalty = repeats * options.avoidRepeatPenalty;
			const explorationBoost = rng() < options.exploration ? rng() : 0;

			candidates.push({
				aId: left.id,
				bId: right.id,
				repeats,
				score:
					uncertaintyTerm +
					closenessTerm +
					coverageTerm +
					explorationBoost -
					repeatPenalty,
			});
		}
	}

	candidates.sort((a, b) => b.score - a.score || a.aId.localeCompare(b.aId));

	const pairs: [string, string][] = [];
	const used = new Set<string>();
	for (const candidate of candidates) {
		if (used.has(candidate.aId) || used.has(candidate.bId)) continue;
		pairs.push([candidate.aId, candidate.bId]);
		used.add(candidate.aId);
		used.add(candidate.bId);
	}

	if (used.size < active.length) {
		const remaining = active
			.map((c) => c.id)
			.filter((id) => !used.has(id))
			.sort((a, b) => {
				const ratingA =
					ratingState.records.get(a)?.rating ??
					ratingState.config.initialRating;
				const ratingB =
					ratingState.records.get(b)?.rating ??
					ratingState.config.initialRating;
				return ratingB - ratingA;
			});

		// Fallback pairing: still try to respect maxRepeatPairs.
		const pool = [...remaining];
		while (pool.length >= 2) {
			const left = pool.shift();
			if (!left) break;

			let partnerIdx = -1;
			for (let i = 0; i < pool.length; i++) {
				const right = pool[i];
				if (!right) continue;
				const repeats = repeatCounts.get(pairKey(left, right)) ?? 0;
				if (repeats < options.maxRepeatPairs) {
					partnerIdx = i;
					break;
				}
			}

			if (partnerIdx === -1) {
				// No legal partner remains without exceeding maxRepeatPairs.
				// Leave left unpaired so the caller can treat it as a bye (or other higher-level handling).
				unpairedIds.push(left);
				continue;
			}

			const right = pool.splice(partnerIdx, 1)[0];
			if (!right) {
				unpairedIds.push(left);
				break;
			}
			pairs.push([left, right]);
		}

		// Any leftovers couldn't be paired legally.
		unpairedIds.push(...pool);
	}

	return {
		pairs,
		bye,
		unpairedIds,
		diagnostics: {
			skippedByRepeatLimit,
			candidateCount: candidates.length,
			forcedRepeatPairs,
		},
	};
}