import { describe, expect, test } from "bun:test";
import type { GenerateResult } from "../aiClient";
import { buildGlobalRankInputs } from "../phases/initialLeaderboard";

describe("Judge anonymization", () => {
	test("global-rank uses opaque IDs (no model tokens) for judgeStatblocks()", () => {
		const generatorSlugs = [
			"anthropic/claude-opus-4.5",
			"openai/gpt-5.2",
		] as const;

		const draftsByModel = new Map<string, GenerateResult[]>([
			[
				generatorSlugs[0],
				[
					{ model: generatorSlugs[0], text: "draft a1" },
					{ model: generatorSlugs[0], text: "draft a2" },
				],
			],
			[
				generatorSlugs[1],
				[
					{ model: generatorSlugs[1], text: "draft b1" },
					{ model: generatorSlugs[1], text: "draft b2" },
				],
			],
		]);

		const { statblockMap, idToStanding } = buildGlobalRankInputs(
			[...generatorSlugs],
			draftsByModel,
		);

		const ids = Array.from(statblockMap.keys());
		expect(ids).toEqual(["R1", "R2", "R3", "R4"]);
		expect(ids.length).toBe(idToStanding.size);

		for (const id of ids) {
			// Strictly opaque, predictable IDs for judge prompts.
			expect(id).toMatch(/^R\d+$/);
			expect(id).not.toContain("/");
			expect(id).not.toContain(".");
		}
	});
});
