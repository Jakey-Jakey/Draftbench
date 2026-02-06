import type { SwissContestant } from "../leaderboard";
import { estimateWinProbability, STARTING_UNCERTAINTY } from "../rating/engine";
import type { PairwiseObservation, RatingState } from "../rating/types";
import { countRepeatPairs, pairKey } from "./pairs";

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
	const repeatCounts = countRepeatPairs(history);
	const bye = chooseByeId(contestants, ratingState);
	const active = contestants.filter((c) => c.id !== bye);

	const candidates: CandidatePair[] = [];
	let skippedByRepeatLimit = 0;
	let forcedRepeatPairs = 0;
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
			forcedRepeatPairs += 1;
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
