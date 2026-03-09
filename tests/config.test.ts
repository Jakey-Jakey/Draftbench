import { beforeEach, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { interpolate, loadConfig, parseArgs, resetConfig } from "../config";

describe("config loading", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("loads example config successfully", () => {
		const config = loadConfig("config.example.toml");
		expect(config.roles.generators.length).toBeGreaterThan(0);
		expect(config.tournament.swissRounds).toBe(7);
		expect(config.tournament.stopRules.topK).toBe(8);
	});

	test("uses defaults when no config path specified", () => {
		// When no path specified (undefined), should use defaults without throwing
		// Note: This test may log "No config.toml found" which is expected
		const config = loadConfig(undefined);
		expect(config.roles.swissJudges[0]?.model).toContain("/");
		expect(config.roles.swissJudges.length).toBeGreaterThan(0);
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

	test("keeps default runsDirectory when [output] omits runsDirectory", () => {
		const tempPath = `tmp-output-missing-${Date.now()}.toml`;
		writeFileSync(tempPath, "[output]\n");
		try {
			const config = loadConfig(tempPath);
			expect(config.output.runsDirectory).toBe("runs");
		} finally {
			rmSync(tempPath, { force: true });
		}
	});

	test("rejects empty output.runsDirectory", () => {
		const tempPath = `tmp-output-empty-${Date.now()}.toml`;
		writeFileSync(tempPath, '[output]\nrunsDirectory = ""\n');
		try {
			expect(() => loadConfig(tempPath)).toThrow(
				"output.runsDirectory must be a non-empty string",
			);
		} finally {
			rmSync(tempPath, { force: true });
		}
	});

	test("validates model slugs contain /", () => {
		// This would require a test config with invalid slugs
		// For now just verify proper slugs work
		const config = loadConfig("config.example.toml");
		for (const gen of config.roles.generators) {
			expect(gen.model).toContain("/");
		}
	});

	test("auto-clamps stopRules.topK when contestants are fewer than requested", () => {
		const tempPath = `tmp-topk-clamp-${Date.now()}.toml`;
		writeFileSync(
			tempPath,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"
effort = "high"

[[roles.reviewers]]
model = "openai/gpt-5.2"
effort = "high"

[[roles.revisers]]
model = "openai/gpt-5.2"
effort = "high"

	[[roles.coarseJudges]]
	model = "openai/gpt-5.2"
	effort = "low"
	
	[[roles.fineJudges]]
	model = "openai/gpt-5.2"
	effort = "low"

[tournament]

[tournament.stopRules]
topK = 8
`,
		);
		try {
			const config = loadConfig(tempPath);
			expect(config.tournament.stopRules.topK).toBe(1);
		} finally {
			rmSync(tempPath, { force: true });
		}
	});

	test("parses rating/scheduling/stopRules overrides", () => {
		const tempPath = `tmp-rating-scheduling-${Date.now()}.toml`;
		writeFileSync(
			tempPath,
			`[tournament.rating]
enabled = true
backend = "bradley-terry"
kFactor = 18
initialRating = 1400
provisionalMatches = 10
tieValue = 0.5
btIterations = 150
btTolerance = 0.00001
ciBootstrapSamples = 120

[tournament.scheduling]
mode = "adaptive"
exploration = 0.2
avoidRepeatPenalty = 0.8
maxRepeatPairs = 3

[tournament.stopRules]
enabled = true
minBatches = 2
maxBatches = 4
topK = 6
minSeparation = 40
confidence = 0.9
stabilityBatches = 2
`,
		);
		try {
			const config = loadConfig(tempPath);
			expect(config.tournament.rating.backend).toBe("bradley-terry");
			expect(config.tournament.rating.kFactor).toBe(18);
			expect(config.tournament.scheduling.mode).toBe("adaptive");
			expect(config.tournament.scheduling.maxRepeatPairs).toBe(3);
			expect(config.tournament.stopRules.maxBatches).toBe(4);
		} finally {
			rmSync(tempPath, { force: true });
		}
	});
});

describe("config caching", () => {
	beforeEach(() => {
		resetConfig();
	});

	test("caches loaded config for same path", () => {
		const config1 = loadConfig("config.example.toml");
		const config2 = loadConfig("config.example.toml");
		expect(config1).toBe(config2);
	});

	test("reloads config when path changes", () => {
		const config1 = loadConfig("config.example.toml");
		// Use a different config file (defaults) or mock logic
		// For simplicity, just use undefined (defaults) which is different from "config.example.toml"
		const config2 = loadConfig(undefined);
		expect(config1).not.toBe(config2); // Should be different object instance
	});

	test("handles equivalent paths (normalization)", () => {
		// 1v1-swiss.toml vs ./1v1-swiss.toml
		const config1 = loadConfig("config.1v1-swiss.toml");
		const config2 = loadConfig("./config.1v1-swiss.toml");
		expect(config1).toBe(config2);
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

	test("parses --reuse-artifacts flag", () => {
		const args = parseArgs([
			"node",
			"index.ts",
			"--reuse-artifacts",
			"runs/2024-01-01T12-00-00",
		]);
		expect(args.reuseArtifactsDir).toBe("runs/2024-01-01T12-00-00");
	});

	test("parses --skip-coarse flag", () => {
		const args = parseArgs([
			"node",
			"index.ts",
			"--reuse-artifacts",
			"runs/2024-01-01T12-00-00",
			"--skip-coarse",
		]);
		expect(args.skipCoarse).toBe(true);
		expect(args.reuseArtifactsDir).toBe("runs/2024-01-01T12-00-00");
	});

	test("parses --skip-fine flag", () => {
		const args = parseArgs([
			"node",
			"index.ts",
			"--reuse-artifacts",
			"runs/2024-01-01T12-00-00",
			"--skip-fine",
		]);
		expect(args.skipFine).toBe(true);
	});

	test("parses --skip-coarse and --skip-fine together", () => {
		const args = parseArgs([
			"node",
			"index.ts",
			"--reuse-artifacts",
			"runs/2024-01-01T12-00-00",
			"--skip-coarse",
			"--skip-fine",
		]);
		expect(args.skipCoarse).toBe(true);
		expect(args.skipFine).toBe(true);
		expect(args.reuseArtifactsDir).toBe("runs/2024-01-01T12-00-00");
	});

	test("throws when --reuse-artifacts and --resume used together", () => {
		expect(() =>
			parseArgs([
				"node",
				"index.ts",
				"--reuse-artifacts",
				"runs/source",
				"--resume",
				"runs/target",
			]),
		).toThrow("Cannot use --reuse-artifacts and --resume together");
	});

	test("throws when --skip-coarse used without --reuse-artifacts", () => {
		expect(() => parseArgs(["node", "index.ts", "--skip-coarse"])).toThrow(
			"--skip-coarse and --skip-fine require --reuse-artifacts",
		);
	});

	test("throws when --skip-fine used without --reuse-artifacts", () => {
		expect(() => parseArgs(["node", "index.ts", "--skip-fine"])).toThrow(
			"--skip-coarse and --skip-fine require --reuse-artifacts",
		);
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
		const validEfforts = ["xhigh", "high", "medium", "low", "minimal", "none"];

		for (const gen of config.roles.generators) {
			if (gen.effort) {
				expect(validEfforts).toContain(gen.effort);
			}
		}
	});

	test("swissJudges is configured", () => {
		const config = loadConfig("config.example.toml");
		expect(config.roles.swissJudges.length).toBeGreaterThan(0);
		expect(config.roles.swissJudges[0]?.model).toContain("/");
	});

	test("supports roles.swissJudges array", () => {
		const tempPath = `tmp-swiss-judges-${Date.now()}.toml`;
		writeFileSync(
			tempPath,
			`[roles]
[[roles.swissJudges]]
model = "openai/gpt-5.2"
effort = "low"
[[roles.swissJudges]]
model = "anthropic/claude-opus-4.5"
effort = "low"
`,
		);
		try {
			const config = loadConfig(tempPath);
			expect(config.roles.swissJudges.length).toBe(2);
			expect(config.roles.swissJudges[0]?.model).toBe("openai/gpt-5.2");
		} finally {
			rmSync(tempPath, { force: true });
		}
	});

	test("supports coarse/fine/firstDraftSelection/fineRanking aliases", () => {
		const tempPath = `tmp-new-keys-${Date.now()}.toml`;
		writeFileSync(
			tempPath,
			`[roles]
[[roles.coarseJudges]]
model = "openai/gpt-5.2"
effort = "low"

[[roles.fineJudges]]
model = "openai/gpt-5.2"
effort = "low"

[tournament]
coarseRounds = 5
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = true
initialGenerations = 3
style = "per-model-rank"

[tournament.fineRanking]
enabled = true
maxTotalMatches = 12
maxMatchesPerBatch = 3
confidence = 0.9
targetWinProb = 0.5
minSeparation = 0
allowOverRepeatCap = false
`,
		);
		try {
			const config = loadConfig(tempPath);
			expect(config.roles.swissJudges[0]?.model).toBe("openai/gpt-5.2");
			expect(config.roles.finaleJudges[0]?.model).toBe("openai/gpt-5.2");
			expect(config.tournament.swissRounds).toBe(5);
			expect(config.tournament.swissFormat).toBe("1v1");
			expect(config.tournament.initialGenerations).toBe(3);
			expect(config.tournament.initialLeaderboard.enabled).toBe(true);
			expect(config.tournament.initialLeaderboard.style).toBe("per-model-rank");
			expect(config.tournament.finale.enabled).toBe(true);
			expect(config.tournament.finale.maxTotalMatches).toBe(12);
			expect(config.tournament.finale.maxMatchesPerBatch).toBe(3);
		} finally {
			rmSync(tempPath, { force: true });
		}
	});

	test("new keys override deprecated keys when both are set", () => {
		const tempPath = `tmp-alias-precedence-${Date.now()}.toml`;
		writeFileSync(
			tempPath,
			`[roles]
[[roles.swissJudges]]
model = "anthropic/claude-opus-4.5"
effort = "low"
[[roles.coarseJudges]]
model = "openai/gpt-5.2"
effort = "low"

[[roles.finaleJudges]]
model = "anthropic/claude-opus-4.5"
effort = "low"
[[roles.fineJudges]]
model = "openai/gpt-5.2"
effort = "low"

[tournament]
swissRounds = 7
coarseRounds = 5
swissFormat = "1v1v1"
coarseFormat = "1v1"

[tournament.initialLeaderboard]
enabled = false

[tournament.firstDraftSelection]
enabled = true
initialGenerations = 2
`,
		);
		try {
			const config = loadConfig(tempPath);
			expect(config.roles.swissJudges[0]?.model).toBe("openai/gpt-5.2");
			expect(config.roles.finaleJudges[0]?.model).toBe("openai/gpt-5.2");
			expect(config.tournament.swissRounds).toBe(5);
			expect(config.tournament.swissFormat).toBe("1v1");
			expect(config.tournament.initialLeaderboard.enabled).toBe(true);
			expect(config.tournament.initialGenerations).toBe(2);
		} finally {
			rmSync(tempPath, { force: true });
		}
	});

	test("legacy roles.swissJudge is rejected", () => {
		const tempPath = `tmp-legacy-swiss-judge-${Date.now()}.toml`;
		writeFileSync(
			tempPath,
			`[roles.swissJudge]
model = "google/gemini-3-pro-preview"
effort = "low"
`,
		);
		try {
			expect(() => loadConfig(tempPath)).toThrow(
				"roles.swissJudge is no longer supported",
			);
		} finally {
			rmSync(tempPath, { force: true });
		}
	});

	test("finaleJudges is an array", () => {
		const config = loadConfig("config.example.toml");
		expect(Array.isArray(config.roles.finaleJudges)).toBe(true);
		expect(config.roles.finaleJudges.length).toBeGreaterThan(0);
	});

	test("tournament config has required fields", () => {
		const config = loadConfig("config.example.toml");
		expect(config.tournament.initialGenerations).toBeGreaterThan(0);
		expect(config.tournament.swissRounds).toBeGreaterThan(0);
		expect(config.tournament.stopRules.topK).toBeGreaterThan(0);
		expect(config.tournament.finale.maxTotalMatches).toBeGreaterThanOrEqual(0);
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
		expect(config.prompts.review.userTemplate).toMatch(
			/\{(artifact|statblock)\}/,
		);
	});

	test("revise prompts have correct template variables", () => {
		const config = loadConfig("config.example.toml");
		expect(config.prompts.revise.userTemplate).toMatch(
			/\{(artifact|statblock)\}/,
		);
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

	test("getSwissJudges returns judge entries", () => {
		const { getSwissJudges } = require("../config");
		const judges = getSwissJudges();
		expect(Array.isArray(judges)).toBe(true);
		expect(judges.length).toBeGreaterThan(0);
	});

	test("getFinaleJudges returns judge array", () => {
		const { getFinaleJudges } = require("../config");
		const judges = getFinaleJudges();
		expect(Array.isArray(judges)).toBe(true);
		expect(judges.length).toBeGreaterThan(0);
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
