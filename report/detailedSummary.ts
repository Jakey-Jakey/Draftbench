import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { PipelineConfig } from "../config";
import { getLoadedConfig } from "../config/context";
import { DEFAULT_CONFIG } from "../config/defaults";
import type {
	FinaleSummary,
	SwissContestant,
	SwissMatch,
} from "../leaderboard";
import { pairwiseFromSwissMatch } from "../rating/convert";
import {
	applyPairwiseBatch,
	createRatingState,
	estimateWinProbability,
	getRatingStandings,
	getRatingStandingsWithOptions,
} from "../rating/engine";
import type { PairwiseObservation, RatingState } from "../rating/types";
import { planActiveRankingBatch } from "../scheduling/activeRanking";
import { countRepeatPairs, pairKey } from "../scheduling/pairs";
import { evaluateStopRules } from "../scheduling/stopRules";
import type { StoredFinaleMatch } from "../state";
import { confidenceMultiplier } from "../utils";
import { sha256File } from "./hash";

export interface DetailedFileEntryV1 {
	path: string;
	kind:
		| "state"
		| "leaderboard_md"
		| "summary_json"
		| "summary_detailed_json"
		| "swiss_log"
		| "finale_log"
		| "coarse_round_md"
		| "fine_iteration_md"
		| "coarse_standings_md"
		| "coarse_standings_json"
		| "fine_standings_md"
		| "fine_standings_json"
		| "revision_md"
		| "initial_leaderboard_md";
	bytes: number;
	sha256: string;
}

export interface DetailedSwissMatchV1 {
	round: number;
	ids: [string, string, string];
	first: string;
	second: string;
	third: string;
	tieGroup?: SwissMatch["tieGroup"];
	sharedPoints?: Record<string, number>;
	judgmentFile: string | null;
	pairwiseObservations: PairwiseObservation[];
}

export interface SwissRoundDiagnosticsV1 {
	round: number;
	matchCount: number;
	judgeCallsCumulative: number;
	topKSnapshot: string[];
	boundary: {
		topK: number;
		boundaryLeftId: string | null;
		boundaryRightId: string | null;
		separation: number | null;
		leftLow: number | null;
		rightHigh: number | null;
		passesConfidence: boolean | null;
		passesSeparation: boolean | null;
	};
	stopRuleEvaluation: ReturnType<typeof evaluateStopRules>;
}

export interface DetailedFinaleMatchV1 extends StoredFinaleMatch {
	judgmentFile: string;
	repeatCountBefore: number;
	predictedWinProbBefore: number;
	revisionPathA: string;
	revisionPathB: string;
}

export interface FinaleIterationDiagnosticsV1 {
	iteration: number;
	scopeTopK: string[];
	adjacentUnseparatedBefore: [string, string][];
	plannedPairsEligibleCount: number;
	matches: DetailedFinaleMatchV1[];
}

export interface DetailedRunSummaryV1 {
	version: 1;
	runDir: string;
	artifacts: { files: DetailedFileEntryV1[] };
	coarseRanking: {
		configSnapshot: {
			swissRounds: number;
			swissFormat: "1v1" | "1v1v1";
			swissJudges: { model: string; effort: string }[];
			stopRules: PipelineConfig["tournament"]["stopRules"];
			rating: PipelineConfig["tournament"]["rating"];
			scheduling: PipelineConfig["tournament"]["scheduling"];
		};
		rounds: SwissRoundDiagnosticsV1[];
		matches: DetailedSwissMatchV1[];
	};
	fineRanking: {
		configSnapshot: {
			finale: PipelineConfig["tournament"]["finale"];
			finaleJudges: { model: string; effort: string }[];
			effectiveMaxRepeatPairs: number;
		};
		stoppedReason:
			| "disabled"
			| "converged"
			| "budget_exhausted"
			| "no_eligible_pairs";
		iterations: FinaleIterationDiagnosticsV1[];
	};
}

function relPath(runDir: string, abs: string): string {
	const rel = relative(runDir, abs);
	return rel && !rel.startsWith("..") ? rel : abs;
}

