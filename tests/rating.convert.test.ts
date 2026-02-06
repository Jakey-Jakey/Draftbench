import { describe, expect, test } from "bun:test";
import type { SwissMatch } from "../leaderboard";
import { pairwiseFromSwissMatch } from "../rating/convert";

describe("pairwiseFromSwissMatch", () => {
	test("converts 1v1 head-to-head win", () => {
		const match: SwissMatch = {
			round: 1,
			ids: ["A", "B", "N/A"],
			first: "A",
			second: "B",
			third: "N/A",
			reasoning: "test",
			tieGroup: "none",
			sharedPoints: { A: 1, B: 0 },
		};

		const obs = pairwiseFromSwissMatch(match);
		expect(obs.length).toBe(1);
		expect(obs[0]).toMatchObject({ aId: "A", bId: "B", scoreA: 1, scoreB: 0 });
	});

	test("converts 1v1 draw", () => {
		const match: SwissMatch = {
			round: 2,
			ids: ["A", "B", "N/A"],
			first: "A",
			second: "B",
			third: "N/A",
			reasoning: "draw",
			tieGroup: "head_to_head",
			sharedPoints: { A: 0.5, B: 0.5 },
		};

		const obs = pairwiseFromSwissMatch(match);
		expect(obs[0]).toMatchObject({ scoreA: 0.5, scoreB: 0.5 });
	});

	test("respects tieValue override for draws", () => {
		const match: SwissMatch = {
			round: 2,
			ids: ["A", "B", "N/A"],
			first: "A",
			second: "B",
			third: "N/A",
			reasoning: "draw",
			tieGroup: "head_to_head",
			sharedPoints: { A: 0.5, B: 0.5 },
		};

		const obs = pairwiseFromSwissMatch(match, 0.25);
		expect(obs[0]).toMatchObject({ scoreA: 0.25, scoreB: 0.25 });
	});

	test("converts 1v1v1 into 3 pairwise edges", () => {
		const match: SwissMatch = {
			round: 1,
			ids: ["A", "B", "C"],
			first: "A",
			second: "B",
			third: "C",
			reasoning: "test",
			tieGroup: "none",
			sharedPoints: { A: 2, B: 1, C: 0 },
		};

		const obs = pairwiseFromSwissMatch(match);
		expect(obs.length).toBe(3);
		expect(obs.find((o) => o.aId === "A" && o.bId === "B")?.scoreA).toBe(1);
		expect(obs.find((o) => o.aId === "A" && o.bId === "C")?.scoreA).toBe(1);
		expect(obs.find((o) => o.aId === "B" && o.bId === "C")?.scoreA).toBe(1);
	});

	test("handles top2 ties", () => {
		const match: SwissMatch = {
			round: 3,
			ids: ["A", "B", "C"],
			first: "A",
			second: "B",
			third: "C",
			reasoning: "tie top2",
			tieGroup: "top2",
			sharedPoints: { A: 1.5, B: 1.5, C: 0 },
		};
		const obs = pairwiseFromSwissMatch(match);
		const ab = obs.find((o) => o.aId === "A" && o.bId === "B");
		expect(ab?.scoreA).toBe(0.5);
		expect(ab?.scoreB).toBe(0.5);
	});
});
