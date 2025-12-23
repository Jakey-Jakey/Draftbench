/**
 * Draftbench: AI Model Benchmarking Pipeline
 *
 * Entry point and orchestration for the Generate → Review → Revise → Tournament pipeline.
 * Each phase is implemented in its own module under `phases/`.
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getModels } from "./aiClient";
import { loadConfig, parseArgs } from "./config";
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
import { ensureRunsDirectory, getTimestamp, printDryRunConfig } from "./utils";

// ============================================================================
// Configuration
// ============================================================================

const cliArgs = parseArgs();
const config = loadConfig(cliArgs.configPath);

// Initialize concurrency limiter if configured
initConcurrencyLimiter(config.concurrency?.maxParallel);

const RUNS_DIR = config.output.runsDirectory;
const MODEL_NAMES = Object.keys(config.models);
const SWISS_ROUNDS = config.tournament.swissRounds;
const TOP_N_PLAYOFF = config.tournament.playoffSize;
const INITIAL_LEADERBOARD = config.tournament.initialLeaderboard;
const SWISS_JUDGE = config.tournament.swissJudge;
const PLAYOFF_JUDGES = config.tournament.playoffJudges;
const DRY_RUN = cliArgs.dryRun;

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Runs the cross-review pipeline with optimized Swiss System:
 * 1. Each model generates N drafts (parallel per model, configurable count)
 * 2. Optional initial round robin to pick the best draft per model
 * 3. Each model reviews ALL models' selected drafts (cross-review)
 * 4. ALL models revise each original based on each review (27 revisions for 3 models)
 * 5. Swiss tournament: 7 rounds of 1v1v1 judging (9 matches/round = 63 total)
 * 6. Top-8 Round Robin playoff with configurable judges
 * 7. Compute final leaderboard
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
	console.log(
		"Models:",
		Object.entries(getModels())
			.map(([k, v]) => `${k}: ${v}`)
			.join("\n        "),
	);
	console.log(`\nSwiss Rounds: ${SWISS_ROUNDS} (1v1v1 format)`);
	console.log(
		`Playoff: Top-${TOP_N_PLAYOFF} Round Robin (judges: ${PLAYOFF_JUDGES.map((j) => `${j.model} (${j.effort})`).join(", ")})`,
	);
	console.log(
		`Swiss Judge: ${SWISS_JUDGE.model} (${SWISS_JUDGE.effort}) | Initial Leaderboard: ${
			INITIAL_LEADERBOARD.enabled
				? (INITIAL_LEADERBOARD.judges.length
						? INITIAL_LEADERBOARD.judges
						: PLAYOFF_JUDGES
					)
						.map((j) => `${j.model} (${j.effort})`)
						.join(", ")
				: "disabled"
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
			"# Swiss Tournament Log (1v1v1)\n\n",
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
	const leaderboardJudges = INITIAL_LEADERBOARD.judges.length
		? INITIAL_LEADERBOARD.judges
		: PLAYOFF_JUDGES;
	const initialLeaderboardPairs =
		INITIAL_LEADERBOARD.enabled && leaderboardJudges.length > 0
			? (MODEL_NAMES.length *
					config.tournament.initialGenerations *
					(MODEL_NAMES.length * config.tournament.initialGenerations - 1)) /
				2
			: 0;

	console.log("\n" + "=".repeat(60));
	console.log("📊 TOURNAMENT SUMMARY");
	console.log("=".repeat(60));
	if (DRY_RUN) {
		console.log("🧪 DRY RUN - No API calls were made");
	}
	console.log(`Swiss Rounds: ${SWISS_ROUNDS} (1v1v1 format)`);
	console.log(`Swiss Matches: ${allSwissMatches.length}`);
	console.log(
		`Playoff Judgments: ${playoffPairCount * PLAYOFF_JUDGES.length} (${playoffPairCount} pairs × ${PLAYOFF_JUDGES.length} judges)`,
	);
	console.log(
		`Total Judge Calls: ${allSwissMatches.length + playoffPairCount * PLAYOFF_JUDGES.length + initialLeaderboardPairs * leaderboardJudges.length}`,
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
		const c = finalSorted[i]!;
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
