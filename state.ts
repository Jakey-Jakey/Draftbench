import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ModelName } from "./config";

// ============================================================================
// State Types
// ============================================================================

/**
 * Generated draft result stored in state.
 */
export interface StoredGenerateResult {
	text: string;
	model: ModelName;
}

/**
 * Review result stored in state.
 */
export interface StoredReviewResult {
	text: string;
	reviewer: ModelName;
	reviewed: ModelName;
}

/**
 * Revision result stored in state.
 */
export interface StoredRevisionResult {
	id: string;
	text: string;
	generator: ModelName;
	reviewer: ModelName;
	reviser: ModelName;
}

/**
 * Swiss match result stored in state.
 */
export interface StoredSwissMatch {
	round: number;
	ids: [string, string, string];
	first: string;
	second: string;
	third: string;
	reasoning: string;
}

/**
 * Swiss contestant state.
 */
export interface StoredSwissContestant {
	id: string;
	points: number;
	opponents: string[]; // Stored as array, converted to Set at runtime
	placements: { first: number; second: number; third: number };
}

/**
 * Playoff result for a single contestant.
 */
export interface StoredPlayoffResult {
	id: string;
	points: number;
	wins: number;
	losses: number;
	draws: number;
}

/**
 * Complete pipeline state for resume functionality.
 */
export interface PipelineState {
	version: 1;
	timestamp: string;

	// Phase tracking
	phase: number;
	phasesCompleted: string[];

	// Phase 1: Generation
	generatedDrafts: Map<ModelName, StoredGenerateResult[]> | null;

	// Phase 2: Initial Leaderboard / Draft Selection
	selectedDrafts: Map<ModelName, StoredGenerateResult> | null;

	// Phase 3: Reviews
	reviews: StoredReviewResult[] | null;

	// Phase 4: Revisions
	revisions: Map<string, StoredRevisionResult> | null;

	// Phase 5: Swiss Tournament
	swissRound: number;
	swissMatches: StoredSwissMatch[];
	contestants: StoredSwissContestant[] | null;

