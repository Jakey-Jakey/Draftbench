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

	test("fisher scoring mode creates valid non-overlapping pairs", () => {
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
			scoringMode: "fisher",
		});

		expect(scheduled.pairs.length).toBe(2);
		const allIds = scheduled.pairs.flat();
		expect(new Set(allIds).size).toBe(4);
		expect(scheduled.bye).toBeNull();
	});

	test("fisher scoring mode respects repeat limits", () => {
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
		];
		applyPairwiseBatch(ratingState, history);

		const scheduled = scheduleAdaptivePairs(contestants, ratingState, history, {
			exploration: 0,
			avoidRepeatPenalty: 0.8,
			maxRepeatPairs: 2,
			randomSeed: 7,
			scoringMode: "fisher",
		});

		const hasAB = scheduled.pairs.some(
			([a, b]) => (a === "A" && b === "B") || (a === "B" && b === "A"),
		);
		expect(hasAB).toBe(false);
	});

	test("fisher scoring prioritizes close matchups with high uncertainty", () => {
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

		// Make A much stronger than D, B and C close
		const recA = ratingState.records.get("A");
		const recB = ratingState.records.get("B");
		const recC = ratingState.records.get("C");
		const recD = ratingState.records.get("D");
		if (recA) recA.rating = 1800;
		if (recB) recB.rating = 1510;
		if (recC) recC.rating = 1490;
		if (recD) recD.rating = 1200;

		const scheduled = scheduleAdaptivePairs(contestants, ratingState, [], {
			exploration: 0,
			avoidRepeatPenalty: 0.5,
			maxRepeatPairs: 2,
			randomSeed: 42,
			scoringMode: "fisher",
		});

		// B-C should be the top priority pair because they're closest in rating
		// (highest Fisher information p*(1-p) ~ 0.25) and both have high uncertainty
		const firstPair = scheduled.pairs[0];
		expect(firstPair).toBeDefined();
		const pairIds = new Set(firstPair);
		expect(pairIds.has("B") && pairIds.has("C")).toBe(true);
	});

	test("does not create over-repeated matchups in fallback (leaves unpaired)", () => {
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

		const history: PairwiseObservation[] = [];
		const ids = ["A", "B", "C", "D"];
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const aId = ids[i];
				const bId = ids[j];
				if (!aId || !bId) continue;
				// Mark every possible pair as already repeated up to the cap.
				history.push(
					{ aId, bId, scoreA: 1, scoreB: 0, round: 1 },
					{ aId, bId, scoreA: 0, scoreB: 1, round: 2 },
				);
			}
		}
		applyPairwiseBatch(ratingState, history);

		const scheduled = scheduleAdaptivePairs(contestants, ratingState, history, {
			exploration: 0,
			avoidRepeatPenalty: 0.8,
			maxRepeatPairs: 2,
			randomSeed: 7,
		});

		expect(scheduled.pairs.length).toBe(0);
		expect(scheduled.unpairedIds.length).toBe(4);
	});
});
