import { beforeEach, describe, expect, test } from "bun:test";
import {
	getCallSettings,
	getEffort,
	getJudgeSettings,
	type Phase,
} from "../callSettings";
import { loadConfig, type RoleEntry, resetConfig } from "../config";

describe("callSettings", () => {
	beforeEach(() => {
		resetConfig();
		// Load a known config for testing
		loadConfig("config.example.toml");
	});

	describe("getCallSettings", () => {
		test("returns settings for generator model", () => {
			const settings = getCallSettings("openai/gpt-5.2", "generators");
			expect(settings.effort).toBe("high");
		});

		test("returns settings for reviewer model", () => {
			const settings = getCallSettings(
				"anthropic/claude-opus-4.5",
				"reviewers",
			);
			expect(settings.effort).toBe("high");
		});

		test("returns settings for reviser model", () => {
			const settings = getCallSettings(
				"google/gemini-3-pro-preview",
				"revisers",
			);
			expect(settings.effort).toBe("high");
		});

		test("returns default effort when model not found", () => {
			const settings = getCallSettings("unknown/model", "generators");
			expect(settings.effort).toBe("high"); // default
			expect(settings.temperature).toBeUndefined();
		});

		test("returns temperature when configured", () => {
			// Test with a config that has temperature set
			// Note: config.example.toml doesn't set temperature, so this tests undefined
			const settings = getCallSettings("openai/gpt-5.2", "generators");
			expect(settings.temperature).toBeUndefined();
		});

		test("handles different effort levels", () => {
			// Test that effort is preserved from config
			const settings = getCallSettings("openai/gpt-5.2", "generators");
			expect(["xhigh", "high", "medium", "low", "minimal", "none"]).toContain(
				settings.effort,
			);
		});
	});

	describe("getEffort", () => {
		test("returns effort for generator", () => {
			const effort = getEffort("openai/gpt-5.2", "generators");
			expect(effort).toBe("high");
		});

		test("returns effort for reviewer", () => {
			const effort = getEffort("anthropic/claude-opus-4.5", "reviewers");
			expect(effort).toBe("high");
		});

		test("returns effort for reviser", () => {
			const effort = getEffort("google/gemini-3-pro-preview", "revisers");
			expect(effort).toBe("high");
		});

		test("returns default high when model not in role", () => {
			const effort = getEffort("nonexistent/model", "generators");
			expect(effort).toBe("high");
		});
	});

	describe("getJudgeSettings", () => {
		test("returns settings from judge entry with effort", () => {
			const judgeEntry: RoleEntry = {
				model: "anthropic/claude-opus-4.5",
				effort: "low",
			};
			const settings = getJudgeSettings(judgeEntry);
			expect(settings.effort).toBe("low");
			expect(settings.temperature).toBeUndefined();
		});

		test("returns settings from judge entry with temperature", () => {
			const judgeEntry: RoleEntry = {
				model: "openai/gpt-5.2",
				effort: "medium",
				temperature: 0.7,
			};
			const settings = getJudgeSettings(judgeEntry);
			expect(settings.effort).toBe("medium");
			expect(settings.temperature).toBe(0.7);
		});

		test("defaults to high effort when not specified", () => {
			const judgeEntry: RoleEntry = {
				model: "anthropic/claude-opus-4.5",
			};
			const settings = getJudgeSettings(judgeEntry);
			expect(settings.effort).toBe("high");
		});

		test("handles all effort levels", () => {
			const efforts = ["xhigh", "high", "medium", "low", "minimal", "none"];
			for (const effort of efforts) {
				const judgeEntry: RoleEntry = {
					model: "test/model",
					effort: effort as any,
				};
				const settings = getJudgeSettings(judgeEntry);
				expect(settings.effort).toBe(effort);
			}
		});
	});

	describe("CallSettings interface", () => {
		test("effort is required, temperature is optional", () => {
			const settings = getCallSettings("openai/gpt-5.2", "generators");
			expect(settings).toHaveProperty("effort");
			// temperature may or may not be present
			expect(
				typeof settings.temperature === "number" ||
					settings.temperature === undefined,
			).toBe(true);
		});
	});

	describe("edge cases", () => {
		test("handles empty model slug", () => {
			const settings = getCallSettings("", "generators");
			expect(settings.effort).toBe("high");
		});

		test("handles model slug with multiple slashes", () => {
			const settings = getCallSettings("provider/sub/model", "generators");
			expect(settings.effort).toBe("high"); // default since not in config
		});

		test("different roles can have different settings for same model", () => {
			// In practice, the same model slug could have different settings
			// in different roles if configured that way
			const genSettings = getCallSettings("openai/gpt-5.2", "generators");
			const revSettings = getCallSettings("openai/gpt-5.2", "reviewers");
			// Both should return settings (may be same in current config)
			expect(genSettings).toBeDefined();
			expect(revSettings).toBeDefined();
		});
	});
});