function swissJudgmentPath(match: SwissMatch, baseDir: string): string {
	const [a, b, c] = match.ids;
	if (!a || !b) return join(baseDir, `round${match.round}_unknown.md`);
	// 1v1 stores the third slot as "N/A", and bye matches include "BYE".
	if (b === "BYE" || c === "BYE") {
		return join(baseDir, `round${match.round}_${a}_vs_${b}.md`);
	}
	if (!c || c === "N/A") {
		return join(baseDir, `round${match.round}_${a}_vs_${b}.md`);
	}
	// 1v1v1 uses all 3.
	return join(baseDir, `round${match.round}_${a}_vs_${b}_vs_${c}.md`);
}

function finaleJudgmentPath(
	iteration: number,
	aId: string,
	bId: string,
	baseDir: string,
): string {
	const safeKey = `${aId}__vs__${bId}`.replaceAll("/", "_");
	return join(baseDir, `iter_${iteration}_${safeKey}.md`);
}

function computeBoundarySnapshot(args: {
	standings: { id: string; rating: number; uncertainty: number }[];
	topK: number;
	confidence: number;
	minSeparation: number;
}): SwissRoundDiagnosticsV1["boundary"] {
	const { standings, topK, confidence, minSeparation } = args;
	const k = Math.max(1, Math.min(topK, standings.length));
	const boundaryLeft = standings[k - 1];
	const boundaryRight = standings[k];

	if (!boundaryLeft || !boundaryRight) {
		return {
			topK: k,
			boundaryLeftId: boundaryLeft?.id ?? null,
			boundaryRightId: null,
			separation: null,
			leftLow: null,
			rightHigh: null,
			passesConfidence: true,
			passesSeparation: null,
		};
	}

	const separation = boundaryLeft.rating - boundaryRight.rating;
	const z = confidenceMultiplier(confidence);
	const leftLow = boundaryLeft.rating - z * boundaryLeft.uncertainty;
	const rightHigh = boundaryRight.rating + z * boundaryRight.uncertainty;
	const passesConfidence = leftLow > rightHigh;
	const passesSeparation =
		minSeparation > 0 ? separation >= minSeparation : null;

	return {
		topK: k,
		boundaryLeftId: boundaryLeft.id,
		boundaryRightId: boundaryRight.id,
		separation,
		leftLow,
		rightHigh,
		passesConfidence,
		passesSeparation,
	};
}

function adjacentUnseparatedWithMinGap(args: {
	standings: {
		id: string;
		rating: number;
		uncertainty: number;
		ciLow: number;
		ciHigh: number;
	}[];
	scope: string[];
	minSeparation: number;
}): { separated: boolean; unseparated: [string, string][] } {
	const { standings, scope, minSeparation } = args;
	if (scope.length < 2) return { separated: true, unseparated: [] };
	const byId = new Map(standings.map((s) => [s.id, s] as const));
	const unseparated: [string, string][] = [];
	for (let i = 0; i < scope.length - 1; i++) {
		const leftId = scope[i];
		const rightId = scope[i + 1];
		if (!leftId || !rightId) continue;
		const left = byId.get(leftId);
		const right = byId.get(rightId);
		if (!left || !right) continue;
		const gap = left.rating - right.rating;
		const ciSeparated = left.ciLow > right.ciHigh || right.ciLow > left.ciHigh;
		const gapSeparated = minSeparation > 0 ? gap >= minSeparation : false;
		if (!ciSeparated && !gapSeparated) unseparated.push([leftId, rightId]);
	}
	return { separated: unseparated.length === 0, unseparated };
}

function buildRatingStateFromSwiss(
	ids: string[],
	swissMatches: SwissMatch[],
	config: PipelineConfig,
): { ratingState: RatingState; pairwiseHistory: PairwiseObservation[] } {
	const rating = config.tournament.rating;
	const ratingState = createRatingState(ids, {
		backend: rating.backend,
		initialRating: rating.initialRating,
		kFactor: rating.kFactor,
		provisionalMatches: rating.provisionalMatches,
		tieValue: rating.tieValue,
		btIterations: rating.btIterations,
		btTolerance: rating.btTolerance,
		ciBootstrapSamples: rating.ciBootstrapSamples,
		btRegularization: rating.btRegularization,
		btUseNewton: rating.btUseNewton,
		ciMode: rating.ciMode,
	});
	const pairwiseHistory: PairwiseObservation[] = [];
	for (const match of swissMatches) {
		if (match.ids.includes("BYE")) continue;
		const edges = pairwiseFromSwissMatch(match, rating.tieValue);
		pairwiseHistory.push(...edges);
	}
	if (pairwiseHistory.length > 0)
		applyPairwiseBatch(ratingState, pairwiseHistory);
	return { ratingState, pairwiseHistory };
}

