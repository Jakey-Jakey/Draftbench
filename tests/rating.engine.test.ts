import { describe, expect, test } from "bun:test";
import {
	applyPairwiseBatch,
	createRatingState,
	estimateWinProbability,
	getRatingStandings,
} from "../rating/engine";
import type { PairwiseObservation } from "../rating/types";

describe("rating engine", () => {
	test("elo backend ranks stronger entries higher", () => {
		const state = createRatingState(["A", "B", "C"], {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			tieValue: 0.5,
			provisionalMatches: 12,
		});

		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "C", scoreA: 0.5, scoreB: 0.5, round: 2 },
		];

		applyPairwiseBatch(state, results);
		const standings = getRatingStandings(state);

		expect(standings[0]?.id).toBe("A");
		expect(standings[1]?.id).toBe("B");
		expect(standings[2]?.id).toBe("C");

		const pAOverC = estimateWinProbability(state, "A", "C");
		expect(pAOverC).toBeGreaterThan(0.5);
	});

	test("bradley-terry backend converges to sensible ordering", () => {
		const state = createRatingState(["A", "B", "C"], {
			backend: "bradley-terry",
			initialRating: 1500,
			kFactor: 24,
			tieValue: 0.5,
			provisionalMatches: 12,
			btIterations: 200,
			btTolerance: 1e-6,
		});

		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: 2 },
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 2 },
		];

		applyPairwiseBatch(state, results);
		const standings = getRatingStandings(state);

		expect(standings[0]?.id).toBe("A");
		expect(standings[2]?.id).toBe("C");
	});

	test("uncertainty drops as matches accumulate", () => {
		const state = createRatingState(["A", "B"], {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			tieValue: 0.5,
			provisionalMatches: 12,
		});

		const before = getRatingStandings(state);
		const beforeUncertaintyA =
			before.find((s) => s.id === "A")?.uncertainty ?? 0;

		applyPairwiseBatch(state, [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 0, scoreB: 1, round: 2 },
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 3 },
		]);

		const after = getRatingStandings(state);
		const afterUncertaintyA = after.find((s) => s.id === "A")?.uncertainty ?? 0;
		expect(afterUncertaintyA).toBeLessThan(beforeUncertaintyA);
	});
});
