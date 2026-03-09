/**
 * Draftbench: AI Model Benchmarking Pipeline
 *
 * Entry point and orchestration for the Generate → Review → Revise → Tournament pipeline.
 * Each phase is implemented in its own module under `phases/`.
 */

import { existsSync } from "node:fs";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
	type CLIArgs,
	loadConfig,
	type PipelineConfig,
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
import { computeDetailedRunSummary } from "./report/detailedSummary";
import { initConcurrencyLimiter } from "./semaphore";
import {
	createInitialState,
	loadState,
	markPhaseCompleted,
	type PipelineState,
	saveState,
} from "./state";
import {
	ensureRunsDirectory,
	getShortModelName,
	getTimestamp,
	printDryRunConfig,
} from "./utils";

function resolveRunPathFromArg(runArg: string, runsDir: string): string {
	if (isAbsolute(runArg)) {
		return resolve(runArg);
	}

	const runArgFromCwd = resolve(runArg);
	const runsDirAbs = resolve(runsDir);
	const relToRunsDir = relative(runsDirAbs, runArgFromCwd);
	if (
		relToRunsDir &&
		!relToRunsDir.startsWith("..") &&
		!isAbsolute(relToRunsDir)
	) {
		return runArgFromCwd;
	}

	return resolve(runsDir, runArg);
}

function cloneReusedState(sourceState: PipelineState): PipelineState {
	return {
		...createInitialState(),
		generatedDrafts: sourceState.generatedDrafts
			? new Map(sourceState.generatedDrafts)
			: null,
		completedGenerators: [...(sourceState.completedGenerators ?? [])],
		selectedDrafts: sourceState.selectedDrafts
			? new Map(sourceState.selectedDrafts)
			: null,
		completedLeaderboardModels: [
			...(sourceState.completedLeaderboardModels ?? []),
		],
		initialLeaderboardResults: sourceState.initialLeaderboardResults
			? [...sourceState.initialLeaderboardResults]
			: null,
		reviews: sourceState.reviews ? [...sourceState.reviews] : null,
		revisions: sourceState.revisions ? new Map(sourceState.revisions) : null,
	};
}

async function copyIfExists(
	sourcePath: string,
	targetPath: string,
): Promise<void> {
	if (!existsSync(sourcePath)) return;
	await cp(sourcePath, targetPath, { recursive: true, force: true });
}

async function copyReusedArtifacts(
	sourceRunDir: string,
	targetRunDir: string,
): Promise<void> {
	const entries = await readdir(sourceRunDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!/_original_\d+\.md$/i.test(entry.name)) continue;
		await copyIfExists(
			join(sourceRunDir, entry.name),
			join(targetRunDir, entry.name),
		);
	}

	await copyIfExists(
		join(sourceRunDir, "reviews"),
		join(targetRunDir, "reviews"),
	);
	await copyIfExists(
		join(sourceRunDir, "revisions"),
		join(targetRunDir, "revisions"),
	);
	await copyIfExists(
		join(sourceRunDir, "initial_leaderboard"),
		join(targetRunDir, "initial_leaderboard"),
	);
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Orchestrates a full Cross-Review pipeline that runs generation, first-draft selection, review,
 * revision, a coarse-ranking tournament (Swiss), an optional fine-ranking (active learning),
 * and produces a final leaderboard.
 *
 * This function initializes or resumes a run directory (with optional dry-run mode), creates required
 * subdirectories and logs, executes the pipeline phases in order (generate -> first draft selection
 * -> review -> revise -> coarse ranking -> fine ranking), computes the final leaderboard from
 * tournament results, and writes the leaderboard file when not in dry-run mode.
 */
