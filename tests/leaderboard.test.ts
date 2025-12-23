import { describe, expect, test, beforeEach } from "bun:test";
import {
	getLeaderboard,
	type PlayoffResult,
	type SwissContestant,
	type SwissMatch,
} from "../leaderboard";
import { loadConfig, resetConfig } from "../config";

function createContestant(
	id: string,
	points = 0,
	first = 0,
	second = 0,
	third = 0,
): SwissContestant {
	return {
		id,
		text: `Mock text for ${id}`,
		points,
		opponents: new Set(),
		placements: { first, second, third },
	};
}

describe("getLeaderboard", () => {
	beforeEach(() => {
		resetConfig();
		loadConfig("config.example.toml");
	});

	describe("Swiss-only leaderboard", () => {
		test("sorts by points descending", () => {
			const contestants = [
				createContestant("A", 10),
				createContestant("B", 5),
				createContestant("C", 15),
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard[0]!.id).toBe("C"); // 15 points
			expect(leaderboard[1]!.id).toBe("A"); // 10 points
			expect(leaderboard[2]!.id).toBe("B"); // 5 points
		});

		test("breaks ties by first place finishes", () => {
			const contestants = [
				createContestant("A", 10, 3, 1, 0),
				createContestant("B", 10, 5, 0, 0),
				createContestant("C", 10, 1, 2, 1),
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard[0]!.id).toBe("B"); // Most 1sts
			expect(leaderboard[1]!.id).toBe("A");
			expect(leaderboard[2]!.id).toBe("C");
		});

		test("breaks ties by second place when first place tied", () => {
			const contestants = [
				createContestant("A", 10, 3, 2, 0),
				createContestant("B", 10, 3, 4, 0),
				createContestant("C", 10, 3, 1, 0),
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard[0]!.id).toBe("B"); // Most 2nds
			expect(leaderboard[1]!.id).toBe("A");
			expect(leaderboard[2]!.id).toBe("C");
		});

		test("includes rank in leaderboard entries", () => {
			const contestants = [
				createContestant("A", 10),
				createContestant("B", 5),
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard[0]!.rank).toBe(1);
			expect(leaderboard[1]!.rank).toBe(2);
		});

		test("includes all contestant data", () => {
			const contestants = [createContestant("A", 10, 2, 1, 0)];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			const entry = leaderboard[0]!;
			expect(entry.id).toBe("A");
			expect(entry.points).toBe(10);
			expect(entry.placements.first).toBe(2);
			expect(entry.placements.second).toBe(1);
			expect(entry.placements.third).toBe(0);
		});
	});

	describe("With playoff results", () => {
		test("includes playoff data when available", () => {
			const contestants = [
				createContestant("A", 10),
				createContestant("B", 8),
			];

			const playoffResults = new Map<string, PlayoffResult>([
				["A", { points: 5, wins: 5, losses: 0, draws: 0 }],
				["B", { points: 3, wins: 3, losses: 2, draws: 0 }],
			]);

			const leaderboard = getLeaderboard(
				contestants,
				[],
				playoffResults,
				new Map(),
			);

			expect(leaderboard[0]!.playoffPoints).toBe(5);
			expect(leaderboard[0]!.playoffWins).toBe(5);
			expect(leaderboard[1]!.playoffPoints).toBe(3);
			expect(leaderboard[1]!.playoffWins).toBe(3);
		});

		test("omits playoff data for non-playoff contestants", () => {
			const contestants = [
				createContestant("A", 10),
				createContestant("B", 5),
			];

			const playoffResults = new Map<string, PlayoffResult>([
				["A", { points: 5, wins: 5, losses: 0, draws: 0 }],
			]);

			const leaderboard = getLeaderboard(
				contestants,
				[],
				playoffResults,
				new Map(),
			);

			expect(leaderboard[0]!.playoffPoints).toBe(5);
			expect(leaderboard[1]!.playoffPoints).toBeUndefined();
		});

		test("includes draws in playoff results", () => {
			const contestants = [createContestant("A", 10)];

			const playoffResults = new Map<string, PlayoffResult>([
				["A", { points: 3.5, wins: 3, losses: 1, draws: 1 }],
			]);

			const leaderboard = getLeaderboard(
				contestants,
				[],
				playoffResults,
				new Map(),
			);

			expect(leaderboard[0]!.playoffPoints).toBe(3.5);
			expect(leaderboard[0]!.playoffDraws).toBe(1);
		});
	});

	describe("With revision metadata", () => {
		test("includes revision metadata when available", () => {
			const contestants = [createContestant("rev1", 10)];

			const revisionsById = new Map([
				[
					"rev1",
					{
						result: { text: "Text", model: "model" },
						task: {
							generator: "gen1",
							reviewer: "rev1",
							reviser: "reviser1",
							reviserEffort: "high",
							id: "rev1",
						},
					},
				],
			]);

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				revisionsById,
			);

			expect(leaderboard[0]!.generator).toBe("gen1");
			expect(leaderboard[0]!.reviewer).toBe("rev1");
			expect(leaderboard[0]!.reviser).toBe("reviser1");
		});

		test("handles missing revision metadata gracefully", () => {
			const contestants = [createContestant("unknown", 10)];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			// Defaults gracefully or uses ID parts
			// In implementation, it falls back to ID split if metadata missing
			// "unknown" -> gen="unknown", rev=undefined, revi=undefined
			expect(leaderboard[0]!.generator).toBe("unknown");
		});
	});

	describe("Edge cases", () => {
		test("handles empty contestants array", () => {
			const leaderboard = getLeaderboard([], [], new Map(), new Map());
			expect(leaderboard).toEqual([]);
		});

		test("handles single contestant", () => {
			const contestants = [createContestant("A", 10)];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard.length).toBe(1);
			expect(leaderboard[0]!.rank).toBe(1);
		});

		test("handles all contestants with 0 points", () => {
			const contestants = [
				createContestant("A", 0),
				createContestant("B", 0),
				createContestant("C", 0),
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard.length).toBe(3);
			// Should still assign ranks
			expect(leaderboard.map((e) => e.rank)).toEqual([1, 2, 3]);
		});

		test("handles negative points (shouldn't happen but be defensive)", () => {
			const contestants = [
				createContestant("A", -5),
				createContestant("B", 10),
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard[0]!.id).toBe("B"); // Positive points first
			expect(leaderboard[1]!.id).toBe("A");
		});

		test("handles very large point values", () => {
			const contestants = [
				createContestant("A", 1000000),
				createContestant("B", 999999),
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard[0]!.id).toBe("A");
			expect(leaderboard[0]!.points).toBe(1000000);
		});

		test("handles fractional playoff points", () => {
			const contestants = [createContestant("A", 10)];

			const playoffResults = new Map<string, PlayoffResult>([
				["A", { points: 4.5, wins: 4, losses: 1, draws: 1 }],
			]);

			const leaderboard = getLeaderboard(
				contestants,
				[],
				playoffResults,
				new Map(),
			);

			expect(leaderboard[0]!.playoffPoints).toBe(4.5);
		});
	});

	describe("Complex scenarios", () => {
		test("full tournament with 8 contestants and playoffs", () => {
			const contestants = [
				createContestant("C1", 12, 5, 1, 0),
				createContestant("C2", 12, 4, 2, 0),
				createContestant("C3", 10, 3, 2, 1),
				createContestant("C4", 10, 2, 3, 1),
				createContestant("C5", 8, 2, 2, 2),
				createContestant("C6", 8, 1, 3, 2),
				createContestant("C7", 6, 1, 2, 3),
				createContestant("C8", 4, 0, 2, 4),
			];

			// Top 4 make playoffs
			const playoffResults = new Map<string, PlayoffResult>([
				["C1", { points: 3, wins: 3, losses: 0, draws: 0 }],
				["C2", { points: 2, wins: 2, losses: 1, draws: 0 }],
				["C3", { points: 1.5, wins: 1, losses: 1, draws: 1 }],
				["C4", { points: 0.5, wins: 0, losses: 2, draws: 1 }],
			]);

			const leaderboard = getLeaderboard(
				contestants,
				[],
				playoffResults,
				new Map(),
			);

			// C1 should be first (most swiss points, most 1sts, won playoff)
			expect(leaderboard[0]!.id).toBe("C1");
			expect(leaderboard[0]!.rank).toBe(1);

			// C2 should be second
			expect(leaderboard[1]!.id).toBe("C2");

			// Verify all have ranks
			for (let i = 0; i < leaderboard.length; i++) {
				expect(leaderboard[i]!.rank).toBe(i + 1);
			}
		});

		test("tiebreaker cascade works correctly", () => {
			// All same points, different placement distributions
			const contestants = [
				createContestant("A", 10, 5, 0, 0), // Most 1sts
				createContestant("B", 10, 4, 1, 0), // Second most 1sts, 1 second
				createContestant("C", 10, 4, 0, 1), // Same 1sts as B, no 2nds
				createContestant("D", 10, 3, 2, 0), // Fewer 1sts, more 2nds
			];

			const leaderboard = getLeaderboard(
				contestants,
				[],
				new Map(),
				new Map(),
			);

			expect(leaderboard[0]!.id).toBe("A"); // Most 1sts
			expect(leaderboard[1]!.id).toBe("B"); // Second most 1sts, has 2nd
			expect(leaderboard[2]!.id).toBe("C"); // Same 1sts as B, no 2nds (but more 1sts than D)
			expect(leaderboard[3]!.id).toBe("D"); // Fewer 1sts than C
		});
	});
});