export async function computeDetailedRunSummary(args: {
	runDir: string;
	contestants: SwissContestant[];
	swissMatches: SwissMatch[];
	finaleMatches: StoredFinaleMatch[];
	finaleSummary: FinaleSummary;
	includeHashes?: boolean;
	config?: PipelineConfig;
}): Promise<DetailedRunSummaryV1> {
	const config = args.config ?? getLoadedConfig() ?? DEFAULT_CONFIG;
	const includeHashes = args.includeHashes !== false;
	const runDir = args.runDir;
	const hasStructuredLayout =
		existsSync(join(runDir, "coarse")) || existsSync(join(runDir, "fine"));

	// -----------------------------
	// Artifacts (hashes + sizes)
	// -----------------------------
	const files: DetailedFileEntryV1[] = [];
	if (includeHashes) {
		const add = async (abs: string, kind: DetailedFileEntryV1["kind"]) => {
			try {
				const info = await sha256File(abs);
				files.push({
					path: relPath(runDir, abs),
					kind,
					bytes: info.bytes,
					sha256: info.sha256,
				});
			} catch {
				// best-effort; missing files are okay
			}
		};

		await add(join(runDir, "state.json"), "state");
		await add(join(runDir, "leaderboard.md"), "leaderboard_md");
		await add(join(runDir, "summary.json"), "summary_json");
		// summary.detailed.json is written after this function returns; caller can add it if desired.
		if (!hasStructuredLayout) {
			await add(join(runDir, "swiss_rounds.md"), "swiss_log");
			await add(join(runDir, "finale_rounds.md"), "finale_log");
		} else {
			try {
				const coarseRoundsDir = join(runDir, "coarse", "rounds");
				const entries = await readdir(coarseRoundsDir);
				for (const name of entries) {
					if (!name.endsWith(".md")) continue;
					await add(join(coarseRoundsDir, name), "coarse_round_md");
				}
			} catch {
				// ignore
			}
			try {
				const fineIterationsDir = join(runDir, "fine", "iterations");
				const entries = await readdir(fineIterationsDir);
				for (const name of entries) {
					if (!name.endsWith(".md")) continue;
					await add(join(fineIterationsDir, name), "fine_iteration_md");
				}
			} catch {
				// ignore
			}
			try {
				const coarseStandingsDir = join(runDir, "coarse", "standings");
				const entries = await readdir(coarseStandingsDir);
				for (const name of entries) {
					if (name.endsWith(".md")) {
						await add(join(coarseStandingsDir, name), "coarse_standings_md");
					}
					if (name.endsWith(".json")) {
						await add(join(coarseStandingsDir, name), "coarse_standings_json");
					}
				}
			} catch {
				// ignore
			}
			try {
				const fineStandingsDir = join(runDir, "fine", "standings");
				const entries = await readdir(fineStandingsDir);
				for (const name of entries) {
					if (name.endsWith(".md")) {
						await add(join(fineStandingsDir, name), "fine_standings_md");
					}
					if (name.endsWith(".json")) {
						await add(join(fineStandingsDir, name), "fine_standings_json");
					}
				}
			} catch {
				// ignore
			}
		}

		// Hash all revisions (the most important content artifacts).
		try {
			const revisionsDir = join(runDir, "revisions");
			const entries = await readdir(revisionsDir);
			for (const name of entries) {
				if (!name.endsWith(".md")) continue;
				await add(join(revisionsDir, name), "revision_md");
			}
		} catch {
			// ignore
		}

		// Initial leaderboard output (if enabled)
		await add(
			join(runDir, "initial_leaderboard", "leaderboard.md"),
			"initial_leaderboard_md",
		);
	}

	// -----------------------------
	// Coarse ranking: per-round stop rule snapshots + match list
	// -----------------------------
	const contestantIds = args.contestants.map((c) => c.id);
	const swissFormat = config.tournament.swissFormat ?? "1v1v1";
	const swissJudges = config.roles.swissJudges.map((j) => ({
		model: j.model,
		effort: j.effort ?? "low",
	}));
	const finaleJudges = config.roles.finaleJudges.map((j) => ({
		model: j.model,
		effort: j.effort ?? "high",
	}));

	const swissJudgeCount = config.roles.swissJudges.length;
	const stopRulesConfig = config.tournament.stopRules;

	const swissMatchesSorted = [...args.swissMatches].sort(
		(a, b) => a.round - b.round,
	);
	const maxRound = swissMatchesSorted.reduce(
		(acc, m) => Math.max(acc, m.round),
		0,
	);

	const ratingStateRounds = createRatingState(contestantIds, {
		backend: config.tournament.rating.backend,
		initialRating: config.tournament.rating.initialRating,
		kFactor: config.tournament.rating.kFactor,
		provisionalMatches: config.tournament.rating.provisionalMatches,
		tieValue: config.tournament.rating.tieValue,
		btIterations: config.tournament.rating.btIterations,
		btTolerance: config.tournament.rating.btTolerance,
		ciBootstrapSamples: config.tournament.rating.ciBootstrapSamples,
		btRegularization: config.tournament.rating.btRegularization,
		btUseNewton: config.tournament.rating.btUseNewton,
		ciMode: config.tournament.rating.ciMode,
	});

	const topKHistory: string[][] = [];
	const rounds: SwissRoundDiagnosticsV1[] = [];

	for (let round = 1; round <= maxRound; round++) {
		const roundMatches = swissMatchesSorted.filter((m) => m.round === round);
		const judgedMatchesCumulative = swissMatchesSorted
			.filter((m) => m.round <= round)
			.filter((m) => !m.ids.includes("BYE")).length;
		const judgeCallsCumulative = judgedMatchesCumulative * swissJudgeCount;

		const roundPairwise = roundMatches
			.filter((m) => !m.ids.includes("BYE"))
			.flatMap((m) =>
				pairwiseFromSwissMatch(m, config.tournament.rating.tieValue),
			);

		if (roundPairwise.length > 0)
			applyPairwiseBatch(ratingStateRounds, roundPairwise);

		const standings = getRatingStandings(ratingStateRounds);
		const orderedIds = standings.map((s) => s.id);
		const topK = Math.max(1, Math.min(stopRulesConfig.topK, orderedIds.length));

		if (stopRulesConfig.enabled) topKHistory.push(orderedIds.slice(0, topK));

		const stop = evaluateStopRules(
			{
				round,
				totalCalls: judgeCallsCumulative,
				standings,
				topKHistory,
			},
			stopRulesConfig,
		);

		rounds.push({
			round,
			matchCount: roundMatches.length,
			judgeCallsCumulative,
			topKSnapshot: orderedIds.slice(0, topK),
			boundary: computeBoundarySnapshot({
				standings,
				topK,
				confidence: stopRulesConfig.confidence,
				minSeparation: stopRulesConfig.minSeparation,
			}),
			stopRuleEvaluation: stop,
		});
	}

	const swissJudgmentsBase = hasStructuredLayout
		? join("coarse", "judgments")
		: "swiss_judgments";
	const swissMatchesDetailed: DetailedSwissMatchV1[] = swissMatchesSorted.map(
		(m) => ({
			round: m.round,
			ids: m.ids,
			first: m.first,
			second: m.second,
			third: m.third,
			tieGroup: m.tieGroup,
			sharedPoints: m.sharedPoints,
			judgmentFile: m.ids.includes("BYE")
				? null
				: swissJudgmentPath(m, swissJudgmentsBase),
			pairwiseObservations: m.ids.includes("BYE")
				? []
				: pairwiseFromSwissMatch(m, config.tournament.rating.tieValue),
		}),
	);

	// -----------------------------
	// Fine ranking: per-iteration uncertainty + match details
	// -----------------------------
	const { ratingState: ratingStateAfterSwiss, pairwiseHistory } =
		buildRatingStateFromSwiss(contestantIds, swissMatchesSorted, config);
	void pairwiseHistory; // retained for potential future diagnostics

	// Now step through finale matches in stored order.
	const finaleMatchesSorted = [...args.finaleMatches].sort((a, b) => {
		if (a.iteration !== b.iteration) return a.iteration - b.iteration;
		return pairKey(a.aId, a.bId).localeCompare(pairKey(b.aId, b.bId));
	});

	let stoppedReason: DetailedRunSummaryV1["fineRanking"]["stoppedReason"] =
		"disabled";
	if (config.tournament.finale.enabled) {
		if (args.finaleSummary.converged) stoppedReason = "converged";
		else if (
			finaleMatchesSorted.length >= config.tournament.finale.maxTotalMatches
		)
			stoppedReason = "budget_exhausted";
		else stoppedReason = "no_eligible_pairs";
	}

	const iterationsMap = new Map<number, StoredFinaleMatch[]>();
	for (const m of finaleMatchesSorted) {
		const list = iterationsMap.get(m.iteration) ?? [];
		list.push(m);
		iterationsMap.set(m.iteration, list);
	}

	const iterations: FinaleIterationDiagnosticsV1[] = [];
	const effectiveMaxRepeatPairs = config.tournament.finale.allowOverRepeatCap
		? Number.MAX_SAFE_INTEGER
		: config.tournament.scheduling.maxRepeatPairs;

	// We'll mutate this state as we apply finale observations.
	const ratingStateFine = ratingStateAfterSwiss;

	for (const [iteration, matches] of Array.from(iterationsMap.entries()).sort(
		(a, b) => a[0] - b[0],
	)) {
		const standings = getRatingStandingsWithOptions(ratingStateFine, {
			bootstrapCi: false,
			confidence: config.tournament.finale.confidence,
		});
		const orderedIds = standings.map((s) => s.id);
		const topK = Math.max(
			1,
			Math.min(config.tournament.stopRules.topK, orderedIds.length),
		);
		const scope = orderedIds.slice(0, topK);

		const sep = adjacentUnseparatedWithMinGap({
			standings,
			scope,
			minSeparation: config.tournament.finale.minSeparation,
		});

		// Count eligible pairs the planner would consider (diagnostic only).
		const repeatCounts = countRepeatPairs(ratingStateFine.history);
		const planned = planActiveRankingBatch(
			{
				standings,
				ratingState: ratingStateFine,
				repeatCounts,
				maxRepeatPairs: effectiveMaxRepeatPairs,
				targetWinProb: config.tournament.finale.targetWinProb,
				scoringMode: config.tournament.scheduling.scoringMode,
			},
			scope,
			9999,
			config.tournament.finale.confidence,
		);

		const detailedMatches: DetailedFinaleMatchV1[] = [];
		const fineJudgmentsBase = hasStructuredLayout
			? join("fine", "judgments")
			: "finale_judgments";
		for (const m of matches) {
			const key = pairKey(m.aId, m.bId);
			const repeats = repeatCounts.get(key) ?? 0;
			const predicted = estimateWinProbability(ratingStateFine, m.aId, m.bId);
			const detailed: DetailedFinaleMatchV1 = {
				...m,
				judgmentFile: finaleJudgmentPath(
					m.iteration,
					m.aId,
					m.bId,
					fineJudgmentsBase,
				),
				repeatCountBefore: repeats,
				predictedWinProbBefore: predicted,
				revisionPathA: join("revisions", `${m.aId}.md`),
				revisionPathB: join("revisions", `${m.bId}.md`),
			};
			detailedMatches.push(detailed);

			applyPairwiseBatch(ratingStateFine, [
				{
					aId: m.aId,
					bId: m.bId,
					scoreA: m.scoreA,
					scoreB: m.scoreB,
					round: maxRound + m.iteration,
					sourceMatchId: `finale:i${m.iteration}:${key}`,
				},
			]);
		}

		iterations.push({
			iteration,
			scopeTopK: scope,
			adjacentUnseparatedBefore: sep.unseparated,
			plannedPairsEligibleCount: planned.pairs.length,
			matches: detailedMatches,
		});
	}

	return {
		version: 1,
		runDir,
		artifacts: { files },
		coarseRanking: {
			configSnapshot: {
				swissRounds: config.tournament.swissRounds,
				swissFormat,
				swissJudges,
				stopRules: config.tournament.stopRules,
				rating: config.tournament.rating,
				scheduling: config.tournament.scheduling,
			},
			rounds,
			matches: swissMatchesDetailed,
		},
		fineRanking: {
			configSnapshot: {
				finale: config.tournament.finale,
				finaleJudges,
				effectiveMaxRepeatPairs,
			},
			stoppedReason,
			iterations,
		},
	};
}
