import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfig, getRoleEntries } from "./config";

// ============================================================================
// Directory & File Utilities
// ============================================================================

/**
 * Ensures the runs directory exists.
 * @param subdir Optional subdirectory within runs
 * @param dryRun If true, skip actual directory creation
 */
export async function ensureRunsDirectory(
	subdir?: string,
	dryRun = false,
): Promise<string> {
	const config = getConfig();
	const runsDir = config.output.runsDirectory;
	const dir = subdir ? join(runsDir, subdir) : runsDir;
	if (!dryRun) {
		await mkdir(dir, { recursive: true });
	}
	return dir;
}

/**
 * Generates a timestamp string for filenames.
 * Format: YYYY-MM-DDTHH-MM-SS
 */
export function getTimestamp(): string {
	const now = new Date();
	return now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
}

// ============================================================================
// Model Name Utilities
// ============================================================================

/**
 * Extracts a short, human-readable name from an OpenRouter model slug.
 * e.g., "anthropic/claude-sonnet-4" -> "claude-sonnet-4"
 */
export function getShortModelName(slug: string): string {
	const parts = slug.split("/");
	return parts[parts.length - 1] ?? slug;
}

/**
 * Converts a string into a lowercase, file-safe token.
 */
export function toSafeToken(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "id";
}

/**
 * Fast deterministic hash for stable IDs.
 */
function hashString(value: string): string {
	let hash = 5381;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 33) ^ value.charCodeAt(i);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Stable model token based on full slug, safe for filenames/IDs.
 */
export function getModelToken(modelSlug: string): string {
	const base = toSafeToken(getShortModelName(modelSlug));
	return `${base}-${hashString(modelSlug)}`;
}

/**
 * Narrows away null/undefined with a runtime guard.
 */
export function requireDefined<T>(
	value: T | null | undefined,
	message: string,
): T {
	if (value === undefined || value === null) {
		throw new Error(message);
	}
	return value;
}

/**
 * Converts a confidence level to an approximate z multiplier for two-sided CIs.
 * Used across stop rules and finale separation checks.
 */
export function confidenceMultiplier(confidence: number): number {
	if (confidence >= 0.99) return 2.58;
	if (confidence >= 0.95) return 1.96;
	if (confidence >= 0.9) return 1.64;
	if (confidence >= 0.8) return 1.28;
	return 1.0;
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Fisher-Yates shuffle for randomizing array order.
 * Returns a new shuffled array (does not mutate original).
 */
export function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const left = shuffled[i];
		const right = shuffled[j];
		if (left === undefined || right === undefined) continue;
		shuffled[i] = right;
		shuffled[j] = left;
	}
	return shuffled;
}

// ============================================================================
// Dry Run Helpers
// ============================================================================

/**
 * Creates mock data for dry run mode.
 */
export function createMockStatblock(
	modelOrLabel: string,
	phase?: string,
): string {
	const phaseInfo = phase ? ` [${phase}]` : "";
	return `# MOCK Statblock (${modelOrLabel})${phaseInfo}
---
**Armor Class** 20
**Hit Points** 300
**Speed** 30 ft.

This is a MOCK statblock for dry-run testing purposes.`;
}

/**
 * Creates a mock review for dry run mode.
 */
export function createMockReview(reviewer?: string, reviewed?: string): string {
	const header =
		reviewer && reviewed
			? `Review by ${reviewer} on ${reviewed}`
			: "Mock review";
	return `${header}: The statblock is well-balanced but could use more legendary actions. (MOCK)`;
}

/**
 * Logs configuration details for dry run.
 */
export function printDryRunConfig(): void {
	const config = getConfig();
	const SWISS_ROUNDS = config.tournament.swissRounds;
	const INITIAL_GENERATIONS = config.tournament.initialGenerations;
	const INITIAL_LEADERBOARD = config.tournament.initialLeaderboard;
	const RUNS_DIR = config.output.runsDirectory;

	// Calculate total contestants dynamically
	const generatorCount = getRoleEntries("generators").length;
	const reviewerCount = getRoleEntries("reviewers").length;
	const reviserCount = getRoleEntries("revisers").length;
	// One draft per generator proceeds into review/revise regardless of initial seed style.
	const totalContestants = generatorCount * reviewerCount * reviserCount;

	console.log("\n📋 DRY RUN - Configuration Details:\n");
	console.log("Roles:");
	console.log(`  Generators (${generatorCount}):`);
	for (const entry of getRoleEntries("generators")) {
		console.log(
			`    - ${getShortModelName(entry.model)} (effort: ${entry.effort ?? "high"})`,
		);
	}
	console.log(`  Reviewers (${reviewerCount}):`);
	for (const entry of getRoleEntries("reviewers")) {
		console.log(
			`    - ${getShortModelName(entry.model)} (effort: ${entry.effort ?? "high"})`,
		);
	}
	console.log(`  Revisers (${reviserCount}):`);
	for (const entry of getRoleEntries("revisers")) {
		console.log(
			`    - ${getShortModelName(entry.model)} (effort: ${entry.effort ?? "high"})`,
		);
	}
	console.log(`  Swiss Judges (${config.roles.swissJudges.length}):`);
	for (const entry of config.roles.swissJudges) {
		console.log(
			`    - ${getShortModelName(entry.model)} (effort: ${entry.effort ?? "high"})`,
		);
	}
	console.log(`  Finale Judges (${config.roles.finaleJudges.length}):`);
	for (const entry of config.roles.finaleJudges) {
		console.log(
			`    - ${getShortModelName(entry.model)} (effort: ${entry.effort ?? "high"})`,
		);
	}
	console.log(`\nTournament:`);
	console.log(`  Swiss Rounds: ${SWISS_ROUNDS}`);
	console.log(`  Initial Generations per Model: ${INITIAL_GENERATIONS}`);
	console.log(`  Initial Leaderboard Enabled: ${INITIAL_LEADERBOARD.enabled}`);
	console.log(
		`  Rating Backend: ${config.tournament.rating.enabled ? config.tournament.rating.backend : "disabled"}`,
	);
	console.log(`  Scheduling Mode: ${config.tournament.scheduling.mode}`);
	console.log(
		`  Stop Rules: ${config.tournament.stopRules.enabled ? `enabled (min ${config.tournament.stopRules.minBatches}, max ${config.tournament.stopRules.maxBatches}, topK ${config.tournament.stopRules.topK})` : "disabled"}`,
	);
	console.log(
		`  Finale: ${config.tournament.finale.enabled ? `enabled (max ${config.tournament.finale.maxTotalMatches} total, batch ${config.tournament.finale.maxMatchesPerBatch}, confidence ${config.tournament.finale.confidence})` : "disabled"}`,
	);
	console.log(`  Total Contestants: ${totalContestants}`);
	console.log(`\nOutput:`);
	console.log(`  Runs Directory: ${RUNS_DIR}`);
	console.log(`\nPrompts (first 100 chars):`);
	console.log(`  Generate: ${config.prompts.generate.user.slice(0, 100)}...`);
	console.log(`\n📋 END DRY RUN CONFIG\n`);
}
