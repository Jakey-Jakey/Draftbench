/**
 * Draftbench: AI Model Benchmarking Pipeline
 *
 * Entry point and orchestration for the Generate → Review → Revise → Tournament pipeline.
 * Each phase is implemented in its own module under `phases/`.
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	getPlayoffJudges,
	getRoleEntries,
	getSwissJudges,
	loadConfig,
	parseArgs,
} from "./config";
import { computeLeaderboard } from "./leaderboard";
// Phase imports
import { runGeneratePhase } from "./phases/generate";
import { runInitialLeaderboardPhase } from "./phases/initialLeaderboard";
import { runPlayoffPhase } from "./phases/playoff";
import { runReviewPhase } from "./phases/review";
import { runRevisePhase } from "./phases/revise";
import { runSwissPhase } from "./phases/swiss";
import { initConcurrencyLimiter } from "./semaphore";
import { createInitialState, loadState, type PipelineState } from "./state";
import {
	ensureRunsDirectory,
	getShortModelName,
	getTimestamp,
	printDryRunConfig,
} from "./utils";

// ============================================================================
// Configuration
// ============================================================================

const cliArgs = parseArgs();
const config = loadConfig(cliArgs.configPath, cliArgs.promptsPath);

// Initialize concurrency limiter if configured
initConcurrencyLimiter(config.concurrency?.maxParallel);

const RUNS_DIR = config.output.runsDirectory;
const SWISS_ROUNDS = config.tournament.swissRounds;
const TOP_N_PLAYOFF = config.tournament.playoffSize;
const INITIAL_LEADERBOARD = config.tournament.initialLeaderboard;
const SWISS_JUDGES = getSwissJudges();
const PLAYOFF_JUDGES = getPlayoffJudges();
const DRY_RUN = cliArgs.dryRun;
const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
const RATING = config.tournament.rating;
const SCHEDULING = config.tournament.scheduling;
const STOP_RULES = config.tournament.stopRules;

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Orchestrates the end-to-end cross-review pipeline: generation, optional initial leaderboard, cross-review, revision, Swiss tournament, playoff, and final leaderboard output.
 *
 * This function manages run directories and state (including resume support), invokes each phase in sequence, writes logs and artifacts (unless running in dry-run mode), computes the final leaderboard, and prints a summary of results.
 */
