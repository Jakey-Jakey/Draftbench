import { describe, expect, test } from "bun:test";
import type { RatingStanding } from "../rating/types";
import { evaluateStopRules } from "../scheduling/stopRules";

const standings: RatingStanding[] = [
	{
		id: "A",
		rating: 1600,
		matches: 10,
		wins: 7,
		losses: 2,
		draws: 1,
		uncertainty: 25,
		ciLow: 1560,
		ciHigh: 1640,
	},
	{
		id: "B",
		rating: 1540,
		matches: 10,
		wins: 6,
		losses: 3,
		draws: 1,
		uncertainty: 25,
		ciLow: 1500,
		ciHigh: 1580,
	},
	{
		id: "C",
		rating: 1450,
		matches: 10,
		wins: 3,
		losses: 6,
		draws: 1,
		uncertainty: 25,
		ciLow: 1410,
		ciHigh: 1490,
	},
];

describe("stop rules", () => {
	test("does not stop before min batches", () => {
		const result = evaluateStopRules(
			{
				round: 2,
				totalCalls: 40,
				standings,
				topKHistory: [
					["A", "B"],
					["A", "B"],
				],
			},
			{
				enabled: true,
				minBatches: 3,
				maxBatches: 8,
				topK: 2,
				minSeparation: 40,
				confidence: 0.9,
				stabilityBatches: 2,
			},
		);
		expect(result.shouldStop).toBe(false);
	});

	test("stops at max batches", () => {
		const result = evaluateStopRules(
			{
				round: 8,
				totalCalls: 100,
				standings,
				topKHistory: [
					["A", "B"],
					["A", "B"],
				],
			},
			{
				enabled: true,
				minBatches: 3,
				maxBatches: 8,
				topK: 2,
				minSeparation: 999,
				confidence: 0.95,
				stabilityBatches: 3,
			},
		);
		expect(result.shouldStop).toBe(true);
		expect(result.reason).toContain("max batches");
	});

	test("stops when top-k is stable and separated", () => {
		const result = evaluateStopRules(
			{
				round: 5,
				totalCalls: 80,
				standings,
				topKHistory: [
					["A", "B"],
					["A", "B"],
					["A", "B"],
				],
			},
			{
				enabled: true,
				minBatches: 3,
				maxBatches: 9,
				topK: 2,
				minSeparation: 50,
				confidence: 0.9,
				stabilityBatches: 2,
			},
		);
		expect(result.shouldStop).toBe(true);
		expect(result.reason).toContain("stable");
	});

	test("minSeparation=0 does not auto-stop (requires confidence)", () => {
		const result = evaluateStopRules(
			{
				round: 5,
				totalCalls: 80,
				standings,
				topKHistory: [
					["A", "B"],
					["A", "B"],
					["A", "B"],
				],
			},
			{
				enabled: true,
				minBatches: 3,
				maxBatches: 9,
				topK: 2,
				minSeparation: 0,
				confidence: 0.99,
				stabilityBatches: 2,
			},
		);
		expect(result.shouldStop).toBe(false);
	});
});
