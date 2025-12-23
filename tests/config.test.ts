import { beforeEach, describe, expect, test } from "bun:test";
import { interpolate, loadConfig, parseArgs, resetConfig } from "../config";

describe("config loading", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("loads example config successfully", () => {
		const config = loadConfig("config.example.toml");
		expect(config.roles.generators.length).toBeGreaterThan(0);
		expect(config.tournament.swissRounds).toBe(7);
		expect(config.tournament.playoffSize).toBe(8);
	});

	test("uses defaults when no config path specified", () => {
		// When no path specified (undefined), should use defaults without throwing
		// Note: This test may log "No config.toml found" which is expected
		const config = loadConfig(undefined);
		expect(config.roles.swissJudge.model).toContain("/");
		expect(config.roles.generators.length).toBeGreaterThan(0);
	});

	test("throws for explicitly specified missing config", () => {
		expect(() => {
			loadConfig("definitely-does-not-exist.toml");
		}).toThrow("Config file not found");
	});

	test("merges partial config with defaults", () => {
		resetConfig();
		const config = loadConfig("config.1v1-swiss.toml");
		// Should have custom value
		expect(config.tournament.swissFormat).toBe("1v1");
		expect(config.tournament.swissRounds).toBe(5);
		// Should still have defaults for unspecified fields
		expect(config.roles.generators.length).toBeGreaterThan(0);
	});

	test("validates model slugs contain /", () => {
		// This would require a test config with invalid slugs
		// For now just verify proper slugs work
		const config = loadConfig("config.example.toml");
		for (const gen of config.roles.generators) {
			expect(gen.model).toContain("/");
		}
	});
});

describe("CLI argument parsing", () => {
	test("parses --config flag", () => {
		const args = parseArgs(["node", "index.ts", "--config", "test.toml"]);
		expect(args.configPath).toBe("test.toml");
	});

	test("parses --prompts flag", () => {
		const args = parseArgs(["node", "index.ts", "--prompts", "custom.toml"]);
		expect(args.promptsPath).toBe("custom.toml");
	});

	test("parses --dry-run flag", () => {
		const args = parseArgs(["node", "index.ts", "--dry-run"]);
		expect(args.dryRun).toBe(true);
	});

	test("parses --resume flag", () => {
		const args = parseArgs(["node", "index.ts", "--resume", "runs/2024-01-01"]);
		expect(args.resumeDir).toBe("runs/2024-01-01");
	});

	test("parses multiple flags", () => {
		const args = parseArgs([
			"node",
			"index.ts",
			"--config",
			"myconfig.toml",
			"--prompts",
			"myprompts.toml",
			"--dry-run",
		]);
		expect(args.configPath).toBe("myconfig.toml");
		expect(args.promptsPath).toBe("myprompts.toml");
		expect(args.dryRun).toBe(true);
	});

	test("defaults to dryRun false", () => {
		const args = parseArgs(["node", "index.ts"]);
		expect(args.dryRun).toBe(false);
	});
});

describe("prompts loading", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("loads prompts from file", () => {
		const config = loadConfig(undefined, "prompts.toml");
		expect(config.prompts.generate.system).toContain("TTRPG");
		expect(config.prompts.generate.user).toContain("Doctor Doom");
	});

	test("throws for missing prompts file", () => {
		expect(() => {
			loadConfig(undefined, "nonexistent-prompts.toml");
		}).toThrow("Prompts file not found");
	});
});

describe("TOML configuration", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("parses role entries correctly", () => {
		const config = loadConfig("config.example.toml");
		expect(config.roles.generators).toBeDefined();
		expect(config.roles.generators.length).toBeGreaterThan(0);

		const firstGen = config.roles.generators[0];
		expect(firstGen).toHaveProperty("model");
		expect(firstGen).toHaveProperty("effort");
	});

	test("handles effort levels", () => {
		const config = loadConfig("config.example.toml");
		const validEfforts = [
			"xhigh",
			"high",
			"medium",
			"low",
			"minimal",
			"none",
		];

		for (const gen of config.roles.generators) {
			if (gen.effort) {
				expect(validEfforts).toContain(gen.effort);
			}
		}
	});

	test("swissJudge is configured", () => {
		const config = loadConfig("config.example.toml");
		expect(config.roles.swissJudge).toBeDefined();
		expect(config.roles.swissJudge.model).toContain("/");
	});

	test("playoffJudges is an array", () => {
		const config = loadConfig("config.example.toml");
		expect(Array.isArray(config.roles.playoffJudges)).toBe(true);
		expect(config.roles.playoffJudges.length).toBeGreaterThan(0);
	});

	test("tournament config has required fields", () => {
		const config = loadConfig("config.example.toml");
		expect(config.tournament.initialGenerations).toBeGreaterThan(0);
		expect(config.tournament.swissRounds).toBeGreaterThan(0);
		expect(config.tournament.playoffSize).toBeGreaterThan(0);
	});

	test("swissFormat is valid", () => {
		const config = loadConfig("config.example.toml");
		expect(config.tournament.swissFormat).toBeDefined();
		if (config.tournament.swissFormat) {
			expect(["1v1", "1v1v1"]).toContain(config.tournament.swissFormat);
		}
	});

	test("handles 1v1 swiss format config", () => {
		const config = loadConfig("config.1v1-swiss.toml");
		expect(config.tournament.swissFormat).toBe("1v1");
		expect(config.tournament.swissRounds).toBe(5);
	});

	test("handles draft leaderboard config", () => {
		const config = loadConfig("config.draft-leaderboard.toml");
		expect(config.tournament.initialGenerations).toBe(3);
		expect(config.tournament.initialLeaderboard.enabled).toBe(true);
	});

	test("output config has runsDirectory", () => {
		const config = loadConfig("config.example.toml");
		expect(config.output.runsDirectory).toBeDefined();
		expect(typeof config.output.runsDirectory).toBe("string");
	});

	test("concurrency config is optional", () => {
		const config = loadConfig("config.example.toml");
		// May or may not be set
		if (config.concurrency) {
			expect(config.concurrency.maxParallel).toBeGreaterThan(0);
		}
	});
});

