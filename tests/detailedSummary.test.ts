import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig, resetConfig } from "../config";
import type { SwissContestant, SwissMatch } from "../leaderboard";
import { computeDetailedRunSummary } from "../report/detailedSummary";
import type { StoredFinaleMatch } from "../state";

function contestant(id: string, points = 0): SwissContestant {
	return {
		id,
		text: `Mock text for ${id}`,
		points,
		opponents: new Set(),
		placements: { first: 0, second: 0, third: 0 },
	};
}

describe("computeDetailedRunSummary", () => {
	beforeEach(() => {
		resetConfig();
		loadConfig("config.example.toml");
	});

	test("includes coarse round diagnostics and fine iteration diagnostics", async () => {
		const a = "gen1_rev1_rv1";
		const b = "gen2_rev2_rv2";
		const c = "gen3_rev3_rv3";

		const contestants = [contestant(a), contestant(b), contestant(c)];

		const swissMatches: SwissMatch[] = [
			{
				round: 1,
				ids: [a, b, c],
				first: a,
				second: b,
				third: c,
				reasoning: "mock",
				tieGroup: "none",
				sharedPoints: { [a]: 2, [b]: 1, [c]: 0 },
			},
			{
				round: 2,
				ids: [a, b, c],
				first: b,
				second: c,
				third: a,
				reasoning: "mock",
				tieGroup: "none",
				sharedPoints: { [b]: 2, [c]: 1, [a]: 0 },
			},
		];

		const finaleMatches: StoredFinaleMatch[] = [
			{
				iteration: 1,
				aId: a,
				bId: b,
				scoreA: 1,
				scoreB: 0,
				votesA: 2,
				votesB: 0,
				judges: ["judge-1", "judge-2"],
			},
		];

		const detailed = await computeDetailedRunSummary({
			runDir: "/tmp/draftbench-test-run",
			contestants,
			swissMatches,
			finaleMatches,
			finaleSummary: { matches: 1, judgments: 2, iterations: 1, converged: false },
			swissStopReason: null,
			includeHashes: false,
		});

		expect(detailed.version).toBe(1);
		expect(detailed.coarseRanking.rounds.length).toBe(2);
		expect(detailed.coarseRanking.matches.length).toBe(2);
		expect(detailed.coarseRanking.rounds[0]?.stopRuleEvaluation).toBeDefined();
		expect(detailed.coarseRanking.matches[0]?.judgmentFile).toContain(
			"swiss_judgments",
		);

		expect(detailed.fineRanking.iterations.length).toBe(1);
		expect(detailed.fineRanking.iterations[0]?.iteration).toBe(1);
		expect(detailed.fineRanking.iterations[0]?.matches.length).toBe(1);
		expect(detailed.fineRanking.iterations[0]?.matches[0]?.judgmentFile).toContain(
			"finale_judgments",
		);
	});
});

