import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig, resetConfig } from "../config";
import { computeRunSummary, type SwissContestant } from "../leaderboard";

function createContestant(id: string, points: number): SwissContestant {
	return {
		id,
		text: `Mock text for ${id}`,
		points,
		opponents: new Set(),
		placements: { first: 0, second: 0, third: 0 },
	};
}

describe("computeRunSummary", () => {
	beforeEach(() => {
		resetConfig();
		loadConfig("config.example.toml");
	});

	test("produces stable entries and attribution from revision ids + metadata", () => {
		const contestants = [
			createContestant("gen1_rev1_rv1", 10),
			createContestant("gen1_rev2_rv1", 8),
			createContestant("gen2_rev1_rv2", 6),
		];

		const revisionsById = new Map([
			[
				"gen1_rev1_rv1",
				{ task: { generator: "gen1", reviewer: "rev1", reviser: "rv1" } },
			],
			[
				"gen1_rev2_rv1",
				{ task: { generator: "gen1", reviewer: "rev2", reviser: "rv1" } },
			],
			[
				"gen2_rev1_rv2",
				{ task: { generator: "gen2", reviewer: "rev1", reviser: "rv2" } },
			],
		]);

		const summary = computeRunSummary({
			runDir: "runs/test",
			contestants,
			swissMatches: [],
			revisionsById,
			finaleSummary: {
				matches: 3,
				judgments: 3,
				iterations: 1,
				converged: true,
			},
			swissEarlyStopReason: "stable top-k with confidence separation",
		});

		expect(summary.version).toBe(1);
		expect(summary.runDir).toBe("runs/test");
		expect(summary.leaderboard.entries.length).toBe(3);

		const first = summary.leaderboard.entries[0];
		expect(first?.rank).toBe(1);
		expect(first?.revisionId).toBe("gen1_rev1_rv1");
		expect(first?.generator.token).toBe("gen1");
		expect(first?.generator.slug).toBe("gen1");
		expect(first?.reviewer.token).toBe("rev1");
		expect(first?.reviser.token).toBe("rv1");

		const genRows = summary.attribution.roles.generator;
		const gen1 = genRows.find((r) => r.key === "Gen1");
		const gen2 = genRows.find((r) => r.key === "Gen2");
		expect(gen1?.n).toBe(2);
		expect(gen2?.n).toBe(1);

		const pairRows = summary.attribution.pairs.gen_reviewer;
		expect(
			pairRows.some((r) => r.key.includes("Gen1 (gen) + Rev1 (rev)")),
		).toBe(true);
	});
});