	// Phase 6: Playoffs
	playoffResults: StoredPlayoffResult[] | null;
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Converts Maps to plain objects for JSON serialization.
 */
function serializeState(state: PipelineState): object {
	return {
		...state,
		generatedDrafts: state.generatedDrafts
			? Object.fromEntries(state.generatedDrafts)
			: null,
		selectedDrafts: state.selectedDrafts
			? Object.fromEntries(state.selectedDrafts)
			: null,
		revisions: state.revisions ? Object.fromEntries(state.revisions) : null,
	};
}

/**
 * Converts plain objects back to Maps after JSON deserialization.
 */
function deserializeState(obj: Record<string, unknown>): PipelineState {
	return {
		...obj,
		generatedDrafts: obj.generatedDrafts
			? new Map(
				Object.entries(
					obj.generatedDrafts as Record<string, StoredGenerateResult[]>,
				),
			)
			: null,
		selectedDrafts: obj.selectedDrafts
			? new Map(
				Object.entries(
					obj.selectedDrafts as Record<string, StoredGenerateResult>,
				),
			)
			: null,
		revisions: obj.revisions
			? new Map(
				Object.entries(obj.revisions as Record<string, StoredRevisionResult>),
			)
			: null,
	} as PipelineState;
}

// ============================================================================
// State Schema for Validation
// ============================================================================

const StoredGenerateResultSchema = z.object({
	text: z.string(),
	model: z.string(),
});

const StoredReviewResultSchema = z.object({
	text: z.string(),
	reviewer: z.string(),
	reviewed: z.string(),
});

const StoredRevisionResultSchema = z.object({
	id: z.string(),
	text: z.string(),
	generator: z.string(),
	reviewer: z.string(),
	reviser: z.string(),
});

const StoredSwissMatchSchema = z.object({
	round: z.number(),
	ids: z.tuple([z.string(), z.string(), z.string()]),
	first: z.string(),
	second: z.string(),
	third: z.string(),
	reasoning: z.string(),
});

const StoredSwissContestantSchema = z.object({
	id: z.string(),
	points: z.number(),
	opponents: z.array(z.string()),
	placements: z.object({
		first: z.number(),
		second: z.number(),
		third: z.number(),
	}),
});

const StoredPlayoffResultSchema = z.object({
	id: z.string(),
	points: z.number(),
	wins: z.number(),
	losses: z.number(),
	draws: z.number(),
});

const PipelineStateSchema = z.object({
	version: z.literal(1),
	timestamp: z.string(),
	phase: z.number(),
	phasesCompleted: z.array(z.string()),
	generatedDrafts: z
		.record(z.string(), z.array(StoredGenerateResultSchema))
		.nullable(),
	selectedDrafts: z.record(z.string(), StoredGenerateResultSchema).nullable(),
	reviews: z.array(StoredReviewResultSchema).nullable(),
	revisions: z.record(z.string(), StoredRevisionResultSchema).nullable(),
	swissRound: z.number(),
	swissMatches: z.array(StoredSwissMatchSchema),
	contestants: z.array(StoredSwissContestantSchema).nullable(),
	playoffResults: z.array(StoredPlayoffResultSchema).nullable(),
});

// ============================================================================
// State Management Functions
// ============================================================================

const STATE_FILENAME = "state.json";

/**
 * Creates a fresh initial pipeline state.
 */
export function createInitialState(): PipelineState {
	return {
		version: 1,
		timestamp: new Date().toISOString(),
		phase: 0,
		phasesCompleted: [],
		generatedDrafts: null,
		selectedDrafts: null,
		reviews: null,
		revisions: null,
		swissRound: 0,
		swissMatches: [],
		contestants: null,
		playoffResults: null,
	};
}

/**
 * Saves pipeline state to the run directory.
 */
export function saveState(runDir: string, state: PipelineState): void {
	// Ensure directory exists
	if (!existsSync(runDir)) {
		const { mkdirSync } = require("node:fs");
		mkdirSync(runDir, { recursive: true });
	}
	const statePath = join(runDir, STATE_FILENAME);
	const serialized = serializeState({
		...state,
		timestamp: new Date().toISOString(),
	});
	writeFileSync(statePath, JSON.stringify(serialized, null, 2), "utf-8");
}

/**
 * Loads pipeline state from a run directory.
 * Returns null if state file doesn't exist or is invalid.
 */
export function loadState(runDir: string): PipelineState | null {
	const statePath = join(runDir, STATE_FILENAME);

	if (!existsSync(statePath)) {
		console.log(`  ⚠️ No state.json found in ${runDir}`);
		return null;
	}

	try {
		const content = readFileSync(statePath, "utf-8");
		const parsed = JSON.parse(content);

		const result = PipelineStateSchema.safeParse(parsed);
		if (!result.success) {
			console.error(`  ⚠️ Invalid state.json format:`, result.error.issues);
			return null;
		}

		const state = deserializeState(
			result.data as unknown as Record<string, unknown>,
		);
		console.log(`  ✓ Loaded state from ${statePath}`);
		console.log(
			`    Phase: ${state.phase}, Completed: [${state.phasesCompleted.join(", ")}]`,
		);
		console.log(
			`    Swiss Round: ${state.swissRound}/${state.swissMatches.length} matches`,
		);

		return state;
	} catch (e) {
		console.error(`  ⚠️ Failed to load state:`, e);
		return null;
	}
}

/**
 * Checks if a specific phase has been completed.
 */
export function isPhaseCompleted(
	state: PipelineState,
	phaseName: string,
): boolean {
	return state.phasesCompleted.includes(phaseName);
}

/**
 * Marks a phase as completed in the state.
 */
export function markPhaseCompleted(
	state: PipelineState,
	phaseName: string,
): void {
	if (!state.phasesCompleted.includes(phaseName)) {
		state.phasesCompleted.push(phaseName);
	}
	state.phase = state.phasesCompleted.length;
}