async function runCrossReviewPipeline(): Promise<void> {
	console.log(
		"🎲 Auto-Draftify: D&D 5e Cross-Review Pipeline (Optimized Swiss)\n",
	);

	if (DRY_RUN) {
		console.log("🧪 DRY RUN MODE - No API calls will be made\n");
		printDryRunConfig();
	}

	console.log("📝 Creating: Monster Statblock\n");

	// Display roles
	console.log("Generators:");
	for (const entry of getRoleEntries("generators")) {
		console.log(
			`  - ${getShortModelName(entry.model)} (effort: ${entry.effort ?? "high"})`,
		);
	}
	console.log(`\nSwiss Rounds: ${SWISS_ROUNDS} (${SWISS_FORMAT} format)`);
	console.log(
		`Swiss Engine: ${RATING.enabled ? `${RATING.backend} ratings + ${SCHEDULING.mode} scheduling` : "legacy points-only"} | Stop Rules: ${
			STOP_RULES.enabled
				? `on (min ${STOP_RULES.minBatches}, max ${STOP_RULES.maxBatches}, topK ${STOP_RULES.topK})`
				: "off"
		}`,
	);
	console.log(
		`Playoff: Top-${TOP_N_PLAYOFF} Round Robin (judges: ${PLAYOFF_JUDGES.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "high"})`).join(", ")})`,
	);
	console.log(
		`Swiss Judges: ${SWISS_JUDGES.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "low"})`).join(", ")} | Initial Leaderboard: ${
			INITIAL_LEADERBOARD.enabled ? "enabled" : "disabled"
		}\n`,
	);

	// === RESUME / STATE INITIALIZATION ===
	let runDir: string;
	let state: PipelineState;
	let isResuming = false;

	if (cliArgs.resumeDir) {
		const resumePath = cliArgs.resumeDir.startsWith(RUNS_DIR)
			? cliArgs.resumeDir
			: join(RUNS_DIR, cliArgs.resumeDir);

		if (!existsSync(resumePath)) {
			throw new Error(`Resume directory not found: ${resumePath}`);
		}

		const loadedState = loadState(resumePath);
		if (!loadedState) {
			throw new Error(`Could not load state from: ${resumePath}`);
		}

		runDir = resumePath;
		state = loadedState;
		isResuming = true;
		console.log(`\n🔄 RESUMING from: ${runDir}`);
		console.log(`   Phases completed: [${state.phasesCompleted.join(", ")}]\n`);
	} else {
		const timestamp = getTimestamp();
		runDir = await ensureRunsDirectory(timestamp, DRY_RUN);
		state = createInitialState();
	}

	// Helper for subdirectory paths
	const getRelativeRunPath = () => {
		if (runDir.includes(RUNS_DIR)) {
			return runDir.slice(runDir.indexOf(RUNS_DIR) + RUNS_DIR.length + 1);
		}
		return runDir;
	};
	const relRunPath = getRelativeRunPath();

	// Ensure subdirectories exist
	const revisionsDir = await ensureRunsDirectory(
		join(relRunPath, "revisions"),
		DRY_RUN,
	);
	const reviewsDir = await ensureRunsDirectory(
		join(relRunPath, "reviews"),
		DRY_RUN,
	);
	const initialLeaderboardDir = INITIAL_LEADERBOARD.enabled
		? await ensureRunsDirectory(
				join(relRunPath, "initial_leaderboard"),
				DRY_RUN,
			)
		: null;
	const swissJudgmentsDir = await ensureRunsDirectory(
		join(relRunPath, "swiss_judgments"),
		DRY_RUN,
	);
	const playoffJudgmentsDir = await ensureRunsDirectory(
		join(relRunPath, "playoff_judgments"),
		DRY_RUN,
	);

	// Log paths
	const swissLogPath = join(runDir, "swiss_rounds.md");
	const initialLeaderboardLogPath = initialLeaderboardDir
		? join(initialLeaderboardDir, "leaderboard.md")
		: null;
	const playoffLogPath = join(runDir, "playoff_rounds.md");

	// Initialize logs (only for new runs)
	if (!DRY_RUN && !isResuming) {
		await writeFile(
			swissLogPath,
			`# Swiss Tournament Log (${SWISS_FORMAT})\n\n`,
			"utf-8",
		);
		if (initialLeaderboardLogPath) {
			await writeFile(
				initialLeaderboardLogPath,
				"# Initial Draft Leaderboard\n\n",
				"utf-8",
			);
		}
		await writeFile(playoffLogPath, "# Top-8 Round Robin Playoff\n\n", "utf-8");
	}

	// === PHASE 1: Generate ===
	const { draftsByModel } = await runGeneratePhase(
		runDir,
		state,
		DRY_RUN,
		isResuming,
	);

	// === PHASE 2: Initial Leaderboard ===
	const { selectedByModel } = await runInitialLeaderboardPhase(
		runDir,
		state,
		draftsByModel,
		initialLeaderboardLogPath,
		DRY_RUN,
		isResuming,
	);

	// === PHASE 3: Review ===
	const { reviews } = await runReviewPhase(
		runDir,
		reviewsDir,
		state,
		selectedByModel,
		DRY_RUN,
		isResuming,
	);

	// === PHASE 4: Revise ===
	const { revisionsById } = await runRevisePhase(
		runDir,
		revisionsDir,
		state,
		selectedByModel,
		reviews,
		DRY_RUN,
		isResuming,
	);

	// === PHASE 5: Swiss Tournament ===
	const { contestants, matches: allSwissMatches } = await runSwissPhase(
		runDir,
		swissLogPath,
		swissJudgmentsDir,
		state,
		revisionsById,
		DRY_RUN,
		isResuming,
	);

	// === PHASE 6: Playoff ===
	const { results: playoffResults } = await runPlayoffPhase(
		runDir,
		playoffLogPath,
		playoffJudgmentsDir,
		state,
		contestants,
		revisionsById,
		DRY_RUN,
		isResuming,
	);

	// === FINAL: Leaderboard ===
	const leaderboard = computeLeaderboard(
		contestants,
		allSwissMatches,
		playoffResults,
		revisionsById,
		state.initialLeaderboardResults,
	);
	const leaderboardPath = join(runDir, "leaderboard.md");
	if (!DRY_RUN) {
		await writeFile(leaderboardPath, leaderboard, "utf-8");
		console.log(`  ✓ Wrote ${leaderboardPath}`);
	} else {
		console.log(`  ✓ Leaderboard computed (dry run - not written)`);
	}

	// Print summary stats
	const playoffPairCount = (TOP_N_PLAYOFF * (TOP_N_PLAYOFF - 1)) / 2;

	console.log(`\n${"=".repeat(60)}`);
	console.log("📊 TOURNAMENT SUMMARY");
	console.log("=".repeat(60));
	if (DRY_RUN) {
		console.log("🧪 DRY RUN - No API calls were made");
	}
	console.log(`Swiss Rounds: ${SWISS_ROUNDS} (${SWISS_FORMAT} format)`);
	console.log(`Swiss Matches: ${allSwissMatches.length}`);
	console.log(
		`Playoff Judgments: ${playoffPairCount * PLAYOFF_JUDGES.length} (${playoffPairCount} pairs × ${PLAYOFF_JUDGES.length} judges)`,
	);
	console.log("");
	console.log("🏆 TOP 3 (Final Rankings):");

	const finalSorted = [...contestants].sort((a, b) => {
		const playoffA = playoffResults.get(a.id);
		const playoffB = playoffResults.get(b.id);
		const scoreA = a.points + (playoffA?.points ?? 0) * 2;
		const scoreB = b.points + (playoffB?.points ?? 0) * 2;
		return scoreB - scoreA;
	});

	for (let i = 0; i < 3; i++) {
		const c = finalSorted[i];
		if (!c) break;
		const playoff = playoffResults.get(c.id);
		const playoffStr = playoff ? ` + ${playoff.points} playoff` : "";
		console.log(
			`  ${["🥇", "🥈", "🥉"][i]} ${c.id} (${c.points} Swiss${playoffStr})`,
		);
	}
	console.log("=".repeat(60));
	console.log(
		`\n✨ Pipeline complete! ${DRY_RUN ? "(dry run)" : `Output in: ${runDir}`}`,
	);
}

// Run the pipeline
runCrossReviewPipeline().catch((error) => {
	console.error("Error running pipeline:", error);
	process.exit(1);
});