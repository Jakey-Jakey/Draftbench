import { join } from "node:path";
import { pairwiseJudge } from "../aiClient";
import type {
	FinaleConfig,
	PipelineConfig,
	RatingConfig,
	RoleEntry,
	SchedulingConfig,
	StopRulesConfig,
} from "../config";
import type { SwissContestant } from "../leaderboard";
import {
	applyPairwiseBatch,
	deserializeRatingState,
	getRatingStandingsWithOptions,
	serializeRatingState,
} from "../rating/engine";
import type { PairwiseObservation } from "../rating/types";
import { planActiveRankingBatch } from "../scheduling/activeRanking";
import { countRepeatPairs, pairKey } from "../scheduling/pairs";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredFinaleMatch,
	saveState,
} from "../state";
import {
	confidenceMultiplier,
	getShortModelName,
	requireDefined,
} from "../utils";
import type { RevisionEntry } from "./revise";

// ============================================================================
// Finale Phase (Active Learning)
// ============================================================================

export interface FinaleOutputConfig {
	mode: "legacy" | "structured";
	/**
	 * Legacy: absolute path to `finale_rounds.md`.
	 * Structured: directory for `iter{n}.md` files.
	 */
	iterationsRoot: string;
	/** Structured-only directory for per-iteration standings snapshots (md + json). */
	standingsDir: string | null;
	/** Directory where per-match judgment Markdown files are written. */
	judgmentsDir: string;
}

export interface FinalePhaseResult {
	finaleMatches: StoredFinaleMatch[];
	iterations: number;
	converged: boolean;
}

export interface FinalePhaseConfig {
	finale: FinaleConfig;
	stopRules: StopRulesConfig;
	rating: RatingConfig;
	scheduling: SchedulingConfig;
	finaleJudges: RoleEntry[];
	prompts: PipelineConfig["prompts"];
}

/**
 * Compute the 32-bit FNV-1a hash of a string.
 *
 * @param input - The string to hash
 * @returns The 32-bit unsigned FNV-1a hash (0 through 2^32−1)
 */
function fnv1a32(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/**
 * Creates a deterministic pseudo-random number generator seeded by `seed`.
 *
 * @param seed - Initial numeric seed used to initialize the generator
 * @returns A function that, when called, returns a pseudo-random number in the range [0, 1)
 */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Determines whether every adjacent pair of contestants in `scope` is separated by at least `minSeparation`
 * when accounting for confidence-adjusted rating intervals.
 *
 * Checks adjacent IDs in `scope` (in order) against `standings` and identifies pairs whose confidence-adjusted
 * rating intervals overlap or fail to meet the minimum gap.
 *
 * @param standings - Array of contestant standings with `id`, `rating`, and `uncertainty`
 * @param scope - Ordered list of contestant IDs to examine (adjacency is determined by list order)
 * @param confidence - Confidence level (0-1) used to inflate uncertainty when computing intervals
 * @param minSeparation - Absolute rating gap required between adjacent contestants to be considered separated;
 *                        if greater than zero, a raw rating gap meeting or exceeding this value is treated as separated
 * @returns `true` if all adjacent pairs in `scope` are separated according to the confidence-adjusted intervals and `minSeparation`, `false` otherwise; also returns an array of adjacent ID pairs that are not separated
 */
function allAdjacentSeparatedWithMinGap(args: {
	standings: { id: string; rating: number; uncertainty: number }[];
	scope: string[];
	confidence: number;
	minSeparation: number;
}): { separated: boolean; unseparated: [string, string][] } {
	const { standings, scope, confidence, minSeparation } = args;
	if (scope.length < 2) return { separated: true, unseparated: [] };

	const z = confidenceMultiplier(confidence);
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
		if (minSeparation > 0 && gap >= minSeparation) continue;

		const leftLow = left.rating - z * left.uncertainty;
		const rightHigh = right.rating + z * right.uncertainty;
		if (!(leftLow > rightHigh)) {
			unseparated.push([leftId, rightId]);
		}
	}

	return { separated: unseparated.length === 0, unseparated };
}

/**
 * Update each SwissContestant in-place with rating, uncertainty, and CI bounds taken from the provided standings.
 *
 * Matches contestants to standings by `id`; contestants without a matching standing are left unchanged.
 *
 * @param contestants - Array of contestants to update
 * @param standings - Array of standing records containing `id`, `rating`, `uncertainty`, `ciLow`, and `ciHigh`
 */
