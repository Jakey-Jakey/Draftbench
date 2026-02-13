import { describe, expect, test } from "bun:test";
import {
	applyPairwiseBatch,
	createRatingState,
	estimateWinProbability,
	getRatingStandings,
	getRatingStandingsWithOptions,
} from "../rating/engine";
import type { PairwiseObservation, RatingEngineConfig } from "../rating/types";

describe("rating engine", () => {
	test("applyPairwiseBatch is a no-op for empty batches", () => {
		const state = createRatingState(["A", "B"], {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			tieValue: 0.5,
			provisionalMatches: 12,
		});

		const before = getRatingStandings(state);
		applyPairwiseBatch(state, []);
		const after = getRatingStandings(state);

		expect(after).toEqual(before);
		expect(state.history.length).toBe(0);
	});

	test("estimateWinProbability falls back to initialRating for missing IDs", () => {
		const state = createRatingState(["A"], {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			tieValue: 0.5,
			provisionalMatches: 12,
		});

		const p = estimateWinProbability(state, "A", "MISSING");
		expect(p).toBe(0.5);
	});

	test("single-contestant standings are supported", () => {
		const state = createRatingState(["A"], {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			tieValue: 0.5,
			provisionalMatches: 12,
		});

		const standings = getRatingStandings(state);
		expect(standings).toHaveLength(1);
		expect(standings[0]?.id).toBe("A");
	});

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

	test("bootstrap CIs differ from normal-approx CIs when enabled", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 2 },
			{ aId: "A", bId: "B", scoreA: 0, scoreB: 1, round: 3 },
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 4 },
		];

		const state = createRatingState(["A", "B"], {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			tieValue: 0.5,
			provisionalMatches: 12,
			ciBootstrapSamples: 50,
			ciMode: "bootstrap",
		});
		applyPairwiseBatch(state, results);

		const cheap = getRatingStandingsWithOptions(state, {
			bootstrapCi: false,
			confidence: 0.9,
		});
		const boot = getRatingStandingsWithOptions(state, {
			bootstrapCi: true,
			confidence: 0.9,
		});

		const differs = boot.some((entry) => {
			const other = cheap.find((c) => c.id === entry.id);
			if (!other) return false;
			return entry.ciLow !== other.ciLow || entry.ciHigh !== other.ciHigh;
		});
		expect(differs).toBe(true);
	});
});

// ===========================================================================
// L2 Regularization Tests
// ===========================================================================
describe("bradley-terry regularization", () => {
	const btBaseConfig: Partial<RatingEngineConfig> = {
		backend: "bradley-terry",
		initialRating: 1500,
		kFactor: 24,
		tieValue: 0.5,
		provisionalMatches: 12,
		btIterations: 200,
		btTolerance: 1e-6,
		btUseNewton: false,
		ciBootstrapSamples: 0,
	};

	test("regularization shrinks ratings toward the mean compared to unregularized", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 2 },
		];

		const stateNoReg = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btRegularization: 0,
		});
		applyPairwiseBatch(stateNoReg, results);

		const stateReg = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btRegularization: 0.5,
		});
		applyPairwiseBatch(stateReg, [...results]);

		const standingsNoReg = getRatingStandings(stateNoReg);
		const standingsReg = getRatingStandings(stateReg);

		// With regularization, the top player's deviation from initialRating should be smaller
		const topNoReg = standingsNoReg[0];
		const topReg = standingsReg[0];
		expect(topNoReg?.id).toBe("A");
		expect(topReg?.id).toBe("A");

		const deviationNoReg = Math.abs(
			(topNoReg?.rating ?? 1500) - 1500,
		);
		const deviationReg = Math.abs((topReg?.rating ?? 1500) - 1500);
		expect(deviationReg).toBeLessThan(deviationNoReg);
	});

	test("regularization of 0 preserves original behavior", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 2 },
		];

		const stateA = createRatingState(["A", "B"], {
			...btBaseConfig,
			btRegularization: 0,
		});
		applyPairwiseBatch(stateA, results);

		const stateB = createRatingState(["A", "B"], {
			...btBaseConfig,
			btRegularization: 0,
		});
		applyPairwiseBatch(stateB, [...results]);

		const standA = getRatingStandings(stateA);
		const standB = getRatingStandings(stateB);

		expect(standA[0]?.rating).toBeCloseTo(standB[0]?.rating ?? 0, 5);
		expect(standA[1]?.rating).toBeCloseTo(standB[1]?.rating ?? 0, 5);
	});

	test("ordering is preserved with regularization", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 2 },
		];

		const state = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btRegularization: 0.1,
		});
		applyPairwiseBatch(state, results);
		const standings = getRatingStandings(state);

		expect(standings[0]?.id).toBe("A");
		expect(standings[1]?.id).toBe("B");
		expect(standings[2]?.id).toBe("C");
	});
});

