/**
 * Draftbench: AI Model Benchmarking Pipeline
 *
 * Entry point and orchestration for the Generate → Review → Revise → Tournament pipeline.
 * Each phase is implemented in its own module under `phases/`.
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
	getFinaleJudges,
	getRoleEntries,
	getSwissJudges,
	loadConfig,
	parseArgs,
} from "./config";
import { computeLeaderboard } from "./leaderboard";
import { runFinalePhase } from "./phases/finale";
// Phase imports
import { runGeneratePhase } from "./phases/generate";
import { runInitialLeaderboardPhase } from "./phases/initialLeaderboard";
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
const INITIAL_LEADERBOARD = config.tournament.initialLeaderboard;
const SWISS_JUDGES = getSwissJudges();
const FINALE = config.tournament.finale;
const TOP_K = config.tournament.stopRules.topK;
const FINALE_JUDGES = getFinaleJudges();
const DRY_RUN = cliArgs.dryRun;
const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
const RATING = config.tournament.rating;
const SCHEDULING = config.tournament.scheduling;
const STOP_RULES = config.tournament.stopRules;

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
 * 6. Active learning finale to confidently rank the top-K
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
		`Finale: ${
			FINALE.enabled
				? `active learning (topK ${TOP_K}, max ${FINALE.maxTotalMatches} matches, batch ${FINALE.maxMatchesPerBatch}, judges: ${FINALE_JUDGES.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "high"})`).join(", ")})`
				: "off"
		}`,
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
		const runsRoot = resolve(RUNS_DIR);
		const runAbs = resolve(runDir);
		const rel = relative(runsRoot, runAbs);

		// Only use the relative path if runDir is actually inside RUNS_DIR.
		if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
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
	const finaleJudgmentsDir = FINALE.enabled
		? await ensureRunsDirectory(join(relRunPath, "finale_judgments"), DRY_RUN)
		: null;

	// Log paths
	const swissLogPath = join(runDir, "swiss_rounds.md");
	const initialLeaderboardLogPath = initialLeaderboardDir
		? join(initialLeaderboardDir, "leaderboard.md")
		: null;
	const finaleLogPath = join(runDir, "finale_rounds.md");

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
		if (FINALE.enabled) {
			await writeFile(finaleLogPath, "# Active Learning Finale\n\n", "utf-8");
		}
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

	// === PHASE 6: Finale ===
	const { finaleMatches } = await runFinalePhase(
		runDir,
		finaleLogPath,
		finaleJudgmentsDir ?? join(runDir, "finale_judgments"),
		state,
		contestants,
		revisionsById,
		DRY_RUN,
		isResuming,
	);

	// === FINAL: Leaderboard ===
	const finaleJudgmentCalls = finaleMatches.reduce(
		(acc, m) => acc + (m.judges?.length ?? 0),
		0,
	);

	const leaderboard = computeLeaderboard(
		contestants,
		allSwissMatches,
		revisionsById,
		state.initialLeaderboardResults,
		{
			matches: finaleMatches.length,
			judgments: finaleJudgmentCalls,
			iterations: state.finaleIterations ?? 0,
			converged: state.finaleConverged ?? false,
		},
	);
	const leaderboardPath = join(runDir, "leaderboard.md");
	if (!DRY_RUN) {
		await writeFile(leaderboardPath, leaderboard, "utf-8");
		console.log(`  ✓ Wrote ${leaderboardPath}`);
	} else {
		console.log(`  ✓ Leaderboard computed (dry run - not written)`);
	}

	// Print summary stats
	console.log(`\n${"=".repeat(60)}`);
	console.log("📊 TOURNAMENT SUMMARY");
	console.log("=".repeat(60));
	if (DRY_RUN) {
		console.log("🧪 DRY RUN - No API calls were made");
	}
	console.log(`Swiss Rounds: ${SWISS_ROUNDS} (${SWISS_FORMAT} format)`);
	console.log(`Swiss Matches: ${allSwissMatches.length}`);
	console.log(
		`Finale Matches: ${finaleMatches.length} (judgments: ${finaleJudgmentCalls})`,
	);
	console.log("");
	console.log("🏆 TOP 3 (Final Rankings):");

	const finalSorted = [...contestants].sort((a, b) => {
		const ratingA = typeof a.rating === "number" ? a.rating : null;
		const ratingB = typeof b.rating === "number" ? b.rating : null;
		if (ratingA !== null && ratingB !== null && ratingB !== ratingA) {
			return ratingB - ratingA;
		}
		if (b.points !== a.points) return b.points - a.points;
		const winsA = a.wins ?? 0;
		const winsB = b.wins ?? 0;
		if (winsB !== winsA) return winsB - winsA;
		if (b.placements.first !== a.placements.first)
			return b.placements.first - a.placements.first;
		return b.placements.second - a.placements.second;
	});

	for (let i = 0; i < 3; i++) {
		const c = finalSorted[i];
		if (!c) break;
		const ratingStr =
			typeof c.rating === "number" ? `, rating ${c.rating.toFixed(1)}` : "";
		console.log(
			`  ${["🥇", "🥈", "🥉"][i]} ${c.id} (${c.points} Swiss${ratingStr})`,
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