function syncContestantsWithRatings(
	contestants: SwissContestant[],
	standings: {
		id: string;
		rating: number;
		uncertainty: number;
		ciLow: number;
		ciHigh: number;
	}[],
): void {
	const byId = new Map(standings.map((s) => [s.id, s] as const));
	for (const contestant of contestants) {
		const rating = byId.get(contestant.id);
		if (!rating) continue;
		contestant.rating = rating.rating;
		contestant.ratingUncertainty = rating.uncertainty;
		contestant.ratingCiLow = rating.ciLow;
		contestant.ratingCiHigh = rating.ciHigh;
	}
}

/**
 * Orchestrates the active-learning finale by running targeted pairwise matches among the top-K contestants until adjacent confidence intervals separate or the match budget is exhausted.
 *
 * @param runDir - Path to the current run directory where pipeline state is stored
 * @param output - Output layout config (legacy vs structured fine ranking directories)
 * @param state - PipelineState object to read and persist finale progress and rating state
 * @param contestants - Mutable list of SwissContestant entries to synchronize final ratings into for leaderboard display
 * @param revisionsById - Map from contestant/revision ID to RevisionEntry used to obtain texts for pairwise judging
 * @param dryRun - If true, run deterministic simulated judging without calling external judges or persisting state
 * @param _isResuming - Internal flag indicating resume mode (unused directly by external callers)
 * @returns FinalePhaseResult containing the stored finale matches, the number of iterations performed, and whether the finale converged
 */
