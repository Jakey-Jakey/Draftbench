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
import { computeLeaderboard, computeRunSummary } from "./leaderboard";
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
import { computeDetailedRunSummary } from "./report/detailedSummary";

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
 * Orchestrates a full Cross-Review pipeline that runs generation, selection, review, revision, an optimized Swiss tournament, an optional active-learning finale, and produces a final leaderboard.
 *
 * This function initializes or resumes a run directory (with optional dry-run mode), creates required subdirectories and logs, executes the pipeline phases in order (generate → initial leaderboard → review → revise → Swiss → finale), computes the final leaderboard from tournament results, and writes the leaderboard file when not in dry-run mode.
 */
async function runCrossReviewPipeline(): Promise<void> {
	console.log(
		"🎲 Draftbench: D&D 5e Cross-Review Pipeline\n",
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
	console.log(
		`\nCoarse Ranking (Swiss rounds): ${SWISS_ROUNDS} (${SWISS_FORMAT} format)`,
	);
	console.log(
		`Coarse Ranking Engine: ${RATING.enabled ? `${RATING.backend} ratings + ${SCHEDULING.mode} scheduling` : "legacy points-only"} | Swiss Early Stop Rules: ${
			STOP_RULES.enabled
				? `on (min ${STOP_RULES.minBatches}, max ${STOP_RULES.maxBatches}, topK ${STOP_RULES.topK})`
				: "off"
		}`,
	);
	console.log(
		`Fine Ranking (Top-K refinement matches): ${
			FINALE.enabled
				? `active learning (topK ${TOP_K}, max ${FINALE.maxTotalMatches} matches, batch ${FINALE.maxMatchesPerBatch}, judges: ${FINALE_JUDGES.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "high"})`).join(", ")})`
				: "off"
		}`,
	);
	console.log(
		`Coarse Judges: ${SWISS_JUDGES.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "low"})`).join(", ")} | First Draft Selection: ${
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

	// ----------------------------
	// Output layout (legacy vs structured)
	// ----------------------------
	// New runs default to structured coarse/fine output directories.
	// Resumed runs keep their existing layout so we don't split logs mid-run.
	const legacySwissLogPath = join(runDir, "swiss_rounds.md");
	const legacyFinaleLogPath = join(runDir, "finale_rounds.md");
	const hasLegacyLayout =
		isResuming &&
		(existsSync(legacySwissLogPath) ||
			existsSync(join(runDir, "swiss_judgments")) ||
			existsSync(legacyFinaleLogPath) ||
			existsSync(join(runDir, "finale_judgments")));
	const layoutMode: "legacy" | "structured" = hasLegacyLayout
		? "legacy"
		: "structured";

	const swissJudgmentsDir =
		layoutMode === "legacy"
			? await ensureRunsDirectory(join(relRunPath, "swiss_judgments"), DRY_RUN)
			: await ensureRunsDirectory(join(relRunPath, "coarse", "judgments"), DRY_RUN);
	const swissRoundsRoot =
		layoutMode === "legacy"
			? legacySwissLogPath
			: await ensureRunsDirectory(join(relRunPath, "coarse", "rounds"), DRY_RUN);
	const swissStandingsDir =
		layoutMode === "legacy"
			? null
			: await ensureRunsDirectory(join(relRunPath, "coarse", "standings"), DRY_RUN);

	const finaleJudgmentsDir = FINALE.enabled
		? layoutMode === "legacy"
			? await ensureRunsDirectory(join(relRunPath, "finale_judgments"), DRY_RUN)
			: await ensureRunsDirectory(join(relRunPath, "fine", "judgments"), DRY_RUN)
		: null;
	const finaleIterationsRoot = FINALE.enabled
		? layoutMode === "legacy"
			? legacyFinaleLogPath
			: await ensureRunsDirectory(join(relRunPath, "fine", "iterations"), DRY_RUN)
		: null;
	const finaleStandingsDir = FINALE.enabled
		? layoutMode === "legacy"
			? null
			: await ensureRunsDirectory(join(relRunPath, "fine", "standings"), DRY_RUN)
		: null;

	const initialLeaderboardLogPath = initialLeaderboardDir
		? join(initialLeaderboardDir, "leaderboard.md")
		: null;

	// Initialize logs (only for new runs)
	if (!DRY_RUN && !isResuming) {
		if (initialLeaderboardLogPath) {
			await writeFile(
				initialLeaderboardLogPath,
				"# First Draft Leaderboard\n\n",
				"utf-8",
			);
		}
		// Coarse/fine logs are written per-round/per-iteration by the phase runners.
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

	// === PHASE 5: Coarse Ranking (Swiss Rounds) ===
	const { contestants, matches: allSwissMatches } = await runSwissPhase(
		runDir,
		{
			mode: layoutMode,
			roundsRoot: swissRoundsRoot,
			standingsDir: swissStandingsDir,
			judgmentsDir: swissJudgmentsDir,
		},
		state,
		revisionsById,
		DRY_RUN,
		isResuming,
	);

	// === PHASE 6: Fine Ranking (Top-K Refinement Matches) ===
	const { finaleMatches } = await runFinalePhase(
		runDir,
		{
			mode: layoutMode,
			iterationsRoot:
				finaleIterationsRoot ??
				(layoutMode === "legacy" ? legacyFinaleLogPath : join(runDir, "fine", "iterations")),
			standingsDir: finaleStandingsDir,
			judgmentsDir:
				finaleJudgmentsDir ??
				(layoutMode === "legacy"
					? join(runDir, "finale_judgments")
					: join(runDir, "fine", "judgments")),
		},
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

		const fineSummary = {
			matches: finaleMatches.length,
			judgments: finaleJudgmentCalls,
			iterations: state.finaleIterations ?? 0,
			converged: state.finaleConverged ?? false,
		};
		const leaderboard = computeLeaderboard(
			contestants,
			allSwissMatches,
			revisionsById,
			state.initialLeaderboardResults,
			fineSummary,
		);
		const leaderboardPath = join(runDir, "leaderboard.md");
		if (!DRY_RUN) {
			await writeFile(leaderboardPath, leaderboard, "utf-8");
			console.log(`  ✓ Wrote ${leaderboardPath}`);

			const summary = computeRunSummary({
				runDir,
				contestants,
				swissMatches: allSwissMatches,
				revisionsById,
				finaleSummary: fineSummary,
				swissEarlyStopReason: state.swissStopReason ?? null,
			});
			const summaryPath = join(runDir, "summary.json");
			await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
			console.log(`  ✓ Wrote ${summaryPath}`);

			const detailed = await computeDetailedRunSummary({
				runDir,
				contestants,
				swissMatches: allSwissMatches,
				finaleMatches,
				finaleSummary: fineSummary,
			});
			const detailedPath = join(runDir, "summary.detailed.json");
			await writeFile(detailedPath, JSON.stringify(detailed, null, 2), "utf-8");
			console.log(`  ✓ Wrote ${detailedPath}`);
		} else {
			console.log(`  ✓ Leaderboard computed (dry run - not written)`);
		}

		// Print summary stats
		console.log(`\n${"=".repeat(60)}`);
		console.log("📊 RUN SUMMARY");
		console.log("=".repeat(60));
	if (DRY_RUN) {
		console.log("🧪 DRY RUN - No API calls were made");
	}
	console.log(
		`Coarse Ranking (Swiss rounds): ${SWISS_ROUNDS} (${SWISS_FORMAT} format)`,
	);
	console.log(`Coarse Matches: ${allSwissMatches.length}`);
	console.log(
		`Fine Matches: ${finaleMatches.length} (judgments: ${finaleJudgmentCalls})`,
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
				`  ${["🥇", "🥈", "🥉"][i]} ${c.id} (${c.points} coarse pts${ratingStr})`,
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
