import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfig, getModelsForRole } from "./config";

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
		if (shuffled[i] !== undefined && shuffled[j] !== undefined) {
			const temp = shuffled[i]!;
			shuffled[i] = shuffled[j]!;
			shuffled[j] = temp;
		}
	}
	return shuffled;
}

// ============================================================================
// Dry Run Helpers
// ============================================================================

/**
 * Creates mock data for dry run mode.
 */
export function createMockStatblock(modelOrLabel: string): string {
	return `# Mock Statblock (${modelOrLabel})
---
**Armor Class** 20
**Hit Points** 300
**Speed** 30 ft.

This is a mock statblock for dry-run testing purposes.`;
}

/**
 * Creates a mock review for dry run mode.
 */
export function createMockReview(): string {
	return "Mock review: The statblock is well-balanced but could use more legendary actions.";
}

/**
 * Logs configuration details for dry run.
 */
export function printDryRunConfig(): void {
	const config = getConfig();
	const SWISS_ROUNDS = config.tournament.swissRounds;
	const TOP_N_PLAYOFF = config.tournament.playoffSize;
	const INITIAL_GENERATIONS = config.tournament.initialGenerations;
	const INITIAL_LEADERBOARD = config.tournament.initialLeaderboard;
	const RUNS_DIR = config.output.runsDirectory;

	// Calculate total contestants dynamically
	const generatorCount = getModelsForRole("generators").length;
	const reviewerCount = getModelsForRole("reviewers").length;
	const reviserCount = getModelsForRole("revisers").length;
	// Calculate based on standard flow: generators * initialGenerations (or 1) * reviewers * revisers
	const draftsPerGenerator = INITIAL_LEADERBOARD.enabled
		? 1
		: INITIAL_GENERATIONS;
	const totalContestants =
		generatorCount * draftsPerGenerator * reviewerCount * reviserCount;

	console.log("\n📋 DRY RUN - Configuration Details:\n");
	console.log("Models:");
	for (const [name, model] of Object.entries(config.models)) {
		console.log(
			`  ${name}: ${model.slug} (reasoning: ${model.reasoningEffort})`,
		);
	}
	console.log(`\nTournament:`);
	console.log(`  Swiss Rounds: ${SWISS_ROUNDS}`);
	console.log(`  Playoff Size: ${TOP_N_PLAYOFF}`);
	console.log(`  Initial Generations per Model: ${INITIAL_GENERATIONS}`);
	console.log(`  Initial Leaderboard Enabled: ${INITIAL_LEADERBOARD.enabled}`);
	console.log(`  Total Contestants: ${totalContestants}`);
	console.log(`\nOutput:`);
	console.log(`  Runs Directory: ${RUNS_DIR}`);
	console.log(`\nPrompts (first 100 chars):`);
	console.log(`  Generate: ${config.prompts.generate.user.slice(0, 100)}...`);
	console.log(`\n📋 END DRY RUN CONFIG\n`);
}
