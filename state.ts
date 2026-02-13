// Note: We use sync node:fs here because state load/save is used in CLI flow and tests.
// A future cleanup could migrate to Bun.file/Bun.write for consistency with project guidelines.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ModelName } from "./config";
import type { PairwiseObservation, StoredRatingState } from "./rating/types";

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
	reviserEffort?: string;
	reviserTemperature?: number;
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
	tieGroup?: "none" | "top2" | "bottom2" | "all3" | "head_to_head";
	sharedPoints?: Record<string, number>;
}

/**
 * Swiss contestant state.
 */
export interface StoredSwissContestant {
	id: string;
	points: number;
	opponents: string[]; // Stored as array, converted to Set at runtime
	placements: { first: number; second: number; third: number; ties?: number };
	wins?: number;
	losses?: number;
	draws?: number;
	rating?: number;
	ratingUncertainty?: number;
	ratingCiLow?: number;
	ratingCiHigh?: number;
}

/**
 * Initial leaderboard result for a single model.
 */
export interface StoredInitialLeaderboardResult {
	model: string;
	selectedDraftIndex: number;
	wins: number;
	draws: number;
	losses: number;
	totalDrafts: number;
}

/**
 * Finale match result stored in state (active learning).
 */
export interface StoredFinaleMatch {
	iteration: number;
	aId: string;
	bId: string;
	scoreA: number;
	scoreB: number;
	votesA: number;
	votesB: number;
	judges: string[];
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
	completedGenerators: string[]; // Models that have finished generating

	// Phase 2: Initial Leaderboard / Draft Selection
	selectedDrafts: Map<ModelName, StoredGenerateResult> | null;
	completedLeaderboardModels: string[]; // Models that have finished their leaderboard matches
	initialLeaderboardResults: StoredInitialLeaderboardResult[] | null; // For enhanced output

	// Phase 3: Reviews
	reviews: StoredReviewResult[] | null;

	// Phase 4: Revisions
	revisions: Map<string, StoredRevisionResult> | null;

	// Phase 5: Swiss Tournament
	swissRound: number;
	swissMatches: StoredSwissMatch[];
	contestants: StoredSwissContestant[] | null;
	ratingState?: StoredRatingState | null;
	pairwiseHistory?: PairwiseObservation[];
	topKHistory?: string[][];
	swissStopReason?: string | null;

	// Phase 6: Finale (active learning)
	finaleMatches?: StoredFinaleMatch[] | null;
	finaleIterations?: number;
	finaleConverged?: boolean;
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
 * Reconstructs a PipelineState from a plain object produced by JSON.parse.
 *
 * @param obj - The parsed state object to deserialize.
 * @returns The PipelineState with Map fields restored (e.g., `generatedDrafts`, `selectedDrafts`, `revisions`), finale fields normalized, and sensible defaults for any missing optional properties.
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
		completedGenerators: (obj.completedGenerators as string[]) ?? [],
		selectedDrafts: obj.selectedDrafts
			? new Map(
					Object.entries(
						obj.selectedDrafts as Record<string, StoredGenerateResult>,
					),
				)
			: null,
		completedLeaderboardModels:
			(obj.completedLeaderboardModels as string[]) ?? [],
		initialLeaderboardResults:
			(obj.initialLeaderboardResults as StoredInitialLeaderboardResult[]) ??
			null,
		revisions: obj.revisions
			? new Map(
					Object.entries(obj.revisions as Record<string, StoredRevisionResult>),
				)
			: null,
		ratingState: (obj.ratingState as StoredRatingState | null) ?? null,
		pairwiseHistory: (obj.pairwiseHistory as PairwiseObservation[]) ?? [],
		topKHistory: (obj.topKHistory as string[][]) ?? [],
		swissStopReason: (obj.swissStopReason as string | null) ?? null,
		finaleMatches: (obj.finaleMatches as StoredFinaleMatch[] | null) ?? null,
		finaleIterations: (obj.finaleIterations as number | undefined) ?? 0,
		finaleConverged: (obj.finaleConverged as boolean | undefined) ?? false,
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
	reviserEffort: z.string().optional(),
	reviserTemperature: z.number().optional(),
});

const StoredSwissMatchSchema = z.object({
	round: z.number(),
	ids: z.tuple([z.string(), z.string(), z.string()]),
	first: z.string(),
	second: z.string(),
	third: z.string(),
	reasoning: z.string(),
	tieGroup: z
		.enum(["none", "top2", "bottom2", "all3", "head_to_head"])
		.optional(),
	sharedPoints: z.record(z.string(), z.number()).optional(),
});

const StoredSwissContestantSchema = z.object({
	id: z.string(),
	points: z.number(),
	opponents: z.array(z.string()),
	placements: z.object({
		first: z.number(),
		second: z.number(),
		third: z.number(),
		ties: z.number().optional(),
	}),
	wins: z.number().optional(),
	losses: z.number().optional(),
	draws: z.number().optional(),
	rating: z.number().optional(),
	ratingUncertainty: z.number().optional(),
	ratingCiLow: z.number().optional(),
	ratingCiHigh: z.number().optional(),
});

