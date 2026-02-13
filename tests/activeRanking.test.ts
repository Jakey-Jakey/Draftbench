import { describe, expect, test } from "bun:test";
import { createRatingState } from "../rating/engine";
import type { RatingStanding } from "../rating/types";
import {
	allPairsSeparated,
	planActiveRankingBatch,
} from "../scheduling/activeRanking";
import { countRepeatPairs } from "../scheduling/pairs";
import { requireDefined } from "../utils";

function standingsFromRatings(
	ratings: Record<string, { rating: number; uncertainty?: number }>,
): RatingStanding[] {
	return Object.entries(ratings)
		.map(([id, r]) => ({
			id,
			rating: r.rating,
			matches: 0,
			wins: 0,
			losses: 0,
			draws: 0,
			uncertainty: r.uncertainty ?? 100,
			ciLow: r.rating - 100,
			ciHigh: r.rating + 100,
		}))
		.sort((a, b) => b.rating - a.rating);
}

describe("active ranking", () => {
	test("allPairsSeparated flags adjacent overlap at given confidence", () => {
		const standings = standingsFromRatings({
			A: { rating: 1700, uncertainty: 120 },
			B: { rating: 1600, uncertainty: 120 },
		});
		const scope = ["A", "B"];

		const result = allPairsSeparated(standings, scope, 0.9);
		expect(result.separated).toBe(false);
		expect(result.unseparated).toEqual([["A", "B"]]);
	});

	test("allPairsSeparated returns separated when CIs do not overlap", () => {
		const standings = standingsFromRatings({
			A: { rating: 1700, uncertainty: 20 },
			B: { rating: 1600, uncertainty: 20 },
		});
		const scope = ["A", "B"];

		const result = allPairsSeparated(standings, scope, 0.9);
		expect(result.separated).toBe(true);
		expect(result.unseparated).toEqual([]);
	});

	test("planActiveRankingBatch prioritizes matchups closest to target win prob", () => {
		const ids = ["A", "B", "C", "D"];
		const ratingState = createRatingState(ids, {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			provisionalMatches: 5,
			tieValue: 0.5,
			btIterations: 200,
			btTolerance: 1e-6,
			ciBootstrapSamples: 0,
		});

		// Ensure B/C is the closest matchup to 50/50 among overlapping pairs.
		requireDefined(ratingState.records.get("A"), "missing A record").rating =
			1700;
		requireDefined(ratingState.records.get("B"), "missing B record").rating =
			1500;
		requireDefined(ratingState.records.get("C"), "missing C record").rating =
			1490;
		requireDefined(ratingState.records.get("D"), "missing D record").rating =
			1200;

		const standings = standingsFromRatings({
			A: { rating: 1700, uncertainty: 200 },
			B: { rating: 1500, uncertainty: 200 },
			C: { rating: 1490, uncertainty: 200 },
			D: { rating: 1200, uncertainty: 200 },
		});

		const scope = ["A", "B", "C", "D"];
		const planned = planActiveRankingBatch(
			{
				standings,
				ratingState,
				repeatCounts: new Map(),
				maxRepeatPairs: 2,
				targetWinProb: 0.5,
			},
			scope,
			1,
			0.9,
		);

		expect(planned.pairs).toEqual([["B", "C"]]);
	});

	test("planActiveRankingBatch with fisher scoring prioritizes highest Fisher info pair", () => {
		const ids = ["A", "B", "C", "D"];
		const ratingState = createRatingState(ids, {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			provisionalMatches: 5,
			tieValue: 0.5,
			btIterations: 200,
			btTolerance: 1e-6,
			ciBootstrapSamples: 0,
		});

		// B/C closest → Fisher info p*(1-p) is highest
		requireDefined(ratingState.records.get("A"), "missing A record").rating =
			1700;
		requireDefined(ratingState.records.get("B"), "missing B record").rating =
			1500;
		requireDefined(ratingState.records.get("C"), "missing C record").rating =
			1490;
		requireDefined(ratingState.records.get("D"), "missing D record").rating =
			1200;

		const standings = standingsFromRatings({
			A: { rating: 1700, uncertainty: 200 },
			B: { rating: 1500, uncertainty: 200 },
			C: { rating: 1490, uncertainty: 200 },
			D: { rating: 1200, uncertainty: 200 },
		});

		const scope = ["A", "B", "C", "D"];
		const planned = planActiveRankingBatch(
			{
				standings,
				ratingState,
				repeatCounts: new Map(),
				maxRepeatPairs: 2,
				targetWinProb: 0.5,
				scoringMode: "fisher",
			},
			scope,
			1,
			0.9,
		);

		// B-C is the pair with the highest Fisher information (closest to p=0.5)
		expect(planned.pairs).toEqual([["B", "C"]]);
	});

	test("fisher and heuristic scoring agree on most informative pair", () => {
		const ids = ["A", "B", "C"];
		const ratingState = createRatingState(ids, {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			provisionalMatches: 5,
			tieValue: 0.5,
			btIterations: 200,
			btTolerance: 1e-6,
			ciBootstrapSamples: 0,
		});

		requireDefined(ratingState.records.get("A"), "missing A record").rating =
			1600;
		requireDefined(ratingState.records.get("B"), "missing B record").rating =
			1500;
		requireDefined(ratingState.records.get("C"), "missing C record").rating =
			1400;

		const standings = standingsFromRatings({
			A: { rating: 1600, uncertainty: 200 },
			B: { rating: 1500, uncertainty: 200 },
			C: { rating: 1400, uncertainty: 200 },
		});

		const scope = ["A", "B", "C"];

		const heuristic = planActiveRankingBatch(
			{
				standings,
				ratingState,
				repeatCounts: new Map(),
				maxRepeatPairs: 2,
				targetWinProb: 0.5,
				scoringMode: "heuristic",
			},
			scope,
			1,
			0.9,
		);

		const fisher = planActiveRankingBatch(
			{
				standings,
				ratingState,
				repeatCounts: new Map(),
				maxRepeatPairs: 2,
				targetWinProb: 0.5,
				scoringMode: "fisher",
			},
			scope,
			1,
			0.9,
		);

		// When ratings are equally spaced, both methods should agree on the first pair
		// (both favor the pair closest to 50/50 predicted outcome)
		expect(heuristic.pairs[0]).toEqual(fisher.pairs[0]);
	});

	test("planActiveRankingBatch respects maxRepeatPairs cap", () => {
		const ids = ["A", "B", "C", "D"];
		const ratingState = createRatingState(ids, {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			provisionalMatches: 5,
			tieValue: 0.5,
			btIterations: 200,
			btTolerance: 1e-6,
			ciBootstrapSamples: 0,
		});

		requireDefined(ratingState.records.get("A"), "missing A record").rating =
			1700;
		requireDefined(ratingState.records.get("B"), "missing B record").rating =
			1500;
		requireDefined(ratingState.records.get("C"), "missing C record").rating =
			1490;
		requireDefined(ratingState.records.get("D"), "missing D record").rating =
			1200;

		const standings = standingsFromRatings({
			A: { rating: 1700, uncertainty: 200 },
			B: { rating: 1500, uncertainty: 200 },
			C: { rating: 1490, uncertainty: 200 },
			D: { rating: 1200, uncertainty: 200 },
		});

		const repeatCounts = countRepeatPairs([
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "C", bId: "B", scoreA: 1, scoreB: 0, round: 2 },
		]);

		const scope = ["A", "B", "C", "D"];
		const planned = planActiveRankingBatch(
			{
				standings,
				ratingState,
				repeatCounts,
				maxRepeatPairs: 2,
				targetWinProb: 0.5,
			},
			scope,
			1,
			0.9,
		);

		expect(planned.pairs[0]).not.toEqual(["B", "C"]);
	});
});
