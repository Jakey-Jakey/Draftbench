import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	createInitialState,
	isPhaseCompleted,
	loadState,
	markPhaseCompleted,
	saveState,
	type PipelineState,
} from "../state";

const TEST_RUN_DIR = join(process.cwd(), "test-runs", `test-${Date.now()}`);

describe("PipelineState", () => {
	beforeEach(() => {
		// Create test directory
		if (!existsSync(TEST_RUN_DIR)) {
			mkdirSync(TEST_RUN_DIR, { recursive: true });
		}
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(TEST_RUN_DIR)) {
			rmSync(TEST_RUN_DIR, { recursive: true, force: true });
		}
	});

	describe("createInitialState", () => {
		test("creates state with all phases incomplete", () => {
			const state = createInitialState();

			expect(state.phasesCompleted).toEqual([]);
			expect(state.generatedDrafts).toBeNull();
			expect(state.selectedDrafts).toBeNull();
			expect(state.reviews).toBeNull();
			expect(state.revisions).toBeNull();
			expect(state.contestants).toBeNull();
			expect(state.playoffResults).toBeNull();
			expect(state.swissMatches).toEqual([]);
		});

		test("creates valid state object", () => {
			const state = createInitialState();

			expect(state).toHaveProperty("phasesCompleted");
			expect(state).toHaveProperty("generatedDrafts");
			expect(state).toHaveProperty("version");
			expect(state.version).toBe(1);
		});
	});

	describe("saveState and loadState", () => {
		test("saves and loads state correctly", async () => {
			const state = createInitialState();
			state.phasesCompleted.push("generate");
			state.generatedDrafts = new Map([
				["model1", [{ text: "Test draft", model: "model1" }]],
			]);

			await saveState(TEST_RUN_DIR, state);

			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded).not.toBeNull();
			if (loaded) {
				expect(loaded.phasesCompleted).toContain("generate");
				expect(loaded.generatedDrafts).toBeDefined();
				expect(loaded.generatedDrafts?.get("model1")?.[0]?.text).toBe(
					"Test draft",
				);
			}
		});

		test("preserves all state fields", async () => {
			const state = createInitialState();
			state.phasesCompleted = ["generate", "review"];
			state.generatedDrafts = new Map([
				["model1", [{ text: "Draft 1", model: "model1" }]],
			]);
			state.selectedDrafts = new Map([
				["model1", { text: "Draft 1", model: "model1" }],
			]);
			state.reviews = [
				{
					text: "Review 1",
					reviewer: "reviewer1",
					reviewed: "model1",
				},
			];

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded).not.toBeNull();
			if (loaded) {
				expect(loaded.phasesCompleted).toEqual(state.phasesCompleted);
				expect(loaded.generatedDrafts).toEqual(state.generatedDrafts);
				expect(loaded.selectedDrafts).toEqual(state.selectedDrafts);
				expect(loaded.reviews).toEqual(state.reviews);
			}
		});

		test("loads state from existing file", async () => {
			// Manually create a state file that matches the Zod schema
			const manualState = {
				version: 1,
				timestamp: new Date().toISOString(),
				phase: 1,
				phasesCompleted: ["generate"],
				generatedDrafts: {
					"manual/model": [{ text: "Manual draft", model: "manual/model" }],
				},
				selectedDrafts: null,
				reviews: null,
				revisions: null,
				swissRound: 0,
				swissMatches: [],
				contestants: null,
				playoffResults: null,
			};

			const statePath = join(TEST_RUN_DIR, "state.json");
			writeFileSync(statePath, JSON.stringify(manualState, null, 2));

			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded).not.toBeNull();
			if (loaded) {
				expect(loaded.phasesCompleted).toContain("generate");
				expect(loaded.generatedDrafts?.get("manual/model")?.[0]?.text).toBe(
					"Manual draft",
				);
			}
		});

		test("returns null when file doesn't exist", async () => {
			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded).toBeNull();
		});

		test("handles swiss contestants state", async () => {
			const state = createInitialState();
			state.contestants = [
				{
					id: "contestant1",
					points: 2,
					opponents: ["contestant2"],
					placements: { first: 1, second: 0, third: 0 },
				},
			];

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded).not.toBeNull();
			if (loaded) {
				expect(loaded.contestants).toBeDefined();
				expect(loaded.contestants![0]!.id).toBe("contestant1");
				expect(loaded.contestants![0]!.points).toBe(2);
			}
		});

		test("handles swiss matches state", async () => {
			const state = createInitialState();
			state.swissMatches = [
				{
					round: 1,
					ids: ["id1", "id2", "id3"],
					first: "id1",
					second: "id2",
					third: "id3",
					reasoning: "Test reasoning",
				},
			];

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded).not.toBeNull();
			if (loaded) {
				expect(loaded.swissMatches).toBeDefined();
				expect(loaded.swissMatches![0]!.round).toBe(1);
				expect(loaded.swissMatches![0]!.first).toBe("id1");
			}
		});

		test("handles playoff results state", async () => {
			const state = createInitialState();
			state.playoffResults = [
				{
					id: "contestant1",
					points: 3.5,
					wins: 3,
					draws: 1,
					losses: 1,
				},
			];

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded).not.toBeNull();
			if (loaded) {
				expect(loaded.playoffResults).toBeDefined();
				expect(loaded.playoffResults![0]!.id).toBe("contestant1");
				expect(loaded.playoffResults![0]!.points).toBe(3.5);
			}
		});
	});

	describe("isPhaseCompleted", () => {
		test("returns true for completed phase", () => {
			const state = createInitialState();
			state.phasesCompleted.push("generate");

			expect(isPhaseCompleted(state, "generate")).toBe(true);
		});

		test("returns false for incomplete phase", () => {
			const state = createInitialState();

			expect(isPhaseCompleted(state, "generate")).toBe(false);
		});

		test("checks all phase types", () => {
			const state = createInitialState();
			state.phasesCompleted = [
				"generate",
				"initialLeaderboard",
				"review",
				"revise",
				"swiss",
				"playoff",
			];

			expect(isPhaseCompleted(state, "generate")).toBe(true);
			expect(isPhaseCompleted(state, "initialLeaderboard")).toBe(true);
			expect(isPhaseCompleted(state, "review")).toBe(true);
			expect(isPhaseCompleted(state, "revise")).toBe(true);
			expect(isPhaseCompleted(state, "swiss")).toBe(true);
			expect(isPhaseCompleted(state, "playoff")).toBe(true);
		});

		test("returns false for typo in phase name", () => {
			const state = createInitialState();
			state.phasesCompleted.push("generate");

			// Testing invalid phase name
			expect(isPhaseCompleted(state, "generat")).toBe(false);
		});
	});

	describe("markPhaseCompleted", () => {
		test("marks phase as completed", () => {
			const state = createInitialState();

			markPhaseCompleted(state, "generate");

			expect(state.phasesCompleted).toContain("generate");
		});

		test("does not duplicate phase", () => {
			const state = createInitialState();

			markPhaseCompleted(state, "generate");
			markPhaseCompleted(state, "generate");

			expect(
				state.phasesCompleted.filter((p) => p === "generate").length,
			).toBe(1);
		});

		test("can mark multiple phases", () => {
			const state = createInitialState();

			markPhaseCompleted(state, "generate");
			markPhaseCompleted(state, "review");
			markPhaseCompleted(state, "revise");

			expect(state.phasesCompleted).toContain("generate");
			expect(state.phasesCompleted).toContain("review");
			expect(state.phasesCompleted).toContain("revise");
			expect(state.phasesCompleted.length).toBe(3);
		});
	});

	describe("state persistence", () => {
		test("state survives save/load cycle with complex data", async () => {
			const state = createInitialState();
			state.phasesCompleted = ["generate", "review", "revise"];
			// populate other fields as needed for test, but key is matching structure

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded).toEqual(state);
		});

		test("handles missing optional fields", async () => {
			const state = createInitialState();
			// Don't set optional fields
			// They are null by default in createInitialState

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded).not.toBeNull();
			if (loaded) {
				expect(loaded.contestants).toBeNull();
				expect(loaded.swissMatches).toEqual([]);
				expect(loaded.playoffResults).toBeNull();
			}
		});
	});

	describe("error handling", () => {
		test("loadState handles corrupted JSON gracefully", async () => {
			const statePath = join(TEST_RUN_DIR, "state.json");
			writeFileSync(statePath, "{ invalid json }");

			// Should return null (not initial state, as per implementation log)
			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded).toBeNull();
		});

		test("saveState creates directory if missing", async () => {
			const newDir = join(TEST_RUN_DIR, "nested", "path");
			const state = createInitialState();

			await saveState(newDir, state);

			expect(existsSync(join(newDir, "state.json"))).toBe(true);

			// Cleanup nested dir
			if (existsSync(join(TEST_RUN_DIR, "nested"))) {
				rmSync(join(TEST_RUN_DIR, "nested"), { recursive: true, force: true });
			}
		});
	});
});