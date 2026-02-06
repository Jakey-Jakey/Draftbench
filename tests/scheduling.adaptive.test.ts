import { describe, expect, test } from "bun:test";
import type { SwissContestant } from "../leaderboard";
import { applyPairwiseBatch, createRatingState } from "../rating/engine";
import type { PairwiseObservation } from "../rating/types";
import { scheduleAdaptivePairs } from "../scheduling/adaptive";

function contestant(id: string): SwissContestant {
	return {
		id,
		text: id,
		points: 0,
		opponents: new Set<string>(),
		placements: { first: 0, second: 0, third: 0, ties: 0 },
		wins: 0,
		losses: 0,
		draws: 0,
	};
}

describe("adaptive scheduler", () => {
	test("creates non-overlapping pairs", () => {
		const contestants = [
			contestant("A"),
			contestant("B"),
			contestant("C"),
			contestant("D"),
		];
		const ratingState = createRatingState(
			contestants.map((c) => c.id),
			{
				backend: "elo",
				initialRating: 1500,
				kFactor: 24,
				tieValue: 0.5,
				provisionalMatches: 12,
			},
		);

		const scheduled = scheduleAdaptivePairs(contestants, ratingState, [], {
			exploration: 0,
			avoidRepeatPenalty: 0.5,
			maxRepeatPairs: 2,
			randomSeed: 42,
		});

		expect(scheduled.pairs.length).toBe(2);
		const allIds = scheduled.pairs.flat();
		expect(new Set(allIds).size).toBe(4);
		expect(scheduled.bye).toBeNull();
	});

	test("returns bye for odd contestant count", () => {
		const contestants = [contestant("A"), contestant("B"), contestant("C")];
		const ratingState = createRatingState(
			contestants.map((c) => c.id),
			{
				backend: "elo",
				initialRating: 1500,
				kFactor: 24,
				tieValue: 0.5,
				provisionalMatches: 12,
			},
		);

		const scheduled = scheduleAdaptivePairs(contestants, ratingState, [], {
			exploration: 0,
			avoidRepeatPenalty: 0.5,
			maxRepeatPairs: 2,
			randomSeed: 42,
		});

		expect(scheduled.pairs.length).toBe(1);
		expect(scheduled.bye).not.toBeNull();
	});

	test("avoids over-repeated pairs when alternatives exist", () => {
		const contestants = [
			contestant("A"),
			contestant("B"),
			contestant("C"),
			contestant("D"),
		];
		const ratingState = createRatingState(
			contestants.map((c) => c.id),
			{
				backend: "elo",
				initialRating: 1500,
				kFactor: 24,
				tieValue: 0.5,
				provisionalMatches: 12,
			},
		);

		const history: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 0, scoreB: 1, round: 2 },
			{ aId: "C", bId: "D", scoreA: 1, scoreB: 0, round: 1 },
		];
		applyPairwiseBatch(ratingState, history);

		const scheduled = scheduleAdaptivePairs(contestants, ratingState, history, {
			exploration: 0,
			avoidRepeatPenalty: 0.8,
			maxRepeatPairs: 2,
			randomSeed: 7,
		});

		const hasAB = scheduled.pairs.some(
			([a, b]) => (a === "A" && b === "B") || (a === "B" && b === "A"),
		);
		expect(hasAB).toBe(false);
	});
});
