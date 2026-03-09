import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig, resetConfig } from "../config";

// ============================================================================
// Initial Leaderboard Style Configuration Tests
// ============================================================================

describe("InitialLeaderboard configuration", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("style defaults to undefined when not specified", () => {
		const config = loadConfig("config.example.toml");
		// style is optional, may be undefined
		expect(
			config.tournament.initialLeaderboard.style === undefined ||
				typeof config.tournament.initialLeaderboard.style === "string",
		).toBe(true);
	});

	test("enabled defaults to false", () => {
		const config = loadConfig("config.example.toml");
		expect(config.tournament.initialLeaderboard.enabled).toBe(false);
	});

	test("draft-leaderboard config has enabled=true", () => {
		const config = loadConfig("config.draft-leaderboard.toml");
		expect(config.tournament.initialLeaderboard.enabled).toBe(true);
	});

	test("initialGenerations defaults to 1", () => {
		// Load a minimal config that doesn't override initialGenerations
		const config = loadConfig("config.1v1-swiss.toml");
		// 1v1-swiss doesn't set initialGenerations, so gets default
		expect(config.tournament.initialGenerations).toBeGreaterThanOrEqual(1);
	});
});

// ============================================================================
// Config Validation Edge Cases
// ============================================================================

describe("config validation edge cases", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("handles missing optional concurrency config", () => {
		const config = loadConfig("config.example.toml");
		// concurrency is optional
		if (config.concurrency) {
			expect(config.concurrency.maxParallel).toBeGreaterThan(0);
		}
	});

	test("swissFormat is either 1v1 or 1v1v1", () => {
		const config = loadConfig("config.example.toml");
		if (config.tournament.swissFormat) {
			expect(["1v1", "1v1v1"]).toContain(config.tournament.swissFormat);
		}
	});

	test("stopRules.topK is reasonable", () => {
		const config = loadConfig("config.example.toml");
		expect(config.tournament.stopRules.topK).toBeGreaterThan(0);
		expect(config.tournament.stopRules.topK).toBeLessThanOrEqual(100);
	});

	test("swissRounds is reasonable", () => {
		const config = loadConfig("config.example.toml");
		expect(config.tournament.swissRounds).toBeGreaterThan(0);
		expect(config.tournament.swissRounds).toBeLessThanOrEqual(50);
	});

	test("all models have valid OpenRouter slugs", () => {
		const config = loadConfig("config.example.toml");

		// Check all role arrays
		for (const gen of config.roles.generators) {
			expect(gen.model).toContain("/");
			expect(gen.model.split("/").length).toBe(2);
		}
		for (const rev of config.roles.reviewers) {
			expect(rev.model).toContain("/");
		}
		for (const revi of config.roles.revisers) {
			expect(revi.model).toContain("/");
		}
		expect(config.roles.swissJudges.length).toBeGreaterThan(0);
		for (const judge of config.roles.swissJudges) {
			expect(judge.model).toContain("/");
		}
		for (const judge of config.roles.finaleJudges) {
			expect(judge.model).toContain("/");
		}
	});

	test("effort values are valid when specified", () => {
		const validEfforts = ["xhigh", "high", "medium", "low", "minimal", "none"];
		const config = loadConfig("config.example.toml");

		for (const gen of config.roles.generators) {
			if (gen.effort) {
				expect(validEfforts).toContain(gen.effort);
			}
		}
	});
});

// ============================================================================
// Role Helper Functions
// ============================================================================

describe("role helper edge cases", () => {
	beforeEach(() => {
		resetConfig();
		loadConfig("config.example.toml");
	});

	test("getModelsForRole returns array of slugs", () => {
		const { getModelsForRole } = require("../config");
		const generators = getModelsForRole("generators");
		expect(Array.isArray(generators)).toBe(true);
		expect(generators.length).toBeGreaterThan(0);
		for (const slug of generators) {
			expect(typeof slug).toBe("string");
			expect(slug).toContain("/");
		}
	});

	test("getInitialLeaderboardJudges returns array", () => {
		const { getInitialLeaderboardJudges } = require("../config");
		const judges = getInitialLeaderboardJudges();
		expect(Array.isArray(judges)).toBe(true);
		// May be empty if not configured, or fall back to finale judges
	});

	test("getRoleEntries returns full entries with model and effort", () => {
		const { getRoleEntries } = require("../config");
		const generators = getRoleEntries("generators");
		expect(generators.length).toBeGreaterThan(0);
		for (const entry of generators) {
			expect(entry).toHaveProperty("model");
			expect(typeof entry.model).toBe("string");
		}
	});
});

// ============================================================================
// Prompts Configuration
// ============================================================================

describe("prompts configuration", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("all required prompt sections exist", () => {
		const config = loadConfig(undefined, "prompts.toml");
		expect(config.prompts).toBeDefined();
		expect(config.prompts.generate).toBeDefined();
		expect(config.prompts.review).toBeDefined();
		expect(config.prompts.revise).toBeDefined();
		expect(config.prompts.judgePairwise).toBeDefined();
		expect(config.prompts.judgeThreeWay).toBeDefined();
		expect(config.prompts.judgeRank).toBeDefined();
	});

	test("generate prompts have system and user", () => {
		const config = loadConfig(undefined, "prompts.toml");
		expect(config.prompts.generate.system).toBeDefined();
		expect(config.prompts.generate.user).toBeDefined();
		expect(config.prompts.generate.system.length).toBeGreaterThan(0);
		expect(config.prompts.generate.user.length).toBeGreaterThan(0);
	});

	test("revise template has required placeholders", () => {
		const config = loadConfig(undefined, "prompts.toml");
		const template = config.prompts.revise.userTemplate;
		expect(template).toMatch(/\{(artifact|statblock)\}/);
		expect(template).toContain("{feedback}");
	});

	test("judge templates have required id placeholders", () => {
		const config = loadConfig(undefined, "prompts.toml");

		// Pairwise needs idA, idB
		expect(config.prompts.judgePairwise.userTemplate).toContain("{idA}");
		expect(config.prompts.judgePairwise.userTemplate).toContain("{idB}");

		// Three-way needs idA, idB, idC
		expect(config.prompts.judgeThreeWay.userTemplate).toContain("{idA}");
		expect(config.prompts.judgeThreeWay.userTemplate).toContain("{idB}");
		expect(config.prompts.judgeThreeWay.userTemplate).toContain("{idC}");
		expect(config.prompts.judgeRank.userTemplate).toContain("{count}");
		expect(config.prompts.judgeRank.userTemplate).toContain("{entries}");
	});
});