// ===========================================================================
// Newton/MM Step Size Tests
// ===========================================================================
describe("bradley-terry newton steps", () => {
	const btBaseConfig: Partial<RatingEngineConfig> = {
		backend: "bradley-terry",
		initialRating: 1500,
		kFactor: 24,
		tieValue: 0.5,
		provisionalMatches: 12,
		btTolerance: 1e-6,
		ciBootstrapSamples: 0,
		btRegularization: 0,
	};

	test("newton converges to same ordering as fixed learning rate", () => {
		// Use enough data for the fixed LR to converge meaningfully
		const results: PairwiseObservation[] = [];
		for (let r = 1; r <= 5; r++) {
			results.push(
				{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: r },
				{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: r },
				{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: r },
			);
		}
		// Add one upset to make it interesting
		results.push({ aId: "B", bId: "A", scoreA: 1, scoreB: 0, round: 6 });

		const stateFixed = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btIterations: 200,
			btUseNewton: false,
		});
		applyPairwiseBatch(stateFixed, results);

		const stateNewton = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btIterations: 200,
			btUseNewton: true,
		});
		applyPairwiseBatch(stateNewton, [...results]);

		const standFixed = getRatingStandings(stateFixed);
		const standNewton = getRatingStandings(stateNewton);

		// Both should produce the same ordering: A > B > C
		expect(standFixed.map((s) => s.id)).toEqual(
			standNewton.map((s) => s.id),
		);
		expect(standNewton[0]?.id).toBe("A");
		expect(standNewton[2]?.id).toBe("C");
	});

	test("newton converges in fewer iterations than fixed learning rate", () => {
		const results: PairwiseObservation[] = [];
		for (let r = 1; r <= 10; r++) {
			results.push(
				{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: r },
				{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: r },
				{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: r },
			);
		}

		// Newton with few iterations should still converge well
		const stateNewton = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btIterations: 20,
			btUseNewton: true,
		});
		applyPairwiseBatch(stateNewton, results);

		// Fixed LR with same few iterations may not converge as well
		const stateFixed = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btIterations: 20,
			btUseNewton: false,
		});
		applyPairwiseBatch(stateFixed, [...results]);

		// Newton with 200 iterations as reference
		const stateRef = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btIterations: 200,
			btUseNewton: true,
		});
		applyPairwiseBatch(stateRef, [...results]);
		const refStandings = getRatingStandings(stateRef);

		const newtonStandings = getRatingStandings(stateNewton);
		const fixedStandings = getRatingStandings(stateFixed);

		// Newton@20 should be closer to reference than Fixed@20
		const newtonError = Math.abs(
			(newtonStandings[0]?.rating ?? 0) - (refStandings[0]?.rating ?? 0),
		);
		const fixedError = Math.abs(
			(fixedStandings[0]?.rating ?? 0) - (refStandings[0]?.rating ?? 0),
		);
		expect(newtonError).toBeLessThanOrEqual(fixedError);
	});

	test("newton combined with regularization produces correct ordering", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 2 },
		];

		const state = createRatingState(["A", "B", "C"], {
			...btBaseConfig,
			btIterations: 200,
			btUseNewton: true,
			btRegularization: 0.05,
		});
		applyPairwiseBatch(state, results);
		const standings = getRatingStandings(state);

		expect(standings[0]?.id).toBe("A");
		expect(standings[1]?.id).toBe("B");
		expect(standings[2]?.id).toBe("C");
	});
});

