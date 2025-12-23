import { describe, expect, test } from "bun:test";
import type { SwissContestant } from "../leaderboard";
import { generateSwissPairs, generateSwissTriples } from "../phases/swiss";

function createContestant(id: string, points = 0): SwissContestant {
	return {
		id,
		text: `Mock statblock for ${id}`,
		points,
		opponents: new Set<string>(),
		placements: { first: 0, second: 0, third: 0 },
	};
}

describe("generateSwissTriples", () => {
	test("groups 9 contestants into 3 triples", () => {
		const contestants = [
			createContestant("A", 4),
			createContestant("B", 4),
			createContestant("C", 3),
			createContestant("D", 3),
			createContestant("E", 2),
			createContestant("F", 2),
			createContestant("G", 1),
			createContestant("H", 1),
			createContestant("I", 0),
		];

		const { triples } = generateSwissTriples(contestants, 1);
		expect(triples.length).toBe(3);

		// Each triple should have 3 unique contestants
		for (const triple of triples) {
			expect(triple.length).toBe(3);
			expect(new Set(triple).size).toBe(3);
		}

		// All contestants should be used exactly once
		const allUsed = triples.flat();
		expect(new Set(allUsed).size).toBe(9);
	});

	test("handles leftover contestants (10 total)", () => {
		const contestants = Array.from({ length: 10 }, (_, i) =>
			createContestant(`C${i}`, 10 - i),
		);

		const { triples } = generateSwissTriples(contestants, 1);
		// 10 contestants = 3 triples (9 used) + 1 leftover
		expect(triples.length).toBe(3);
	});

	test("sorts by points (highest first)", () => {
		const contestants = [
			createContestant("Low", 0),
			createContestant("High", 10),
			createContestant("Mid", 5),
		];

		const { triples } = generateSwissTriples(contestants, 1);
		// High-pointed contestant should be in first position
		expect(triples[0]![0]).toBe("High");
	});
});

describe("generateSwissPairs", () => {
	test("pairs 6 contestants into 3 pairs", () => {
		const contestants = [
			createContestant("A", 4),
			createContestant("B", 4),
			createContestant("C", 2),
			createContestant("D", 2),
			createContestant("E", 0),
			createContestant("F", 0),
		];

		const { pairs, bye } = generateSwissPairs(contestants);
		expect(pairs.length).toBe(3);
		expect(bye).toBeNull();

		// Each pair should have 2 unique contestants
		for (const pair of pairs) {
			expect(pair.length).toBe(2);
			expect(pair[0]).not.toBe(pair[1]);
		}
	});

	test("assigns bye for odd number of contestants", () => {
		const contestants = [
			createContestant("A", 4),
			createContestant("B", 2),
			createContestant("C", 0),
		];

		const { pairs, bye } = generateSwissPairs(contestants);
		expect(pairs.length).toBe(1);
		expect(bye).not.toBeNull();
	});

	test("avoids re-pairing previous opponents", () => {
		const contestants = [
			createContestant("A", 4),
			createContestant("B", 4),
			createContestant("C", 2),
			createContestant("D", 2),
		];

		// A has already played B
		contestants[0]!.opponents.add("B");
		contestants[1]!.opponents.add("A");

		const { pairs } = generateSwissPairs(contestants);

		// A should not be paired with B again
		for (const [a, b] of pairs) {
			if (a === "A") expect(b).not.toBe("B");
			if (b === "A") expect(a).not.toBe("B");
		}
	});
});