describe("prompt configuration", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("loads prompts from config", () => {
		const config = loadConfig("config.example.toml");
		expect(config.prompts).toBeDefined();
		expect(config.prompts.generate).toBeDefined();
		expect(config.prompts.review).toBeDefined();
		expect(config.prompts.revise).toBeDefined();
	});

	test("generate prompts have system and user", () => {
		const config = loadConfig("config.example.toml");
		expect(config.prompts.generate.system).toBeDefined();
		expect(config.prompts.generate.user).toBeDefined();
		expect(typeof config.prompts.generate.system).toBe("string");
		expect(typeof config.prompts.generate.user).toBe("string");
	});

	test("review prompts have system and userTemplate", () => {
		const config = loadConfig("config.example.toml");
		expect(config.prompts.review.system).toBeDefined();
		expect(config.prompts.review.userTemplate).toBeDefined();
		expect(config.prompts.review.userTemplate).toContain("{statblock}");
	});

	test("revise prompts have correct template variables", () => {
		const config = loadConfig("config.example.toml");
		expect(config.prompts.revise.userTemplate).toContain("{statblock}");
		expect(config.prompts.revise.userTemplate).toContain("{feedback}");
	});

	test("judge prompts have correct template variables", () => {
		const config = loadConfig("config.example.toml");
		expect(config.prompts.judgePairwise.userTemplate).toContain("{idA}");
		expect(config.prompts.judgePairwise.userTemplate).toContain("{idB}");
		expect(config.prompts.judgeThreeWay.userTemplate).toContain("{idA}");
		expect(config.prompts.judgeThreeWay.userTemplate).toContain("{idB}");
		expect(config.prompts.judgeThreeWay.userTemplate).toContain("{idC}");
	});
});

describe("config helpers", () => {
	beforeEach(() => {
		resetConfig();
		loadConfig("config.example.toml");
	});

	test("getRoleEntries returns generators", () => {
		const { getRoleEntries } = require("../config");
		const gens = getRoleEntries("generators");
		expect(Array.isArray(gens)).toBe(true);
		expect(gens.length).toBeGreaterThan(0);
	});

	test("getRoleEntries returns reviewers", () => {
		const { getRoleEntries } = require("../config");
		const revs = getRoleEntries("reviewers");
		expect(Array.isArray(revs)).toBe(true);
		expect(revs.length).toBeGreaterThan(0);
	});

	test("getRoleEntries returns revisers", () => {
		const { getRoleEntries } = require("../config");
		const revs = getRoleEntries("revisers");
		expect(Array.isArray(revs)).toBe(true);
		expect(revs.length).toBeGreaterThan(0);
	});

	test("getModelsForRole returns model slugs", () => {
		const { getModelsForRole } = require("../config");
		const models = getModelsForRole("generators");
		expect(Array.isArray(models)).toBe(true);
		expect(models.length).toBeGreaterThan(0);
		for (const model of models) {
			expect(model).toContain("/");
		}
	});

	test("getSwissJudge returns judge entry", () => {
		const { getSwissJudge } = require("../config");
		const judge = getSwissJudge();
		expect(judge).toHaveProperty("model");
		expect(judge.model).toContain("/");
	});

	test("getPlayoffJudges returns judge array", () => {
		const { getPlayoffJudges } = require("../config");
		const judges = getPlayoffJudges();
		expect(Array.isArray(judges)).toBe(true);
		expect(judges.length).toBeGreaterThan(0);
	});
});

describe("interpolate function", () => {
	test("replaces single variable", () => {
		const result = interpolate("Hello {name}", { name: "World" });
		expect(result).toBe("Hello World");
	});

	test("replaces multiple variables", () => {
		const result = interpolate("{greeting} {name}!", {
			greeting: "Hello",
			name: "Alice",
		});
		expect(result).toBe("Hello Alice!");
	});

	test("handles missing variables", () => {
		const result = interpolate("Hello {name}", { other: "x" });
		expect(result).toBe("Hello {name}");
	});

	test("handles empty template", () => {
		const result = interpolate("", { name: "World" });
		expect(result).toBe("");
	});

	test("handles empty vars", () => {
		const result = interpolate("Hello {name}", {});
		expect(result).toBe("Hello {name}");
	});

	test("preserves text without variables", () => {
		const result = interpolate("No variables here", { name: "World" });
		expect(result).toBe("No variables here");
	});

	test("handles duplicate variable names", () => {
		const result = interpolate("{name} and {name}", { name: "Bob" });
		expect(result).toBe("Bob and Bob");
	});

	test("handles multiline templates", () => {
		const template = "Line 1: {var1}\nLine 2: {var2}";
		const result = interpolate(template, { var1: "A", var2: "B" });
		expect(result).toBe("Line 1: A\nLine 2: B");
	});

	test("handles special characters in values", () => {
		const result = interpolate("Path: {path}", {
			path: "/some/$pecial/path",
		});
		expect(result).toBe("Path: /some/$pecial/path");
	});
});