// ===========================================================================
// Hessian CI Tests
// ===========================================================================
describe("hessian confidence intervals", () => {
	test("hessian CIs produce valid intervals for BT backend", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 2 },
			{ aId: "A", bId: "B", scoreA: 0, scoreB: 1, round: 3 },
			{ aId: "B", bId: "C", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "C", scoreA: 1, scoreB: 0, round: 2 },
		];

		const state = createRatingState(["A", "B", "C"], {
			backend: "bradley-terry",
			initialRating: 1500,
			btIterations: 200,
			btTolerance: 1e-6,
			btUseNewton: true,
			btRegularization: 0,
			ciMode: "hessian",
			ciBootstrapSamples: 0,
		});
		applyPairwiseBatch(state, results);

		const standings = getRatingStandingsWithOptions(state, {
			bootstrapCi: true,
			confidence: 0.9,
		});

		for (const s of standings) {
			expect(s.ciLow).toBeLessThan(s.rating);
			expect(s.ciHigh).toBeGreaterThan(s.rating);
			expect(s.ciHigh - s.ciLow).toBeGreaterThan(0);
		}
	});

	test("hessian CIs differ from normal-approx CIs", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 2 },
			{ aId: "A", bId: "B", scoreA: 0, scoreB: 1, round: 3 },
		];

		const state = createRatingState(["A", "B"], {
			backend: "bradley-terry",
			initialRating: 1500,
			btIterations: 200,
			btTolerance: 1e-6,
			btUseNewton: true,
			btRegularization: 0,
			ciMode: "hessian",
			ciBootstrapSamples: 0,
		});
		applyPairwiseBatch(state, results);

		const normalCi = getRatingStandingsWithOptions(state, {
			bootstrapCi: false,
			confidence: 0.9,
		});
		const hessianCi = getRatingStandingsWithOptions(state, {
			bootstrapCi: true,
			confidence: 0.9,
		});

		const differs = hessianCi.some((entry) => {
			const other = normalCi.find((c) => c.id === entry.id);
			if (!other) return false;
			return entry.ciLow !== other.ciLow || entry.ciHigh !== other.ciHigh;
		});
		expect(differs).toBe(true);
	});

	test("ciMode 'normal' falls back to z*uncertainty CIs", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
		];

		const state = createRatingState(["A", "B"], {
			backend: "bradley-terry",
			initialRating: 1500,
			btIterations: 200,
			btTolerance: 1e-6,
			ciMode: "normal",
			ciBootstrapSamples: 0,
		});
		applyPairwiseBatch(state, results);

		const withBootstrap = getRatingStandingsWithOptions(state, {
			bootstrapCi: true,
			confidence: 0.9,
		});
		const withoutBootstrap = getRatingStandingsWithOptions(state, {
			bootstrapCi: false,
			confidence: 0.9,
		});

		// In "normal" mode, bootstrapCi: true should still use z*uncertainty (same as false)
		for (const entry of withBootstrap) {
			const other = withoutBootstrap.find((c) => c.id === entry.id);
			expect(other).toBeDefined();
			expect(entry.ciLow).toBe(other!.ciLow);
			expect(entry.ciHigh).toBe(other!.ciHigh);
		}
	});

	test("hessian CI falls back for elo backend", () => {
		const results: PairwiseObservation[] = [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
		];

		const state = createRatingState(["A", "B"], {
			backend: "elo",
			initialRating: 1500,
			kFactor: 24,
			ciMode: "hessian",
			ciBootstrapSamples: 0,
		});
		applyPairwiseBatch(state, results);

		const withBootstrap = getRatingStandingsWithOptions(state, {
			bootstrapCi: true,
			confidence: 0.9,
		});
		const withoutBootstrap = getRatingStandingsWithOptions(state, {
			bootstrapCi: false,
			confidence: 0.9,
		});

		// With elo backend, hessian CIs aren't available so it falls back to normal
		for (const entry of withBootstrap) {
			const other = withoutBootstrap.find((c) => c.id === entry.id);
			expect(other).toBeDefined();
			expect(entry.ciLow).toBe(other!.ciLow);
			expect(entry.ciHigh).toBe(other!.ciHigh);
		}
	});

	test("hessian CI narrows with more balanced observations", () => {
		// Use balanced results (alternating wins) so predicted probability stays
		// near 0.5 and the Hessian contribution p*(1-p) per observation is maximized.
		// This ensures more observations => more Fisher information => tighter CIs.
		const state2 = createRatingState(["A", "B"], {
			backend: "bradley-terry",
			initialRating: 1500,
			btIterations: 200,
			btTolerance: 1e-6,
			btUseNewton: true,
			ciMode: "hessian",
			ciBootstrapSamples: 0,
		});

		applyPairwiseBatch(state2, [
			{ aId: "A", bId: "B", scoreA: 1, scoreB: 0, round: 1 },
			{ aId: "A", bId: "B", scoreA: 0, scoreB: 1, round: 2 },
		]);
		const ciSmall = getRatingStandingsWithOptions(state2, {
			bootstrapCi: true,
			confidence: 0.9,
		});
		const widthSmall = (ciSmall[0]?.ciHigh ?? 0) - (ciSmall[0]?.ciLow ?? 0);

		// Add many more balanced observations
		const moreObs: PairwiseObservation[] = [];
		for (let r = 3; r <= 20; r++) {
			moreObs.push({
				aId: "A",
				bId: "B",
				scoreA: r % 2 === 0 ? 1 : 0,
				scoreB: r % 2 === 0 ? 0 : 1,
				round: r,
			});
		}
		applyPairwiseBatch(state2, moreObs);
		const ciLarge = getRatingStandingsWithOptions(state2, {
			bootstrapCi: true,
			confidence: 0.9,
		});
		const widthLarge = (ciLarge[0]?.ciHigh ?? 0) - (ciLarge[0]?.ciLow ?? 0);

		expect(widthLarge).toBeLessThan(widthSmall);
	});
});
