import type { SwissContestant } from "../leaderboard";
import { estimateWinProbability } from "../rating/engine";
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
}

export interface AdaptiveScheduleResult {
	pairs: [string, string][];
	bye: string | null;
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

function pairKey(aId: string, bId: string): string {
	return aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`;
}

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
			diagnostics: { skippedByRepeatLimit: 0, candidateCount: 0 },
		};
	}

	const rng = hashInt(options.randomSeed ?? 123456789);
	const repeatCounts = buildRepeatCounts(history);
	const bye = chooseByeId(contestants, ratingState);
	const active = contestants.filter((c) => c.id !== bye);

	const candidates: CandidatePair[] = [];
	let skippedByRepeatLimit = 0;

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
				((leftRecord?.uncertainty ?? 100) + (rightRecord?.uncertainty ?? 100)) /
				200;
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
		for (let i = 0; i + 1 < remaining.length; i += 2) {
			const left = remaining[i];
			const right = remaining[i + 1];
			if (!left || !right) continue;
			pairs.push([left, right]);
		}
	}

	return {
		pairs,
		bye,
		diagnostics: {
			skippedByRepeatLimit,
			candidateCount: candidates.length,
		},
	};
}