export async function runFinalePhase(
	runDir: string,
	output: FinaleOutputConfig,
	state: PipelineState,
	finalePhaseConfig: FinalePhaseConfig,
	contestants: SwissContestant[],
	revisionsById: Map<string, RevisionEntry>,
	dryRun: boolean,
	_isResuming: boolean,
): Promise<FinalePhaseResult> {
	const finaleConfig = finalePhaseConfig.finale;
	const stopRulesConfig = finalePhaseConfig.stopRules;
	const ratingConfig = finalePhaseConfig.rating;
	const schedulingConfig = finalePhaseConfig.scheduling;
	const FINALE_JUDGES = finalePhaseConfig.finaleJudges;

	if (!finaleConfig.enabled) {
		console.log("Phase 6/6: Fine ranking disabled; skipping.\n");
		state.finaleMatches = null;
		state.finaleIterations = 0;
		state.finaleConverged = true;
		markPhaseCompleted(state, "finale");
		if (!dryRun) saveState(runDir, state);
		return { finaleMatches: [], iterations: 0, converged: true };
	}

	if (!ratingConfig.enabled) {
		console.warn(
			"  ⚠️ Fine ranking is enabled but rating backend is disabled; skipping fine ranking.",
		);
		state.finaleMatches = null;
		state.finaleIterations = 0;
		state.finaleConverged = false;
		markPhaseCompleted(state, "finale");
		if (!dryRun) saveState(runDir, state);
		return { finaleMatches: [], iterations: 0, converged: false };
	}

	if (FINALE_JUDGES.length === 0) {
		throw new Error(
			"Fine ranking enabled but roles.fineJudges (aka roles.finaleJudges) is empty",
		);
	}

	const storedMatches: StoredFinaleMatch[] = state.finaleMatches
		? [...state.finaleMatches]
		: [];
	let iteration = state.finaleIterations ?? 0;
	let converged = state.finaleConverged ?? false;

	const ratingStateStored = requireDefined(
		state.ratingState,
		"Missing ratingState in pipeline state; Swiss phase should have initialized it.",
	);
	const ratingState = deserializeRatingState(ratingStateStored);
	const isStructured = output.mode === "structured";

	if (isPhaseCompleted(state, "finale")) {
		// On resume, Swiss phase loads contestants from state, but the stored ratingState
		// may already include finale updates. Sync in-memory contestants so the final
		// leaderboard reflects the latest ratings.
		const standings95 = getRatingStandingsWithOptions(ratingState, {
			bootstrapCi: true,
			confidence: 0.95,
		});
		syncContestantsWithRatings(contestants, standings95);
		console.log(
			`Phase 6/6: Fine ranking already complete (resumed), skipping. (converged: ${converged ? "yes" : "no"})\n`,
		);
		return { finaleMatches: storedMatches, iterations: iteration, converged };
	}

	const judgeLabel = FINALE_JUDGES.map(
		(j) => `${getShortModelName(j.model)} (${j.effort ?? "high"})`,
	).join(", ");
	console.log(
		`Phase 6/6: Fine Ranking (Top-K refinement matches; active learning) (topK ${stopRulesConfig.topK}, judges: ${judgeLabel})...`,
	);
	console.log(
		`  Budget: max ${finaleConfig.maxTotalMatches} matches, batch size ${finaleConfig.maxMatchesPerBatch}`,
	);

	while (storedMatches.length < finaleConfig.maxTotalMatches) {
		iteration += 1;

		const standings = getRatingStandingsWithOptions(ratingState, {
			bootstrapCi: false,
			confidence: finaleConfig.confidence,
		});
		const orderedIds = standings.map((s) => s.id);
		const topK = Math.max(1, Math.min(stopRulesConfig.topK, orderedIds.length));
		const scope = orderedIds.slice(0, topK);

		const sep = allAdjacentSeparatedWithMinGap({
			standings,
			scope,
			confidence: finaleConfig.confidence,
			minSeparation: finaleConfig.minSeparation,
		});
		const unseparatedBefore = sep.unseparated.length;
		if (sep.separated) {
			converged = true;
			break;
		}

		const repeatCounts = countRepeatPairs(ratingState.history);
		const maxRepeatPairs = finaleConfig.allowOverRepeatCap
			? Number.MAX_SAFE_INTEGER
			: schedulingConfig.maxRepeatPairs;
		const planned = planActiveRankingBatch(
			{
				standings,
				ratingState,
				repeatCounts,
				maxRepeatPairs,
				targetWinProb: finaleConfig.targetWinProb,
				scoringMode: schedulingConfig.scoringMode ?? "heuristic",
			},
			scope,
			Math.min(
				finaleConfig.maxMatchesPerBatch,
				finaleConfig.maxTotalMatches - storedMatches.length,
			),
			finaleConfig.confidence,
		);

		if (planned.pairs.length === 0) {
			console.warn(
				`  ⚠️ Fine ranking could not plan any eligible pairs (repeat caps?) with ${sep.unseparated.length} unseparated adjacent pair(s) remaining.`,
			);
			converged = false;
			break;
		}

		console.log(
			`  Iteration ${iteration}: running ${planned.pairs.length} matchup(s) (${sep.unseparated.length} adjacent pair(s) still uncertain)`,
		);
		const plannedPairsLabel = planned.pairs
			.map(([a, b]) => `${a} vs ${b}`)
			.join(", ");
		let iterationLogMd = "";
		if (!dryRun) {
			iterationLogMd += isStructured
				? `# Fine Ranking - Iteration ${iteration}\n\n## Planned matches\n\n${planned.pairs
						.map(([a, b]) => `- ${a} vs ${b}\n`)
						.join("")}\n`
				: `## Iteration ${iteration}\n\n- Planned matches: ${plannedPairsLabel}\n\n`;
		}
		if (!dryRun && isStructured) {
			iterationLogMd += "## Results\n\n";
		}

		const matchPromises = planned.pairs.map(async ([idA, idB], index) => {
			const revisionA = revisionsById.get(idA);
			const revisionB = revisionsById.get(idB);
			if (!revisionA || !revisionB) {
				throw new Error(
					`Missing revision for finale match: ${!revisionA ? idA : idB}`,
				);
			}
			const textA = revisionA.result.text;
			const textB = revisionB.result.text;

			const rng = mulberry32(
				fnv1a32(
					`finale|i${iteration}|${pairKey(idA, idB)}|${storedMatches.length}|${index}`,
				),
			);
			const swapped = rng() > 0.5;
			const [firstId, secondId] = swapped ? [idB, idA] : [idA, idB];
			const [firstText, secondText] = swapped ? [textB, textA] : [textA, textB];

			let votesA = 0;
			let votesB = 0;
			let isDraw = false;

			if (dryRun) {
				// Deterministic-ish mock: jitter around 50/50.
				for (let j = 0; j < FINALE_JUDGES.length; j++) {
					const pickFirst = rng() > 0.5;
					const winner = pickFirst ? firstId : secondId;
					if (winner === idA) votesA += 1;
					else votesB += 1;
				}
				isDraw = votesA === votesB;
			} else {
				const judgeResults = await Promise.all(
					FINALE_JUDGES.map((judge) =>
						pairwiseJudge(
							"S1",
							firstText,
							"S2",
							secondText,
							judge.model,
							judge.effort ?? "high",
							judge.temperature,
							finalePhaseConfig.prompts,
						),
					),
				);
				for (const result of judgeResults) {
					const resolvedWinner = result.winner === "S1" ? firstId : secondId;
					if (resolvedWinner === idA) votesA += 1;
					else votesB += 1;
				}
				isDraw = votesA === votesB;
			}

			const totalVotes = Math.max(1, votesA + votesB);
			const scoreA = isDraw ? ratingConfig.tieValue : votesA / totalVotes;
			const scoreB = isDraw ? ratingConfig.tieValue : 1 - scoreA;

			const match: StoredFinaleMatch = {
				iteration,
				aId: idA,
				bId: idB,
				scoreA,
				scoreB,
				votesA,
				votesB,
				judges: FINALE_JUDGES.map((j) => j.model),
			};

			const safeKey = `${idA}__vs__${idB}`.replaceAll("/", "_");
			if (!dryRun) {
				const judgmentFile = join(
					output.judgmentsDir,
					`iter_${iteration}_${safeKey}.md`,
				);
				let md = `# Finale Match (Iteration ${iteration})\n\n`;
				md += `- A: ${idA}\n`;
				md += `- B: ${idB}\n\n`;
				md += `## Judges\n\n`;
				for (const judge of FINALE_JUDGES) {
					md += `- ${judge.model} (${judge.effort ?? "high"})\n`;
				}
				md += "\n## Votes\n\n";
				md += `- ${idA}: ${votesA}\n`;
				md += `- ${idB}: ${votesB}\n`;
				md += `- Result: ${isDraw ? "DRAW" : votesA > votesB ? idA : idB}\n`;
				await Bun.write(judgmentFile, md);
			}

			return match;
		});

		const results = await Promise.all(matchPromises);

		const ratingsBeforeIteration = new Map<string, number>();
		for (const match of results) {
			const ratingBeforeA = ratingState.records.get(match.aId)?.rating;
			const ratingBeforeB = ratingState.records.get(match.bId)?.rating;
			if (ratingBeforeA !== undefined) {
				ratingsBeforeIteration.set(match.aId, ratingBeforeA);
			}
			if (ratingBeforeB !== undefined) {
				ratingsBeforeIteration.set(match.bId, ratingBeforeB);
			}
		}

		const batchStartIndex = storedMatches.length;
		const observations: PairwiseObservation[] = results.map((match, index) => ({
			aId: match.aId,
			bId: match.bId,
			scoreA: match.scoreA,
			scoreB: match.scoreB,
			round: (state.swissRound ?? 0) + iteration,
			sourceMatchId: `finale:i${iteration}:${pairKey(match.aId, match.bId)}:${
				batchStartIndex + index + 1
			}`,
		}));

		storedMatches.push(...results);
		applyPairwiseBatch(ratingState, observations);

		const iterationDeltas: string[] = [];
		const deltaIds = new Set<string>();
		for (const match of results) {
			const winner =
				match.votesA === match.votesB
					? "DRAW"
					: match.votesA > match.votesB
						? match.aId
						: match.bId;

			console.log(
				`    ✓ ${match.aId} vs ${match.bId}: ${winner} (${match.votesA}-${match.votesB})`,
			);

			if (!dryRun) {
				const line =
					match.votesA === match.votesB
						? `- ${match.aId} vs ${match.bId}: **DRAW** (${match.votesA}-${match.votesB})\n`
						: `- **${match.votesA > match.votesB ? match.aId : match.bId}** beat ${
								match.votesA > match.votesB ? match.bId : match.aId
							} (${match.votesA}-${match.votesB})\n`;
				iterationLogMd += line;
			}

			for (const contestantId of [match.aId, match.bId]) {
				if (deltaIds.has(contestantId)) continue;
				deltaIds.add(contestantId);
				const ratingBefore = ratingsBeforeIteration.get(contestantId);
				const ratingAfter = ratingState.records.get(contestantId)?.rating;
				if (ratingBefore === undefined || ratingAfter === undefined) continue;
				const delta = ratingAfter - ratingBefore;
				iterationDeltas.push(
					`${contestantId}: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`,
				);
			}
		}

		if (iterationDeltas.length > 0) {
			console.log(`    Δ iteration ratings: ${iterationDeltas.join(", ")}`);
			if (!dryRun) {
				const deltaLine = `- Rating deltas: ${iterationDeltas.join(", ")}\n`;
				iterationLogMd += isStructured
					? `\n## Rating deltas\n\n${deltaLine}`
					: `${deltaLine}\n`;
			}
		}

		const standingsAfter = getRatingStandingsWithOptions(ratingState, {
			bootstrapCi: false,
			confidence: finaleConfig.confidence,
		});
		const orderedAfter = standingsAfter.map((s) => s.id);
		const scopeAfter = orderedAfter.slice(0, topK);
		const sepAfter = allAdjacentSeparatedWithMinGap({
			standings: standingsAfter,
			scope: scopeAfter,
			confidence: finaleConfig.confidence,
			minSeparation: finaleConfig.minSeparation,
		});
		const unseparatedAfter = sepAfter.unseparated.length;
		console.log(
			`    🔎 Adjacent uncertain in top ${topK}: ${unseparatedBefore} -> ${unseparatedAfter}`,
		);

		if (!dryRun) {
			if (isStructured) {
				iterationLogMd += `\n## Convergence\n\n- Adjacent uncertain (top ${topK}): ${unseparatedBefore} -> ${unseparatedAfter}\n`;
			} else {
				iterationLogMd += `\n- Adjacent uncertain (top ${topK}): ${unseparatedBefore} -> ${unseparatedAfter}\n`;
			}

			if (isStructured && output.standingsDir) {
				const top = standingsAfter.slice(
					0,
					Math.min(topK, standingsAfter.length),
				);
				const mdLines: string[] = [];
				mdLines.push(`# Fine Standings - Iteration ${iteration}\n`);
				mdLines.push(`| # | id | rating | unc |\n|---:|---|---:|---:|\n`);
				for (let i = 0; i < top.length; i++) {
					const entry = top[i];
					if (!entry) continue;
					mdLines.push(
						`| ${i + 1} | ${entry.id} | ${entry.rating.toFixed(1)} | ${entry.uncertainty.toFixed(1)} |\n`,
					);
				}
				await Bun.write(
					join(output.standingsDir, `iter${iteration}.md`),
					mdLines.join(""),
				);
				await Bun.write(
					join(output.standingsDir, `iter${iteration}.json`),
					JSON.stringify(
						{
							iteration,
							topK,
							standings: standingsAfter.map((s) => ({
								id: s.id,
								rating: s.rating,
								uncertainty: s.uncertainty,
							})),
							unseparatedAdjacentPairs: sepAfter.unseparated,
						},
						null,
						2,
					),
				);
			}

			if (isStructured) {
				const iterPath = join(output.iterationsRoot, `iter${iteration}.md`);
				await Bun.write(iterPath, iterationLogMd);
			} else {
				const file = Bun.file(output.iterationsRoot);
				const existing = (await file.exists()) ? await file.text() : "";
				await Bun.write(
					output.iterationsRoot,
					`${existing}${iterationLogMd}\n`,
				);
			}
		}

		// Persist state after each iteration.
		state.finaleMatches = storedMatches;
		state.finaleIterations = iteration;
		state.finaleConverged = false;
		state.ratingState = serializeRatingState(ratingState);
		state.pairwiseHistory = ratingState.history;
		if (!dryRun) saveState(runDir, state);
	}

	// If we stopped due to budget, we may have achieved separation on the final batch.
	// Re-check convergence on the final rating state.
	if (!converged) {
		const standings = getRatingStandingsWithOptions(ratingState, {
			bootstrapCi: false,
			confidence: finaleConfig.confidence,
		});
		const orderedIds = standings.map((s) => s.id);
		const topK = Math.max(1, Math.min(stopRulesConfig.topK, orderedIds.length));
		const scope = orderedIds.slice(0, topK);
		const sep = allAdjacentSeparatedWithMinGap({
			standings,
			scope,
			confidence: finaleConfig.confidence,
			minSeparation: finaleConfig.minSeparation,
		});
		converged = sep.separated;
	}

	// Final sync: compute a consistent CI for display (95% by default for leaderboard).
	const finalStandings = getRatingStandingsWithOptions(ratingState, {
		bootstrapCi: true,
		confidence: 0.95,
	});
	syncContestantsWithRatings(contestants, finalStandings);

	state.finaleMatches = storedMatches;
	state.finaleIterations = iteration;
	state.finaleConverged = converged;
	state.ratingState = serializeRatingState(ratingState);
	state.pairwiseHistory = ratingState.history;
	markPhaseCompleted(state, "finale");
	if (!dryRun) saveState(runDir, state);

	console.log(
		`  ${converged ? "✓" : "⏹"} Finale ${
			converged ? "converged" : "stopped"
		} after ${storedMatches.length} match(es)\n`,
	);

	return { finaleMatches: storedMatches, iterations: iteration, converged };
}
