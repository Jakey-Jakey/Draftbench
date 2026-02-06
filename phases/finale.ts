import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pairwiseJudge } from "../aiClient";
import { getConfig, getFinaleJudges } from "../config";
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
import { Semaphore } from "../semaphore";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredFinaleMatch,
	saveState,
} from "../state";
import { getShortModelName, requireDefined } from "../utils";
import type { RevisionEntry } from "./revise";

// ============================================================================
// Finale Phase (Active Learning)
// ============================================================================

export interface FinalePhaseResult {
	finaleMatches: StoredFinaleMatch[];
	iterations: number;
	converged: boolean;
}

function fnv1a32(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

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

function confidenceMultiplier(confidence: number): number {
	if (confidence >= 0.99) return 2.58;
	if (confidence >= 0.95) return 1.96;
	if (confidence >= 0.9) return 1.64;
	if (confidence >= 0.8) return 1.28;
	return 1.0;
}

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
 * Phase 6: Active-learning finale.
 * Runs targeted pairwise matches among top-K until adjacent CIs separate.
 */
export async function runFinalePhase(
	runDir: string,
	finaleLogPath: string,
	finaleJudgmentsDir: string,
	state: PipelineState,
	contestants: SwissContestant[],
	revisionsById: Map<string, RevisionEntry>,
	dryRun: boolean,
	_isResuming: boolean,
): Promise<FinalePhaseResult> {
	const config = getConfig();
	const finaleConfig = config.tournament.finale;
	const stopRulesConfig = config.tournament.stopRules;
	const ratingConfig = config.tournament.rating;
	const schedulingConfig = config.tournament.scheduling;
	const FINALE_JUDGES = getFinaleJudges();

	if (!finaleConfig.enabled) {
		console.log("Phase 6/6: Finale disabled; skipping.\n");
		state.finaleMatches = null;
		state.finaleIterations = 0;
		state.finaleConverged = true;
		markPhaseCompleted(state, "finale");
		if (!dryRun) saveState(runDir, state);
		return { finaleMatches: [], iterations: 0, converged: true };
	}

	if (!ratingConfig.enabled) {
		console.warn(
			"  ⚠️ Finale is enabled but rating backend is disabled; skipping finale.",
		);
		state.finaleMatches = null;
		state.finaleIterations = 0;
		state.finaleConverged = false;
		markPhaseCompleted(state, "finale");
		if (!dryRun) saveState(runDir, state);
		return { finaleMatches: [], iterations: 0, converged: false };
	}

	if (FINALE_JUDGES.length === 0) {
		throw new Error("Finale enabled but roles.finaleJudges is empty");
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

	const fileLock = new Semaphore(1);
	const stateLock = new Semaphore(1);

	if (isPhaseCompleted(state, "finale") && converged) {
		// On resume, Swiss phase loads contestants from state, but the stored ratingState
		// may already include finale updates. Sync in-memory contestants so the final
		// leaderboard reflects the latest ratings.
		const standings = getRatingStandingsWithOptions(ratingState, {
			bootstrapCi: false,
			confidence: finaleConfig.confidence,
		});
		syncContestantsWithRatings(contestants, standings);
		console.log("Phase 6/6: Finale already complete, skipping.\n");
		return { finaleMatches: storedMatches, iterations: iteration, converged };
	}

	const judgeLabel = FINALE_JUDGES.map(
		(j) => `${getShortModelName(j.model)} (${j.effort ?? "low"})`,
	).join(", ");
	console.log(
		`Phase 6/6: Active Learning Finale (topK ${stopRulesConfig.topK}, judges: ${judgeLabel})...`,
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
				`  ⚠️ Finale could not plan any eligible pairs (repeat caps?) with ${sep.unseparated.length} unseparated adjacent pair(s) remaining.`,
			);
			converged = false;
			break;
		}

		console.log(
			`  Iteration ${iteration}: running ${planned.pairs.length} matchup(s) (${sep.unseparated.length} adjacent pair(s) still uncertain)`,
		);
		if (!dryRun) {
			await fileLock.acquire();
			try {
				await appendFile(
					finaleLogPath,
					`## Iteration ${iteration}\n\n- Planned matches: ${planned.pairs
						.map(([a, b]) => `${a} vs ${b}`)
						.join(", ")}\n\n`,
					"utf-8",
				);
			} finally {
				fileLock.release();
			}
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
					finaleJudgmentsDir,
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
				await writeFile(judgmentFile, md, "utf-8");
			}

			return match;
		});

		const results = await Promise.all(matchPromises);

		for (const match of results) {
			storedMatches.push(match);

			const observation: PairwiseObservation = {
				aId: match.aId,
				bId: match.bId,
				scoreA: match.scoreA,
				scoreB: match.scoreB,
				round: (state.swissRound ?? 0) + iteration,
				sourceMatchId: `finale:i${iteration}:${pairKey(match.aId, match.bId)}:${
					storedMatches.length
				}`,
			};
			applyPairwiseBatch(ratingState, [observation]);

			if (!dryRun) {
				await fileLock.acquire();
				try {
					const line =
						match.votesA === match.votesB
							? `- ${match.aId} vs ${match.bId}: **DRAW** (${match.votesA}-${match.votesB})\n`
							: `- **${match.votesA > match.votesB ? match.aId : match.bId}** beat ${
									match.votesA > match.votesB ? match.bId : match.aId
								} (${match.votesA}-${match.votesB})\n`;
					await appendFile(finaleLogPath, line, "utf-8");
				} finally {
					fileLock.release();
				}
			}
		}

		// Persist state after each iteration.
		await stateLock.acquire();
		try {
			state.finaleMatches = storedMatches;
			state.finaleIterations = iteration;
			state.finaleConverged = false;
			state.ratingState = serializeRatingState(ratingState);
			state.pairwiseHistory = ratingState.history;
			if (!dryRun) saveState(runDir, state);
		} finally {
			stateLock.release();
		}
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
