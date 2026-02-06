import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig, resetConfig } from "../config";
import { getLeaderboard, type SwissContestant } from "../leaderboard";

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

	test("sorts by Swiss points when ratings are missing", () => {
		const contestants = [
			createContestant("A", 10),
			createContestant("B", 5),
			createContestant("C", 15),
		];

		const leaderboard = getLeaderboard(contestants, []);
		expect(leaderboard[0]?.id).toBe("C");
		expect(leaderboard[1]?.id).toBe("A");
		expect(leaderboard[2]?.id).toBe("B");
	});

	test("sorts by rating when all contestants have ratings", () => {
		const contestants: SwissContestant[] = [
			{ ...createContestant("A", 10), rating: 1200 },
			{ ...createContestant("B", 20), rating: 1250 },
			{ ...createContestant("C", 30), rating: 1100 },
		];

		const leaderboard = getLeaderboard(contestants, []);
		expect(leaderboard[0]?.id).toBe("B");
		expect(leaderboard[1]?.id).toBe("A");
		expect(leaderboard[2]?.id).toBe("C");
	});

	test("includes rank field", () => {
		const contestants = [createContestant("A", 10), createContestant("B", 5)];
		const leaderboard = getLeaderboard(contestants, []);
		expect(leaderboard[0]?.rank).toBe(1);
		expect(leaderboard[1]?.rank).toBe(2);
	});

	test("breaks ties by first then second placements", () => {
		const contestants = [
			createContestant("A", 10, 3, 1, 0),
			createContestant("B", 10, 3, 4, 0),
			createContestant("C", 10, 2, 10, 0),
		];

		const leaderboard = getLeaderboard(contestants, []);
		expect(leaderboard[0]?.id).toBe("B");
		expect(leaderboard[1]?.id).toBe("A");
		expect(leaderboard[2]?.id).toBe("C");
	});

	test("includes revision metadata when provided", () => {
		const contestants = [createContestant("rev1", 10)];
		const revisionsById = new Map([
			[
				"rev1",
				{
					task: { generator: "gen1", reviewer: "rev2", reviser: "rev3" },
				},
			],
		]);

		const leaderboard = getLeaderboard(contestants, [], revisionsById);
		expect(leaderboard[0]?.generator).toBe("gen1");
		expect(leaderboard[0]?.reviewer).toBe("rev2");
		expect(leaderboard[0]?.reviser).toBe("rev3");
	});
});
