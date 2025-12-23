import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig, parseArgs, resetConfig } from "../config";

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
