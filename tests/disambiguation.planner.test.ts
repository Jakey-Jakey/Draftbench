import { describe, expect, test } from "bun:test";
import { createRatingState } from "../rating/engine";
import type { RatingStanding } from "../rating/types";
import {
	countRepeatPairs,
	planDisambiguationPairs,
} from "../scheduling/disambiguation";
import { requireDefined } from "../utils";

function standingsFromRatings(
	ratings: Record<string, number>,
): RatingStanding[] {
	// Minimal standing objects; planner only needs id + ordering.
	return Object.entries(ratings)
		.map(([id, rating]) => ({
			id,
			rating,
			matches: 0,
			wins: 0,
			losses: 0,
			draws: 0,
			uncertainty: 100,
			ciLow: rating - 100,
			ciHigh: rating + 100,
		}))
		.sort((a, b) => b.rating - a.rating);
}

describe("disambiguation planner", () => {
	test("prioritizes boundary vs outside-K pair closest to targetWinProb", () => {
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

		// A strongest, B boundary, C close challenger, D weak challenger.
		requireDefined(ratingState.records.get("A"), "missing A record").rating =
			1700;
		requireDefined(ratingState.records.get("B"), "missing B record").rating =
			1500;
		requireDefined(ratingState.records.get("C"), "missing C record").rating =
			1490;
		requireDefined(ratingState.records.get("D"), "missing D record").rating =
			1200;

		const standings = standingsFromRatings({
			A: 1700,
			B: 1500,
			C: 1490,
			D: 1200,
		});

		const planned = planDisambiguationPairs({
			standings,
			ratingState,
			topK: 2,
			candidatesOutsideK: 2,
			includeTopKInternal: false,
			repeatCounts: new Map(),
			maxRepeatPairs: 2,
			allowOverRepeatCap: false,
			targetWinProb: 0.5,
			maxMatches: 1,
		});

		expect(planned).toEqual([["B", "C"]]);
	});

	test("respects maxRepeatPairs unless allowOverRepeatCap is true", () => {
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
			A: 1700,
			B: 1500,
			C: 1490,
			D: 1200,
		});

		// Pair B/C already at cap (2), so planner should skip it and pick B/D.
		const repeatCounts = countRepeatPairs([
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "C", bId: "B", scoreA: 1, scoreB: 0, round: 2 },
		]);

		const planned = planDisambiguationPairs({
			standings,
			ratingState,
			topK: 2,
			candidatesOutsideK: 2,
			includeTopKInternal: false,
			repeatCounts,
			maxRepeatPairs: 2,
			allowOverRepeatCap: false,
			targetWinProb: 0.5,
			maxMatches: 1,
		});

		expect(planned).toEqual([["B", "D"]]);
	});

	test("can optionally schedule a top-K internal match near the boundary", () => {
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
			1550;
		requireDefined(ratingState.records.get("B"), "missing B record").rating =
			1500;
		requireDefined(ratingState.records.get("C"), "missing C record").rating =
			1400;

		const standings = standingsFromRatings({
			A: 1550,
			B: 1500,
			C: 1400,
		});

		const planned = planDisambiguationPairs({
			standings,
			ratingState,
			topK: 2,
			candidatesOutsideK: 0,
			includeTopKInternal: true,
			repeatCounts: new Map(),
			maxRepeatPairs: 2,
			allowOverRepeatCap: false,
			targetWinProb: 0.5,
			maxMatches: 1,
		});

		expect(planned).toEqual([["A", "B"]]);
	});
});
