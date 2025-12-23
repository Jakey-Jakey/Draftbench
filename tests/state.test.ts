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

			expect(state.completedPhases).toEqual([]);
			expect(state.drafts).toEqual([]);
			expect(state.selectedDrafts).toEqual([]);
			expect(state.reviews).toEqual([]);
			expect(state.revisions).toEqual([]);
			expect(state.swissContestants).toBeUndefined();
			expect(state.swissMatches).toBeUndefined();
			expect(state.playoffResults).toBeUndefined();
		});

		test("creates valid state object", () => {
			const state = createInitialState();

			expect(state).toHaveProperty("completedPhases");
			expect(state).toHaveProperty("drafts");
			expect(state).toHaveProperty("selectedDrafts");
			expect(state).toHaveProperty("reviews");
			expect(state).toHaveProperty("revisions");
			expect(Array.isArray(state.completedPhases)).toBe(true);
		});
	});

	describe("saveState and loadState", () => {
		test("saves and loads state correctly", async () => {
			const state = createInitialState();
			state.completedPhases.push("generate");
			state.drafts.push({
				text: "Test draft",
				model: "test/model",
			});

			await saveState(TEST_RUN_DIR, state);

			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded.completedPhases).toContain("generate");
			expect(loaded.drafts.length).toBe(1);
			expect(loaded.drafts[0]?.text).toBe("Test draft");
		});

		test("preserves all state fields", async () => {
			const state = createInitialState();
			state.completedPhases = ["generate", "review"];
			state.drafts = [
				{ text: "Draft 1", model: "model1" },
				{ text: "Draft 2", model: "model2" },
			];
			state.selectedDrafts = [{ text: "Selected", model: "model1" }];
			state.reviews = [
				{
					text: "Review 1",
					reviewer: "reviewer1",
					reviewed: "model1",
				},
			];

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded.completedPhases).toEqual(state.completedPhases);
			expect(loaded.drafts).toEqual(state.drafts);
			expect(loaded.selectedDrafts).toEqual(state.selectedDrafts);
			expect(loaded.reviews).toEqual(state.reviews);
		});

		test("loads state from existing file", async () => {
			// Manually create a state file
			const manualState = {
				completedPhases: ["generate"],
				drafts: [{ text: "Manual draft", model: "manual/model" }],
				selectedDrafts: [],
				reviews: [],
				revisions: [],
			};

			const statePath = join(TEST_RUN_DIR, "state.json");
			writeFileSync(statePath, JSON.stringify(manualState, null, 2));

			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded.completedPhases).toContain("generate");
			expect(loaded.drafts[0]?.text).toBe("Manual draft");
		});

		test("returns initial state when file doesn't exist", async () => {
			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded.completedPhases).toEqual([]);
			expect(loaded.drafts).toEqual([]);
		});

		test("handles swiss contestants state", async () => {
			const state = createInitialState();
			state.swissContestants = [
				{
					id: "contestant1",
					text: "Text 1",
					points: 2,
					opponents: ["contestant2"],
					placements: { first: 1, second: 0, third: 0 },
				},
			];

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded.swissContestants).toBeDefined();
			expect(loaded.swissContestants![0]!.id).toBe("contestant1");
			expect(loaded.swissContestants![0]!.points).toBe(2);
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

			expect(loaded.swissMatches).toBeDefined();
			expect(loaded.swissMatches![0]!.round).toBe(1);
			expect(loaded.swissMatches![0]!.first).toBe("id1");
		});

		test("handles playoff results state", async () => {
			const state = createInitialState();
			state.playoffResults = {
				contestant1: {
					points: 3.5,
					wins: 3,
					draws: 1,
					losses: 1,
				},
			};

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded.playoffResults).toBeDefined();
			expect(loaded.playoffResults!.contestant1).toBeDefined();
			expect(loaded.playoffResults!.contestant1!.points).toBe(3.5);
		});
	});

	describe("isPhaseCompleted", () => {
		test("returns true for completed phase", () => {
			const state = createInitialState();
			state.completedPhases.push("generate");

			expect(isPhaseCompleted(state, "generate")).toBe(true);
		});

		test("returns false for incomplete phase", () => {
			const state = createInitialState();

			expect(isPhaseCompleted(state, "generate")).toBe(false);
		});

		test("checks all phase types", () => {
			const state = createInitialState();
			state.completedPhases = [
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
			state.completedPhases.push("generate");

			// @ts-expect-error Testing invalid phase name
			expect(isPhaseCompleted(state, "generat")).toBe(false);
		});
	});

	describe("markPhaseCompleted", () => {
		test("marks phase as completed", () => {
			const state = createInitialState();

			markPhaseCompleted(state, "generate");

			expect(state.completedPhases).toContain("generate");
		});

		test("does not duplicate phase", () => {
			const state = createInitialState();

			markPhaseCompleted(state, "generate");
			markPhaseCompleted(state, "generate");

			expect(state.completedPhases.filter((p) => p === "generate").length).toBe(
				1,
			);
		});

		test("can mark multiple phases", () => {
			const state = createInitialState();

			markPhaseCompleted(state, "generate");
			markPhaseCompleted(state, "review");
			markPhaseCompleted(state, "revise");

			expect(state.completedPhases).toContain("generate");
			expect(state.completedPhases).toContain("review");
			expect(state.completedPhases).toContain("revise");
			expect(state.completedPhases.length).toBe(3);
		});

		test("marks phases in order", () => {
			const state = createInitialState();

			markPhaseCompleted(state, "generate");
			markPhaseCompleted(state, "review");

			expect(state.completedPhases[0]).toBe("generate");
			expect(state.completedPhases[1]).toBe("review");
		});
	});

	describe("state persistence", () => {
		test("state survives save/load cycle", async () => {
			const state = createInitialState();
			state.completedPhases = [
				"generate",
				"review",
				"revise",
			];
			state.drafts = [
				{ text: "Draft A", model: "modelA" },
				{ text: "Draft B", model: "modelB" },
			];
			state.reviews = [
				{
					text: "Review 1",
					reviewer: "reviewer1",
					reviewed: "modelA",
				},
			];
			state.revisions = [
				{
					id: "rev1",
					text: "Revision 1",
					generator: "gen1",
					reviewer: "rev1",
					reviser: "reviser1",
				},
			];

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded).toEqual(state);
		});

		test("handles empty arrays", async () => {
			const state = createInitialState();
			// All arrays empty

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded.drafts).toEqual([]);
			expect(loaded.reviews).toEqual([]);
			expect(loaded.revisions).toEqual([]);
		});

		test("handles missing optional fields", async () => {
			const state = createInitialState();
			// Don't set optional fields

			await saveState(TEST_RUN_DIR, state);
			const loaded = await loadState(TEST_RUN_DIR);

			expect(loaded.swissContestants).toBeUndefined();
			expect(loaded.swissMatches).toBeUndefined();
			expect(loaded.playoffResults).toBeUndefined();
		});
	});

	describe("error handling", () => {
		test("loadState handles corrupted JSON gracefully", async () => {
			const statePath = join(TEST_RUN_DIR, "state.json");
			writeFileSync(statePath, "{ invalid json }");

			// Should return initial state instead of throwing
			const loaded = await loadState(TEST_RUN_DIR);
			expect(loaded.completedPhases).toEqual([]);
		});

		test("saveState creates directory if missing", async () => {
			const newDir = join(TEST_RUN_DIR, "nested", "path");
			const state = createInitialState();

			await saveState(newDir, state);

			expect(existsSync(join(newDir, "state.json"))).toBe(true);
		});
	});
});