const PairwiseObservationSchema = z.object({
	aId: z.string(),
	bId: z.string(),
	scoreA: z.number(),
	scoreB: z.number(),
	round: z.number(),
	sourceMatchId: z.string().optional(),
});

const StoredFinaleMatchSchema = z.object({
	iteration: z.number(),
	aId: z.string(),
	bId: z.string(),
	scoreA: z.number(),
	scoreB: z.number(),
	votesA: z.number(),
	votesB: z.number(),
	judges: z.array(z.string()),
});

const RatingConfigSchema = z.object({
	backend: z.enum(["elo", "bradley-terry"]),
	initialRating: z.number(),
	kFactor: z.number(),
	tieValue: z.number(),
	provisionalMatches: z.number(),
	btIterations: z.number(),
	btTolerance: z.number(),
	ciBootstrapSamples: z.number().int().min(0).default(200),
	btRegularization: z.number().min(0).default(0),
	btUseNewton: z.boolean().default(false),
	ciMode: z.enum(["bootstrap", "hessian", "normal"]).default("bootstrap"),
});

const RatingRecordSchema = z.object({
	id: z.string(),
	rating: z.number(),
	matches: z.number(),
	wins: z.number(),
	losses: z.number(),
	draws: z.number(),
	uncertainty: z.number(),
});

const StoredRatingStateSchema = z.object({
	config: RatingConfigSchema,
	records: z.array(RatingRecordSchema),
	history: z.array(PairwiseObservationSchema),
});

const StoredInitialLeaderboardResultSchema = z.object({
	model: z.string(),
	selectedDraftIndex: z.number(),
	wins: z.number(),
	draws: z.number(),
	losses: z.number(),
	totalDrafts: z.number(),
});

const PipelineStateSchema = z.object({
	version: z.literal(1),
	timestamp: z.string(),
	phase: z.number(),
	phasesCompleted: z.array(z.string()),
	generatedDrafts: z
		.record(z.string(), z.array(StoredGenerateResultSchema))
		.nullable(),
	completedGenerators: z.array(z.string()).optional(),
	selectedDrafts: z.record(z.string(), StoredGenerateResultSchema).nullable(),
	completedLeaderboardModels: z.array(z.string()).optional(),
	initialLeaderboardResults: z
		.array(StoredInitialLeaderboardResultSchema)
		.nullable()
		.optional(),
	reviews: z.array(StoredReviewResultSchema).nullable(),
	revisions: z.record(z.string(), StoredRevisionResultSchema).nullable(),
	swissRound: z.number(),
	swissMatches: z.array(StoredSwissMatchSchema),
	contestants: z.array(StoredSwissContestantSchema).nullable(),
	ratingState: StoredRatingStateSchema.nullable().optional(),
	pairwiseHistory: z.array(PairwiseObservationSchema).optional(),
	topKHistory: z.array(z.array(z.string())).optional(),
	swissStopReason: z.string().nullable().optional(),
	finaleMatches: z.array(StoredFinaleMatchSchema).nullable().optional(),
	finaleIterations: z.number().int().min(0).optional(),
	finaleConverged: z.boolean().optional(),
});

// ============================================================================
// State Management Functions
// ============================================================================

const STATE_FILENAME = "state.json";

/**
 * Create a new PipelineState populated with default empty values for all phases.
 *
 * @returns A PipelineState initialized to version 1 with the current timestamp, phase 0, empty arrays or `null` for phase-specific containers (e.g., `generatedDrafts`, `selectedDrafts`, `reviews`, `revisions`, `contestants`), empty tracking arrays (e.g., `phasesCompleted`, `pairwiseHistory`, `topKHistory`), and finale defaults (`finaleMatches` set to `null`, `finaleIterations` set to `0`, `finaleConverged` set to `false`).
 */
export function createInitialState(): PipelineState {
	return {
		version: 1,
		timestamp: new Date().toISOString(),
		phase: 0,
		phasesCompleted: [],
		generatedDrafts: null,
		completedGenerators: [],
		selectedDrafts: null,
		completedLeaderboardModels: [],
		initialLeaderboardResults: null,
		reviews: null,
		revisions: null,
		swissRound: 0,
		swissMatches: [],
		contestants: null,
		ratingState: null,
		pairwiseHistory: [],
		topKHistory: [],
		swissStopReason: null,
		finaleMatches: null,
		finaleIterations: 0,
		finaleConverged: false,
	};
}

/**
 * Saves pipeline state to the run directory.
 */
export function saveState(runDir: string, state: PipelineState): void {
	// Ensure directory exists
	if (!existsSync(runDir)) {
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
