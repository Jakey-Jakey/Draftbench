import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig, resetConfig } from "../config";
import { computeLeaderboard, type SwissContestant } from "../leaderboard";
import type { StoredInitialLeaderboardResult } from "../state";

function createContestant(id: string, points = 0): SwissContestant {
	return {
		id,
		text: `Mock text for ${id}`,
		points,
		opponents: new Set(),
		placements: { first: 0, second: 0, third: 0 },
	};
}

describe("computeLeaderboard markdown", () => {
	beforeEach(() => {
		resetConfig();
		loadConfig("config.example.toml");
	});

	test("includes header and key sections", () => {
		const contestants = [
			createContestant("a_b_c", 10),
			createContestant("d_e_f", 8),
		];
		const md = computeLeaderboard(contestants, []);
		expect(md).toContain("# 🏆 Tournament Leaderboard");
		expect(md).toContain("## 🥇 Winner");
		expect(md).toContain("## Fine Ranking Summary");
		expect(md).toContain("## 🧭 Attribution Summary");
		expect(md).toContain("## 🏅 Final Rankings");
		expect(md).toContain("## 🌱 First Draft Selection");
	});

	test("shows '-' rating/CI when ratings are not present", () => {
		const contestants = [createContestant("a_b_c", 10)];
		const md = computeLeaderboard(contestants, []);
		expect(md).toContain("| # | Revision | Coarse | Rating | 95% CI |");
		expect(md).toContain("| 🥇1 |");
		expect(md).toContain("| 10 | - | - |");
	});

	test("renders seed selection (and generator seed column) when provided", () => {
		const contestants = [createContestant("a_b_c", 10)];
		const revisionsById = new Map([
			[
				"a_b_c",
				{
					task: {
						generator: "anthropic/claude-opus-4.5",
						reviewer: "anthropic/claude-opus-4.5",
						reviser: "anthropic/claude-opus-4.5",
					},
				},
			],
		]);
		const initialResults: StoredInitialLeaderboardResult[] = [
			{
				model: "anthropic/claude-opus-4.5",
				selectedDraftIndex: 2,
				totalDrafts: 5,
				wins: 4,
				draws: 0,
				losses: 0,
			},
		];
		const md = computeLeaderboard(
			contestants,
			[],
			revisionsById,
			initialResults,
			{ matches: 7, judgments: 14, iterations: 3, converged: true },
		);
		expect(md).toContain("## 🌱 First Draft Selection");
		expect(md).toContain("Draft 2/5");
		expect(md).toContain("4W/0D/0L");
		expect(md).toContain("+4");
		expect(md).toContain("### By Generator");
		expect(md).toContain("Matches run: 7");
	});
});