async function runCrossReviewPipeline(
	cliArgs: CLIArgs,
	config: PipelineConfig,
): Promise<void> {
	const runsDir = config.output.runsDirectory;
	const swissRounds = config.tournament.swissRounds;
	const initialLeaderboard = config.tournament.initialLeaderboard;
	const swissJudges = config.roles.swissJudges;
	const finale = cliArgs.skipFine
		? { ...config.tournament.finale, enabled: false }
		: config.tournament.finale;
	const topK = config.tournament.stopRules.topK;
	const finaleJudges = config.roles.finaleJudges;
	const dryRun = cliArgs.dryRun;
	const swissFormat = config.tournament.swissFormat ?? "1v1v1";
	const rating = config.tournament.rating;
	const scheduling = config.tournament.scheduling;
	const stopRules = config.tournament.stopRules;
	const effectiveTournament = { ...config.tournament, finale };
	const effectiveConfig = { ...config, tournament: effectiveTournament };
	console.log("🎲 Draftbench: D&D 5e Cross-Review Pipeline\n");

	if (dryRun) {
		console.log("🧪 DRY RUN MODE - No API calls will be made\n");
		printDryRunConfig(config);
	}

	console.log("📝 Creating: Monster Statblock\n");

	// Display roles
	console.log("Generators:");
	for (const entry of config.roles.generators) {
		console.log(
			`  - ${getShortModelName(entry.model)} (effort: ${entry.effort ?? "high"})`,
		);
	}
	console.log(
		`\nCoarse Ranking (Swiss rounds): ${swissRounds} (${swissFormat} format)`,
	);
	console.log(
		`Coarse Ranking Engine: ${rating.enabled ? `${rating.backend} ratings + ${scheduling.mode} scheduling` : "legacy points-only"} | Coarse Early Stop Rules: ${
			stopRules.enabled
				? `on (min ${stopRules.minBatches}, max ${stopRules.maxBatches}, topK ${stopRules.topK})`
				: "off"
		}`,
	);
	console.log(
		`Fine Ranking (Top-K refinement; active learning): ${
			finale.enabled
				? `active learning (topK ${topK}, max ${finale.maxTotalMatches} matches, batch ${finale.maxMatchesPerBatch}, judges: ${finaleJudges.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "high"})`).join(", ")})`
				: "off"
		}`,
	);
	console.log(
		`Coarse Judges: ${swissJudges.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "low"})`).join(", ")} | First Draft Selection: ${
			initialLeaderboard.enabled ? "enabled" : "disabled"
		}\n`,
	);

	// === RESUME / STATE INITIALIZATION ===
	let runDir: string;
	let state: PipelineState;
	let isResuming = false;

	if (cliArgs.resumeDir) {
		const resumePath = resolveRunPathFromArg(cliArgs.resumeDir, runsDir);

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
	} else if (cliArgs.reuseArtifactsDir) {
		const sourcePath = resolveRunPathFromArg(
			cliArgs.reuseArtifactsDir,
			runsDir,
		);

		if (!existsSync(sourcePath)) {
			throw new Error(
				`Artifact reuse source directory not found: ${sourcePath}`,
			);
		}

		const sourceState = loadState(sourcePath);
		if (!sourceState) {
			throw new Error(`Could not load state from: ${sourcePath}`);
		}

		const requiredPhases = [
			"generate",
			"initial_leaderboard",
			"review",
			"revise",
		];
		const missingPhases = requiredPhases.filter(
			(phase) => !sourceState.phasesCompleted.includes(phase),
		);
		if (missingPhases.length > 0) {
			throw new Error(
				`Source run is missing completed phases: ${missingPhases.join(", ")}. Cannot reuse artifacts from an incomplete run.`,
			);
		}

		const timestamp = getTimestamp();
		runDir = await ensureRunsDirectory(runsDir, timestamp, dryRun);
		state = cloneReusedState(sourceState);
		await copyReusedArtifacts(sourcePath, runDir);
		for (const phase of requiredPhases) {
			markPhaseCompleted(state, phase);
		}

		if (cliArgs.skipCoarse) {
			if (!sourceState.phasesCompleted.includes("swiss")) {
				throw new Error(
					"--skip-coarse requires the source run to have completed the swiss phase",
				);
			}
			state.swissRound = sourceState.swissRound;
			state.swissMatches = structuredClone(sourceState.swissMatches);
			state.contestants = sourceState.contestants
				? structuredClone(sourceState.contestants)
				: null;
			state.ratingState = sourceState.ratingState
				? structuredClone(sourceState.ratingState)
				: null;
			state.pairwiseHistory = structuredClone(
				sourceState.pairwiseHistory ?? [],
			);
			state.topKHistory = structuredClone(sourceState.topKHistory ?? []);
			state.swissStopReason = sourceState.swissStopReason ?? null;
			markPhaseCompleted(state, "swiss");
		}

		isResuming = true;
		if (!dryRun) {
			saveState(runDir, state);
		}

		console.log(`\n♻️ REUSING ARTIFACTS from: ${sourcePath}`);
		console.log(`   New run directory: ${runDir}`);
		console.log(
			`   Phases carried over: [${state.phasesCompleted.join(", ")}]`,
		);
		if (cliArgs.skipCoarse) {
			console.log("   Coarse ranking: skipped (reusing source results)");
		}
		if (cliArgs.skipFine) {
			console.log("   Fine ranking: will be skipped");
		}
		console.log();
	} else {
		const timestamp = getTimestamp();
		runDir = await ensureRunsDirectory(runsDir, timestamp, dryRun);
		state = createInitialState();
	}
	if (dryRun) {
		await mkdir(runDir, { recursive: true });
	}

	// Helper for subdirectory paths
	const getRelativeRunPath = () => {
		const runsRoot = resolve(runsDir);
		const runAbs = resolve(runDir);
		const rel = relative(runsRoot, runAbs);

		// Only use the relative path if runDir is actually inside runsDir.
		if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
		return runDir;
	};
	const relRunPath = getRelativeRunPath();

	// Ensure subdirectories exist
	const revisionsDir = await ensureRunsDirectory(
		runsDir,
		join(relRunPath, "revisions"),
		dryRun,
	);
	const reviewsDir = await ensureRunsDirectory(
		runsDir,
		join(relRunPath, "reviews"),
		dryRun,
	);
	const initialLeaderboardDir = initialLeaderboard.enabled
		? await ensureRunsDirectory(
				runsDir,
				join(relRunPath, "initial_leaderboard"),
				dryRun,
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
			? await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "swiss_judgments"),
					dryRun,
				)
			: await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "coarse", "judgments"),
					dryRun,
				);
	const swissRoundsRoot =
		layoutMode === "legacy"
			? legacySwissLogPath
			: await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "coarse", "rounds"),
					dryRun,
				);
	const swissStandingsDir =
		layoutMode === "legacy"
			? null
			: await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "coarse", "standings"),
					dryRun,
				);

	const finaleJudgmentsDir = finale.enabled
		? layoutMode === "legacy"
			? await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "finale_judgments"),
					dryRun,
				)
			: await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "fine", "judgments"),
					dryRun,
				)
		: null;
	const finaleIterationsRoot = finale.enabled
		? layoutMode === "legacy"
			? legacyFinaleLogPath
			: await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "fine", "iterations"),
					dryRun,
				)
		: null;
	const finaleStandingsDir = finale.enabled
		? layoutMode === "legacy"
			? null
			: await ensureRunsDirectory(
					runsDir,
					join(relRunPath, "fine", "standings"),
					dryRun,
				)
		: null;

	const initialLeaderboardLogPath = initialLeaderboardDir
		? join(initialLeaderboardDir, "leaderboard.md")
		: null;

	// Initialize logs (only for new runs)
	if (!dryRun && !isResuming) {
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
		{
			generators: config.roles.generators,
			initialGenerations: config.tournament.initialGenerations,
			prompts: config.prompts,
		},
		dryRun,
		isResuming,
	);

	// === PHASE 2: Initial Leaderboard ===
	const { selectedByModel } = await runInitialLeaderboardPhase(
		runDir,
		state,
		{
			generatorSlugs: config.roles.generators.map((entry) => entry.model),
			initialLeaderboard: config.tournament.initialLeaderboard,
			initialGenerations: config.tournament.initialGenerations,
			leaderboardJudges:
				config.roles.initialLeaderboardJudges ?? config.roles.finaleJudges,
			swissJudges: config.roles.swissJudges,
			prompts: config.prompts,
		},
		draftsByModel,
		initialLeaderboardLogPath,
		dryRun,
		isResuming,
	);

	// === PHASE 3: Review ===
	const { reviews } = await runReviewPhase(
		runDir,
		reviewsDir,
		state,
		{
			reviewers: config.roles.reviewers,
			prompts: config.prompts,
		},
		selectedByModel,
		dryRun,
		isResuming,
	);

	// === PHASE 4: Revise ===
	const { revisionsById } = await runRevisePhase(
		runDir,
		revisionsDir,
		state,
		{
			revisers: config.roles.revisers,
			prompts: config.prompts,
		},
		selectedByModel,
		reviews,
		dryRun,
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
		{
			swissRounds: swissRounds,
			swissJudges: swissJudges,
			swissFormat: swissFormat,
			rating,
			scheduling,
			stopRules,
			prompts: config.prompts,
		},
		revisionsById,
		dryRun,
		isResuming,
	);

	// === PHASE 6: Fine Ranking (Top-K Refinement Matches) ===
	const { finaleMatches } = await runFinalePhase(
		runDir,
		{
			mode: layoutMode,
			iterationsRoot: finaleIterationsRoot ?? null,
			standingsDir: finaleStandingsDir,
			judgmentsDir: finaleJudgmentsDir ?? null,
		},
		state,
		{
			finale,
			stopRules,
			rating,
			scheduling,
			finaleJudges,
			prompts: config.prompts,
		},
		contestants,
		revisionsById,
		dryRun,
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
		{
			tournament: effectiveTournament,
			swissJudges,
			finaleJudges,
		},
	);
	const leaderboardOutput = dryRun
		? `> ⚠️ DRY RUN ARTIFACT: This file contains mock/simulated data only.\n\n${leaderboard}`
		: leaderboard;
	const leaderboardPath = join(runDir, "leaderboard.md");
	await writeFile(leaderboardPath, leaderboardOutput, "utf-8");
	console.log(`  ✓ Wrote ${leaderboardPath}`);

	const summary = computeRunSummary({
		runDir,
		contestants,
		swissMatches: allSwissMatches,
		revisionsById,
		finaleSummary: fineSummary,
		swissEarlyStopReason: state.swissStopReason ?? null,
		configContext: {
			tournament: effectiveTournament,
			swissJudges,
			finaleJudges,
		},
	});
	const summaryPath = join(runDir, "summary.json");
	await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
	console.log(`  ✓ Wrote ${summaryPath}`);
	if (dryRun) {
		const dryRunMarkerPath = join(runDir, "DRY_RUN.md");
		await writeFile(
			dryRunMarkerPath,
			"# DRY RUN\n\nThis run directory contains mock/simulated outputs only.\n",
			"utf-8",
		);
		console.log(`  ✓ Wrote ${dryRunMarkerPath}`);
	}

	if (!dryRun) {
		const detailed = await computeDetailedRunSummary({
			runDir,
			contestants,
			swissMatches: allSwissMatches,
			finaleMatches,
			finaleSummary: fineSummary,
			config: effectiveConfig,
		});
		const detailedPath = join(runDir, "summary.detailed.json");
		await writeFile(detailedPath, JSON.stringify(detailed, null, 2), "utf-8");
		console.log(`  ✓ Wrote ${detailedPath}`);
	}

	// Print summary stats
	console.log(`\n${"=".repeat(60)}`);
	console.log("📊 RUN SUMMARY");
	console.log("=".repeat(60));
	if (dryRun) {
		console.log("🧪 DRY RUN - No API calls were made");
	}
	console.log(
		`Coarse Ranking (Swiss rounds): ${swissRounds} (${swissFormat} format)`,
	);
	console.log(`Coarse Matches: ${allSwissMatches.length}`);
	console.log(
		`Fine Matches: ${finaleMatches.length} (judgments: ${finaleJudgmentCalls})`,
	);
	console.log("");
	console.log("🏆 TOP 3 (Final Rankings):");

	const ratingEnabled = config.tournament.rating.enabled;
	const useRating =
		ratingEnabled &&
		contestants.length > 0 &&
		contestants.every((c) => typeof c.rating === "number");

	const finalSorted = [...contestants].sort((a, b) => {
		if (useRating) {
			const ratingA = a.rating ?? 0;
			const ratingB = b.rating ?? 0;
			if (ratingB !== ratingA) return ratingB - ratingA;
		} else {
			if (b.points !== a.points) return b.points - a.points;
		}
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
		`\n✨ Pipeline complete! ${dryRun ? "(dry run)" : `Output in: ${runDir}`}`,
	);
}

async function main(): Promise<void> {
	const cliArgs = parseArgs();
	const config = loadConfig(cliArgs.configPath, cliArgs.promptsPath);

	initConcurrencyLimiter(config.concurrency?.maxParallel);
	await runCrossReviewPipeline(cliArgs, config);
}

// Run the pipeline
main().catch((error) => {
	console.error("Error running pipeline:", error);
	process.exit(1);
});
