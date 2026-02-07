import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pairwiseJudge, threeWayJudge } from "../aiClient";
import { getConfig, getSwissJudges } from "../config";
import type { SwissContestant, SwissMatch } from "../leaderboard";
import { pairwiseFromSwissMatch } from "../rating/convert";
import {
	applyPairwiseBatch,
	createRatingState,
	deserializeRatingState,
	getRatingStandings,
	getRatingStandingsWithOptions,
	serializeRatingState,
} from "../rating/engine";
import type { PairwiseObservation, RatingState } from "../rating/types";
import { scheduleAdaptivePairs } from "../scheduling/adaptive";
import { evaluateStopRules } from "../scheduling/stopRules";
import { Semaphore } from "../semaphore";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredSwissContestant,
	type StoredSwissMatch,
	saveState,
} from "../state";
import { getShortModelName, requireDefined, shuffleArray } from "../utils";
import type { RevisionEntry } from "./revise";

// ============================================================================
// Swiss Tournament Types & Logic
// ============================================================================

export interface SwissPhaseResult {
	contestants: SwissContestant[];
	matches: SwissMatch[];
	ratingState: RatingState | null;
}

/**
 * Generates Swiss pairings for 1v1v1 (groups of 3).
 * Sorts by points (descending), then forms groups of 3.
 * Avoids grouping contestants who have already faced each other when possible.
 */
export function generateSwissTriples(
	contestants: SwissContestant[],
	_round: number,
): { triples: [string, string, string][] } {
	// Sort by points descending
	const sorted = [...contestants].sort((a, b) => b.points - a.points);
	const triples: [string, string, string][] = [];
	const used = new Set<string>();

	// Form groups of 3 from similar point brackets
	while (used.size < sorted.length) {
		const available = sorted.filter((c) => !used.has(c.id));
		if (available.length < 3) break;

		// Take the top available contestant
		const first = requireDefined(
			available[0],
			"Missing first contestant for Swiss triple",
		);
		used.add(first.id);

		// Find best 2nd: closest in points, hasn't faced first
		let secondIdx = -1;
		for (let i = 1; i < available.length; i++) {
			const candidate = available[i];
			if (!candidate) continue;
			if (!first.opponents.has(candidate.id)) {
				secondIdx = i;
				break;
			}
		}
		if (secondIdx === -1) secondIdx = 1;
		const second = requireDefined(
			available[secondIdx],
			"Missing second contestant for Swiss triple",
		);
		used.add(second.id);

		// Find best 3rd: closest in points, hasn't faced first or second
		let thirdIdx = -1;
		for (let i = 1; i < available.length; i++) {
			const candidate = available[i];
			if (!candidate || candidate.id === second.id) continue;
			if (
				!first.opponents.has(candidate.id) &&
				!second.opponents.has(candidate.id)
			) {
				thirdIdx = i;
				break;
			}
		}
		if (thirdIdx === -1) {
			for (let i = 1; i < available.length; i++) {
				const candidate = available[i];
				if (candidate && candidate.id !== second.id) {
					thirdIdx = i;
					break;
				}
			}
		}
		const third = requireDefined(
			available[thirdIdx],
			"Missing third contestant for Swiss triple",
		);
		used.add(third.id);

		triples.push([first.id, second.id, third.id]);
	}

	return { triples };
}

/**
 * Generates Swiss pairings for 1v1 (pairs of 2).
 * Sorts by points (descending), then forms pairs.
 * Avoids pairing contestants who have already faced each other.
 */
export function generateSwissPairs(contestants: SwissContestant[]): {
	pairs: [string, string][];
	bye: string | null;
} {
	const sorted = [...contestants].sort((a, b) => b.points - a.points);
	const pairs: [string, string][] = [];
	const used = new Set<string>();

	while (used.size < sorted.length - 1) {
		const available = sorted.filter((c) => !used.has(c.id));
		if (available.length < 2) break;

		const first = requireDefined(
			available[0],
			"Missing first contestant for Swiss pair",
		);
		used.add(first.id);

		// Find opponent who hasn't faced first
		let secondIdx = -1;
		for (let i = 1; i < available.length; i++) {
			const candidate = available[i];
			if (!candidate) continue;
			if (!first.opponents.has(candidate.id)) {
				secondIdx = i;
				break;
			}
		}
		if (secondIdx === -1) secondIdx = 1;
		const second = requireDefined(
			available[secondIdx],
			"Missing second contestant for Swiss pair",
		);
		used.add(second.id);

		pairs.push([first.id, second.id]);
	}

	const remaining = sorted.filter((c) => !used.has(c.id));
	const bye = remaining.length === 1 && remaining[0] ? remaining[0].id : null;

	return { pairs, bye };
}

function serializeContestants(
	contestants: SwissContestant[],
): StoredSwissContestant[] {
	return contestants.map((c) => ({
		id: c.id,
		points: c.points,
		opponents: Array.from(c.opponents),
		placements: {
			first: c.placements.first,
			second: c.placements.second,
			third: c.placements.third,
			ties: c.placements.ties ?? 0,
		},
		wins: c.wins ?? 0,
		losses: c.losses ?? 0,
		draws: c.draws ?? 0,
		rating: c.rating,
		ratingUncertainty: c.ratingUncertainty,
		ratingCiLow: c.ratingCiLow,
		ratingCiHigh: c.ratingCiHigh,
	}));
}

function getSharedPoints(match: SwissMatch): Record<string, number> {
	if (match.sharedPoints) {
		return match.sharedPoints;
	}

	return {
		[match.first]: 2,
		[match.second]: 1,
		[match.third]: 0,
	};
}

export function applyThreeWaySwissMatch(
	contestants: SwissContestant[],
	match: SwissMatch,
): void {
	const first = contestants.find((c) => c.id === match.first);
	const second = contestants.find((c) => c.id === match.second);
	const third = contestants.find((c) => c.id === match.third);

	if (!first || !second || !third) return;

	const sharedPoints = getSharedPoints(match);
	first.points += sharedPoints[first.id] ?? 0;
	second.points += sharedPoints[second.id] ?? 0;
	third.points += sharedPoints[third.id] ?? 0;

	const tieGroup = match.tieGroup ?? "none";
	if (tieGroup === "none") {
		first.placements.first++;
		second.placements.second++;
		third.placements.third++;
	} else if (tieGroup === "top2") {
		first.placements.ties = (first.placements.ties ?? 0) + 1;
		second.placements.ties = (second.placements.ties ?? 0) + 1;
		third.placements.third++;
	} else if (tieGroup === "bottom2") {
		first.placements.first++;
		second.placements.ties = (second.placements.ties ?? 0) + 1;
		third.placements.ties = (third.placements.ties ?? 0) + 1;
	} else {
		first.placements.ties = (first.placements.ties ?? 0) + 1;
		second.placements.ties = (second.placements.ties ?? 0) + 1;
		third.placements.ties = (third.placements.ties ?? 0) + 1;
	}

	first.opponents.add(second.id);
	first.opponents.add(third.id);
	second.opponents.add(first.id);
	second.opponents.add(third.id);
	third.opponents.add(first.id);
	third.opponents.add(second.id);
}

/**
 * Update each contestant's rating and related fields from the provided rating state standings.
 *
 * When `options.bootstrapCi` is true, standings are computed with bootstrap confidence intervals; when
 * `options.confidence` is provided it overrides the default confidence level used to compute standings.
 *
 * @param contestants - Contestants whose `rating`, `ratingUncertainty`, `ratingCiLow`, and `ratingCiHigh` fields will be updated when present in the standings
 * @param ratingState - Rating state used to derive current standings and rating values
 * @param options - Optional behavior flags:
 *   - `bootstrapCi`: compute bootstrap confidence intervals for standings
 *   - `confidence`: numeric confidence level to use when computing intervals (overrides default)
 * @returns The list of contestant IDs ordered by the computed standings
 */
function syncContestantsWithRatings(
	contestants: SwissContestant[],
	ratingState: RatingState,
	options?: { bootstrapCi?: boolean; confidence?: number },
): string[] {
	const confidence =
		options?.confidence ?? (options?.bootstrapCi === true ? 0.95 : undefined);
	const standings =
		options?.bootstrapCi === true
			? getRatingStandingsWithOptions(ratingState, {
					bootstrapCi: true,
					confidence,
				})
			: confidence !== undefined
				? getRatingStandingsWithOptions(ratingState, { confidence })
				: getRatingStandings(ratingState);
	const byId = new Map(standings.map((entry) => [entry.id, entry]));
	for (const contestant of contestants) {
		const rating = byId.get(contestant.id);
		if (!rating) continue;
		contestant.rating = rating.rating;
		contestant.ratingUncertainty = rating.uncertainty;
		contestant.ratingCiLow = rating.ciLow;
		contestant.ratingCiHigh = rating.ciHigh;
	}
	return standings.map((entry) => entry.id);
}

/**
 * Count how many judge calls will be made for a set of Swiss matches.
 *
 * @param matches - The Swiss matches to count; matches containing the ID `"BYE"` are ignored
 * @param judgeCount - Number of judges assigned per judged match
 * @returns The total number of judge calls (judged matches multiplied by `judgeCount`)
 */
function countSwissJudgeCalls(
	matches: SwissMatch[],
	judgeCount: number,
): number {
	let judgedMatches = 0;
	for (const match of matches) {
		// Byes do not trigger judge calls.
		if (match.ids.includes("BYE")) continue;
		judgedMatches += 1;
	}
	return judgedMatches * judgeCount;
}

// ============================================================================
	// Swiss Phase
	// ============================================================================

export interface SwissOutputConfig {
	mode: "legacy" | "structured";
	/**
	 * Legacy: absolute path to `swiss_rounds.md`.
	 * Structured: directory for `round{n}.md` files.
	 */
	roundsRoot: string;
	/** Structured-only directory for per-round standings snapshots (md + json). */
	standingsDir: string | null;
	/** Directory for per-match judgment Markdown files. */
	judgmentsDir: string;
}

/**
 * Execute the Swiss tournament phase (supports 1v1 or 1v1v1 formats), run judges, update contestants and ratings, and persist interim/final state.
 *
 * Runs up to the configured number of Swiss rounds (or until stop rules trigger), schedules matches (static or adaptive), invokes judges (or simulates outcomes in dry-run), applies match results to contestant standings and rating state, writes judgment artifacts and logs, and saves pipeline state after each round and at completion.
 *
 * @param runDir - Filesystem directory used for saving pipeline state and artifacts
 * @param output - Output layout config (legacy vs structured coarse ranking directories)
 * @param state - Current pipeline state that will be read and updated (persisted between rounds)
 * @param revisionsById - Map of contestant revision data; revision text for each scheduled contestant must be present
 * @param dryRun - If true, simulate judgments and avoid external API side effects or final persistence
 * @param isResuming - If true, attempt to resume from existing state.swissRound / state.swissMatches when present
 * @returns The final in-memory Swiss phase result containing updated contestants, all recorded matches, and the current rating state (or null if ratings are disabled)
 * @throws Error if a scheduled match references a contestant whose revision text is missing
 */
export async function runSwissPhase(
	runDir: string,
	output: SwissOutputConfig,
	state: PipelineState,
	revisionsById: Map<string, RevisionEntry>,
	dryRun: boolean,
	isResuming: boolean,
): Promise<SwissPhaseResult> {
	const config = getConfig();
	const SWISS_ROUNDS = config.tournament.swissRounds;
	const SWISS_JUDGES = getSwissJudges();
	const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
	const ratingConfig = config.tournament.rating;
	const schedulingConfig = config.tournament.scheduling;
	const stopRulesConfig = config.tournament.stopRules;
	const judgeLabel = SWISS_JUDGES.map(
		(j) => `${getShortModelName(j.model)} (${j.effort ?? "low"})`,
	).join(", ");

	console.log(
		`Phase 5/6: Coarse Ranking (Swiss rounds) (${SWISS_ROUNDS} rounds, ${SWISS_FORMAT} format, judges: ${judgeLabel})...`,
	);
		if (schedulingConfig.mode === "adaptive" && !ratingConfig.enabled) {
			console.warn(
				"  ⚠️ Adaptive scheduling requested without rating backend; falling back to static Swiss pairing.",
			);
		}
		if (stopRulesConfig.enabled && !ratingConfig.enabled) {
			console.warn(
				"  ⚠️ Stop rules enabled without rating backend; stop rules will be ignored.",
			);
		}

		const isStructured = output.mode === "structured";

		const writeRoundLog = async (round: number, bodyMd: string) => {
			if (dryRun) return;
			if (isStructured) {
				const roundPath = join(output.roundsRoot, `round${round}.md`);
				const md = `# Coarse Ranking (Swiss rounds) - Round ${round}\n\n${bodyMd}`;
				await writeFile(roundPath, md, "utf-8");
				return;
			}

			// Legacy mode appends to a single `swiss_rounds.md`.
			await appendFile(output.roundsRoot, `## Round ${round}\n\n${bodyMd}\n`, "utf-8");
		};

		const hasSwissProgress =
			isResuming &&
			(state.swissRound ?? 0) > 0 &&
			state.contestants &&
			state.swissMatches.length > 0;
	const swissAlreadyCompleted =
		hasSwissProgress &&
		isPhaseCompleted(state, "swiss") &&
		state.swissRound >= 1;

	// Initialize contestants
	const contestants: SwissContestant[] = hasSwissProgress
		? (state.contestants as StoredSwissContestant[]).map((c) => ({
				id: c.id,
				text: revisionsById.get(c.id)?.result.text ?? "",
				points: c.points,
				opponents: new Set(c.opponents),
				placements: {
					first: c.placements.first,
					second: c.placements.second,
					third: c.placements.third,
					ties: c.placements.ties ?? 0,
				},
				wins: c.wins ?? 0,
				losses: c.losses ?? 0,
				draws: c.draws ?? 0,
				rating: c.rating,
				ratingUncertainty: c.ratingUncertainty,
				ratingCiLow: c.ratingCiLow,
				ratingCiHigh: c.ratingCiHigh,
			}))
		: Array.from(revisionsById.entries()).map(([id, data]) => ({
				id,
				text: data.result.text,
				points: 0,
				opponents: new Set<string>(),
				placements: { first: 0, second: 0, third: 0, ties: 0 },
				wins: 0,
				losses: 0,
				draws: 0,
				rating: undefined,
				ratingUncertainty: undefined,
				ratingCiLow: undefined,
				ratingCiHigh: undefined,
			}));

	const allSwissMatches: SwissMatch[] = hasSwissProgress
		? [...(state.swissMatches as StoredSwissMatch[])]
		: [];
	const pairwiseHistory: PairwiseObservation[] =
		hasSwissProgress && (state.pairwiseHistory?.length ?? 0) > 0
			? [...(state.pairwiseHistory ?? [])]
			: [];
	const topKHistory: string[][] =
		hasSwissProgress && (state.topKHistory?.length ?? 0) > 0
			? [...(state.topKHistory ?? [])]
			: [];
	let ratingState: RatingState | null = null;
	if (ratingConfig.enabled) {
		if (hasSwissProgress && state.ratingState) {
			ratingState = deserializeRatingState(state.ratingState);
		} else {
			ratingState = createRatingState(
				contestants.map((c) => c.id),
				ratingConfig,
			);
			syncContestantsWithRatings(contestants, ratingState);
		}
	}

	if (swissAlreadyCompleted) {
		console.log(
			`  ↩︎ Loaded coarse ranking state (Swiss) with ${contestants.length} contestants; skipping rounds\n`,
		);
		// Ensure downstream phases (e.g., finale) can run in dry-run without relying on disk state.
		state.ratingState = ratingState ? serializeRatingState(ratingState) : null;
		return { contestants, matches: allSwissMatches, ratingState };
	}
	const startRound = hasSwissProgress ? state.swissRound + 1 : 1;
	let lastCompletedRound = hasSwissProgress ? state.swissRound : 0;
	let stopReason = state.swissStopReason ?? null;
	if (hasSwissProgress) {
		console.log(
			`  ↩︎ Loaded coarse ranking progress (Swiss) through round ${state.swissRound}; resuming at round ${startRound}`,
		);
	}

	// Run Swiss rounds
	for (let round = startRound; round <= SWISS_ROUNDS; round++) {
		console.log(`  Round ${round}/${SWISS_ROUNDS}...`);
		const ratingsBeforeRound = ratingState
			? new Map(
					Array.from(ratingState.records.values()).map((r) => [r.id, r.rating]),
				)
			: null;
		let roundLogBody = "";

		if (SWISS_FORMAT === "1v1") {
			// === 1v1 PAIRWISE FORMAT ===
			let pairs: [string, string][];
			let bye: string | null;
			const byeIds = new Set<string>();
			if (schedulingConfig.mode === "adaptive" && ratingState) {
				const scheduled = scheduleAdaptivePairs(
					contestants,
					ratingState,
					pairwiseHistory,
					{
						exploration: schedulingConfig.exploration,
						avoidRepeatPenalty: schedulingConfig.avoidRepeatPenalty,
						maxRepeatPairs: schedulingConfig.maxRepeatPairs,
						randomSeed: round * 9_973,
					},
				);
				pairs = scheduled.pairs;
				bye = scheduled.bye;
				if (bye) byeIds.add(bye);
				for (const id of scheduled.unpairedIds ?? []) byeIds.add(id);
				if ((scheduled.unpairedIds ?? []).length > 0) {
					console.warn(
						`    ⚠️ Adaptive scheduler could not legally pair ${(scheduled.unpairedIds ?? []).length} contestant(s) without exceeding tournament.scheduling.maxRepeatPairs. Treating them as byes. Consider increasing maxRepeatPairs to reduce byes.`,
					);
				}
			} else {
				const scheduled = generateSwissPairs(contestants);
				pairs = scheduled.pairs;
				bye = scheduled.bye;
				if (bye) byeIds.add(bye);
				}
				const pairPromises = pairs.map(
					async ([idA, idB]): Promise<{ match: SwissMatch; logEntry: string }> => {
						const textA = revisionsById.get(idA)?.result.text;
						const textB = revisionsById.get(idB)?.result.text;
						if (!textA || !textB) {
							throw new Error(
								`Missing revision text for Swiss 1v1 match: ${!textA ? idA : idB}`,
							);
						}
						const entries: [string, string][] = [
							[idA, textA],
							[idB, textB],
						];
						// Shuffle presentation order
						const shuffled = shuffleArray(entries);
						const e1 = requireDefined(
							shuffled[0],
							"Missing shuffled entry 1 for Swiss pair",
						);
						const e2 = requireDefined(
							shuffled[1],
							"Missing shuffled entry 2 for Swiss pair",
						);
	
						let match: SwissMatch;
						let logEntry = "";

					if (dryRun) {
						// Mock
						const winnerId = idA;
						const loserId = idB;
						match = {
							round,
							ids: [idA, idB, "N/A"],
							first: winnerId,
							second: loserId,
							third: "N/A",
							reasoning: "Mock judgment for dry run (1v1).",
							tieGroup: "none",
							sharedPoints: {
								[winnerId]: 1,
								[loserId]: 0,
							},
						};
						console.log(`    ✓ Winner: ${winnerId} | Loser: ${loserId} (mock)`);
					} else {
						const judgeResults = await Promise.all(
							SWISS_JUDGES.map((judge) =>
								pairwiseJudge(
									"S1",
									e1[1],
									"S2",
									e2[1],
									judge.model,
									judge.effort ?? "low",
								),
							),
						);

						const voteCounts = new Map<string, number>([
							[idA, 0],
							[idB, 0],
						]);
						for (const result of judgeResults) {
							const resolvedWinner = result.winner === "S1" ? e1[0] : e2[0];
							voteCounts.set(
								resolvedWinner,
								(voteCounts.get(resolvedWinner) ?? 0) + 1,
							);
						}

						const votesA = voteCounts.get(idA) ?? 0;
						const votesB = voteCounts.get(idB) ?? 0;
						const isDraw = votesA === votesB;

						if (isDraw) {
							match = {
								round,
								ids: [idA, idB, "N/A"],
								first: idA,
								second: idB,
								third: "N/A",
								reasoning: "Swiss judges tied, resulting in a draw.",
								tieGroup: "head_to_head",
								sharedPoints: {
									[idA]: 0.5,
									[idB]: 0.5,
								},
							};
							logEntry = `- ${idA} vs ${idB}: **DRAW** (${votesA}-${votesB})\n`;
						} else {
							const winnerId = votesA > votesB ? idA : idB;
							const loserId = winnerId === idA ? idB : idA;
							const winnerVotes = voteCounts.get(winnerId) ?? 0;
							const loserVotes = voteCounts.get(loserId) ?? 0;
							match = {
								round,
								ids: [idA, idB, "N/A"],
								first: winnerId,
								second: loserId,
								third: "N/A",
								reasoning: "Swiss judges reached a majority decision.",
								tieGroup: "none",
								sharedPoints: {
									[winnerId]: 1,
									[loserId]: 0,
								},
							};
							logEntry = `- **${winnerId}** beat ${loserId} (${winnerVotes}-${loserVotes})\n`;
						}

						for (const result of judgeResults) {
							const resolvedWinner = result.winner === "S1" ? e1[0] : e2[0];
							logEntry += `  - ${result.judge} picked ${resolvedWinner}: *${result.reasoning}*\n`;
						}

							// Save judgment artifact
							const judgmentFile = join(
								output.judgmentsDir,
								`round${round}_${idA}_vs_${idB}.md`,
							);
							let judgmentMd = `# Swiss Round ${round} Judgment (1v1)\n\n`;
						judgmentMd += `## Judges\n`;
						for (const judge of SWISS_JUDGES) {
							judgmentMd += `- ${getShortModelName(judge.model)} (${judge.effort ?? "low"})\n`;
						}
						judgmentMd += `\n## Contestants\n- S1: ${e1[0]}\n- S2: ${e2[0]}\n\n`;
						judgmentMd += "## Result\n";
						if (match.tieGroup === "head_to_head") {
							judgmentMd += `Draw (${(match.sharedPoints?.[idA] ?? 0).toFixed(1)} - ${(match.sharedPoints?.[idB] ?? 0).toFixed(1)})\n\n`;
						} else {
							judgmentMd += `Winner: ${match.first}\n\n`;
						}
							judgmentMd += "## Votes\n";
							judgmentMd += logEntry.replace(/^- /, "");
							await writeFile(judgmentFile, judgmentMd, "utf-8");
						}

						return { match, logEntry };
					},
				);

				const roundResults = await Promise.all(pairPromises);

				for (const { match, logEntry } of roundResults) {
					const idA = match.ids[0];
					const idB = match.ids[1];
					if (!idA || !idB || idB === "BYE") {
						allSwissMatches.push(match);
						continue;
					}

					if (!dryRun && logEntry) {
						roundLogBody += logEntry;
					}

					const contenderA = contestants.find((c) => c.id === idA);
					const contenderB = contestants.find((c) => c.id === idB);
					if (contenderA && contenderB) {
					const sharedPoints = getSharedPoints(match);
					contenderA.points += sharedPoints[idA] ?? 0;
					contenderB.points += sharedPoints[idB] ?? 0;

					if (match.tieGroup === "head_to_head") {
						contenderA.draws = (contenderA.draws ?? 0) + 1;
						contenderB.draws = (contenderB.draws ?? 0) + 1;
					} else {
						const winner = match.first === idA ? contenderA : contenderB;
						const loser = winner === contenderA ? contenderB : contenderA;
						winner.wins = (winner.wins ?? 0) + 1;
						loser.losses = (loser.losses ?? 0) + 1;
					}

					contenderA.opponents.add(contenderB.id);
					contenderB.opponents.add(contenderA.id);
				}
				if (!dryRun) {
					if (match.tieGroup === "head_to_head") {
						console.log(`    = ${idA} drew ${idB}`);
					} else {
						console.log(
							`    ✓ Winner: ${match.first} | Loser: ${match.second}`,
						);
					}
				}
					allSwissMatches.push(match);
				}

				for (const byeId of byeIds) {
				const byeContestant = contestants.find((c) => c.id === byeId);
				if (byeContestant) {
					byeContestant.points += 1;
					byeContestant.wins = (byeContestant.wins ?? 0) + 1;
				}

				const byeMatch: SwissMatch = {
					round,
					ids: [byeId, "BYE", "N/A"],
					first: byeId,
					second: "BYE",
					third: "N/A",
					reasoning: "Bye (no opponent available this round).",
					};

					if (!dryRun) {
						roundLogBody += `- **Winner: ${byeId}** (bye)\n  - *${byeMatch.reasoning}*\n`;
					}

					console.log(`    ✓ ${byeId} receives a bye (1 point awarded)`);
					allSwissMatches.push(byeMatch);
				}
				const matchCount = pairs.length + byeIds.size;
				console.log(`    ✓ Round ${round} complete (${matchCount} matches)`);
			} else {
			// === 1v1v1 TRIPLE FORMAT (Original) ===
			const { triples } = generateSwissTriples(contestants, round);

			if (dryRun) {
				// Mock judging
				for (const [idA, idB, idC] of triples) {
					const ids = shuffleArray([idA, idB, idC]);
					const firstId = requireDefined(
						ids[0],
						"Missing first shuffled ID in Swiss dry-run triple",
					);
					const secondId = requireDefined(
						ids[1],
						"Missing second shuffled ID in Swiss dry-run triple",
					);
					const thirdId = requireDefined(
						ids[2],
						"Missing third shuffled ID in Swiss dry-run triple",
					);
					const match: SwissMatch = {
						round,
						ids: [idA, idB, idC],
						first: firstId,
						second: secondId,
						third: thirdId,
						reasoning: "Mock judgment for dry run.",
						tieGroup: "none",
						sharedPoints: {
							[firstId]: 2,
							[secondId]: 1,
							[thirdId]: 0,
						},
					};

					applyThreeWaySwissMatch(contestants, match);

					allSwissMatches.push(match);
					console.log(
						`    ✓ 1st: ${match.first} | 2nd: ${match.second} | 3rd: ${match.third} (mock)`,
					);
				}
			} else {
				// Real API calls
					const triplePromises = triples.map(
						async ([idA, idB, idC]): Promise<{ match: SwissMatch; logEntry: string }> => {
							const textA = revisionsById.get(idA)?.result.text;
							const textB = revisionsById.get(idB)?.result.text;
							const textC = revisionsById.get(idC)?.result.text;
						if (!textA || !textB || !textC) {
							const missingId = !textA ? idA : !textB ? idB : idC;
							throw new Error(
								`Missing revision text for Swiss 1v1v1 match: ${missingId}`,
							);
						}
						const entries: [string, string][] = [
							[idA, textA],
							[idB, textB],
							[idC, textC],
						];
						const shuffled = shuffleArray(entries);
						const e1 = requireDefined(
							shuffled[0],
							"Missing shuffled entry 1 for Swiss triple",
						);
						const e2 = requireDefined(
							shuffled[1],
							"Missing shuffled entry 2 for Swiss triple",
						);
						const e3 = requireDefined(
							shuffled[2],
							"Missing shuffled entry 3 for Swiss triple",
						);

						const judgeResults = await Promise.all(
							SWISS_JUDGES.map((judge) =>
								threeWayJudge(
									"S1",
									e1[1],
									"S2",
									e2[1],
									"S3",
									e3[1],
									judge.model,
									judge.effort ?? "low",
								),
							),
						);

						const idMap = new Map<string, string>([
							["S1", e1[0]],
							["S2", e2[0]],
							["S3", e3[0]],
						]);
						const scoreMap = new Map<string, number>([
							[idA, 0],
							[idB, 0],
							[idC, 0],
						]);
						let logEntry = "";
						for (let i = 0; i < judgeResults.length; i++) {
							const result = judgeResults[i];
							if (!result) continue;
							const judge = SWISS_JUDGES[i];
							const first = idMap.get(result.first) ?? idA;
							const second = idMap.get(result.second) ?? idB;
							const third = idMap.get(result.third) ?? idC;
							scoreMap.set(first, (scoreMap.get(first) ?? 0) + 2);
							scoreMap.set(second, (scoreMap.get(second) ?? 0) + 1);
							scoreMap.set(third, (scoreMap.get(third) ?? 0) + 0);
							logEntry += `  - ${judge?.model ?? "unknown"} ranked ${first} > ${second} > ${third}: *${result.reasoning}*\n`;
						}

						const sortedByScore = Array.from(scoreMap.entries()).sort(
							(a, b) => (b[1] ?? 0) - (a[1] ?? 0) || a[0].localeCompare(b[0]),
						);
						const first = requireDefined(
							sortedByScore[0],
							"Missing first score entry in Swiss triple",
						);
						const second = requireDefined(
							sortedByScore[1],
							"Missing second score entry in Swiss triple",
						);
						const third = requireDefined(
							sortedByScore[2],
							"Missing third score entry in Swiss triple",
						);

						const topScore = first[1];
						const secondScore = second[1];
						const thirdScore = third[1];

						let tieGroup: SwissMatch["tieGroup"] = "none";
						const sharedPoints: Record<string, number> = {};
						if (topScore === secondScore && secondScore === thirdScore) {
							tieGroup = "all3";
							sharedPoints[first[0]] = 1;
							sharedPoints[second[0]] = 1;
							sharedPoints[third[0]] = 1;
							logEntry =
								`- ${first[0]} / ${second[0]} / ${third[0]}: **3-way tie** (${topScore}-${secondScore}-${thirdScore})\n` +
								logEntry;
						} else if (topScore === secondScore) {
							tieGroup = "top2";
							sharedPoints[first[0]] = 1.5;
							sharedPoints[second[0]] = 1.5;
							sharedPoints[third[0]] = 0;
							logEntry =
								`- ${first[0]} and ${second[0]}: **tie for 1st** (${topScore}-${secondScore}-${thirdScore})\n` +
								logEntry;
						} else if (secondScore === thirdScore) {
							tieGroup = "bottom2";
							sharedPoints[first[0]] = 2;
							sharedPoints[second[0]] = 0.5;
							sharedPoints[third[0]] = 0.5;
							logEntry =
								`- **1st: ${first[0]}** | ${second[0]} and ${third[0]} tie for 2nd (${topScore}-${secondScore}-${thirdScore})\n` +
								logEntry;
						} else {
							sharedPoints[first[0]] = 2;
							sharedPoints[second[0]] = 1;
							sharedPoints[third[0]] = 0;
							logEntry =
								`- **1st: ${first[0]}** | 2nd: ${second[0]} | 3rd: ${third[0]} (${topScore}-${secondScore}-${thirdScore})\n` +
								logEntry;
						}

							const match: SwissMatch = {
								round,
								ids: [idA, idB, idC],
								first: first[0],
							second: second[0],
							third: third[0],
							reasoning: "Aggregated multi-judge Swiss vote.",
							tieGroup,
								sharedPoints,
							};

							const judgmentFile = join(
								output.judgmentsDir,
								`round${round}_${idA}_vs_${idB}_vs_${idC}.md`,
							);
							let judgmentMd = `# Swiss Round ${round} Judgment\n\n`;
						judgmentMd += "## Judges\n";
						for (const judge of SWISS_JUDGES) {
							judgmentMd += `- ${getShortModelName(judge.model)} (${judge.effort ?? "low"})\n`;
						}
						judgmentMd += "\n";
						judgmentMd += `## Contestants\n\n`;
						judgmentMd += `- S1 (${e1[0]}): ${e1[0]}\n`;
						judgmentMd += `- S2 (${e2[0]}): ${e2[0]}\n`;
						judgmentMd += `- S3 (${e3[0]}): ${e3[0]}\n\n`;
						judgmentMd += `## Result\n\n`;
						judgmentMd += `- ${match.first}: ${match.sharedPoints?.[match.first] ?? 0} pts\n`;
						judgmentMd += `- ${match.second}: ${match.sharedPoints?.[match.second] ?? 0} pts\n`;
						judgmentMd += `- ${match.third}: ${match.sharedPoints?.[match.third] ?? 0} pts\n`;
						judgmentMd += `- Tie Group: ${match.tieGroup ?? "none"}\n\n`;
							judgmentMd += "## Votes\n";
							judgmentMd += logEntry.replace(/^- /, "");
							await writeFile(judgmentFile, judgmentMd, "utf-8");

							return { match, logEntry };
						},
					);

					const roundResults = await Promise.all(triplePromises);

					for (const { match, logEntry } of roundResults) {
						if (!dryRun && logEntry) {
							roundLogBody += logEntry;
						}
						applyThreeWaySwissMatch(contestants, match);

						allSwissMatches.push(match);
						if ((match.tieGroup ?? "none") === "none") {
						console.log(
							`    ✓ 1st: ${match.first} | 2nd: ${match.second} | 3rd: ${match.third}`,
						);
					} else {
						console.log(
							`    = Tie result: ${match.first} | ${match.second} | ${match.third} (${match.tieGroup})`,
							);
						}
					}
				}
				console.log(`    ✓ Round ${round} complete (${triples.length} matches)`);
			}

		lastCompletedRound = round;
		const roundPairwise = allSwissMatches
			.filter((match) => match.round === round)
			.flatMap((match) => pairwiseFromSwissMatch(match, ratingConfig.tieValue));
		if (roundPairwise.length > 0) {
			pairwiseHistory.push(...roundPairwise);
		}

			if (ratingState && roundPairwise.length > 0) {
				applyPairwiseBatch(ratingState, roundPairwise);
				const orderedIds = syncContestantsWithRatings(contestants, ratingState);
				if (stopRulesConfig.enabled) {
				const topK = Math.max(
					1,
					Math.min(stopRulesConfig.topK, orderedIds.length),
				);
					topKHistory.push(orderedIds.slice(0, topK));
				}
			}

			if (!dryRun && ratingState && ratingsBeforeRound) {
				const standings = getRatingStandings(ratingState);
				const top = standings.slice(0, Math.min(8, standings.length));
				if (top.length > 0) {
					console.log("    📈 Rating moves (top 8):");
					for (let i = 0; i < top.length; i++) {
						const entry = top[i];
						if (!entry) continue;
						const before = ratingsBeforeRound.get(entry.id) ?? entry.rating;
						const delta = entry.rating - before;
						console.log(
							`      ${i + 1}. ${entry.id}: ${entry.rating.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})`,
						);
					}
				}

				if (isStructured && output.standingsDir) {
					const mdLines: string[] = [];
					mdLines.push(`# Coarse Standings - Round ${round}\n`);
					mdLines.push(`| # | id | rating | Δ | unc |\n|---:|---|---:|---:|---:|\n`);
					for (let i = 0; i < top.length; i++) {
						const entry = top[i];
						if (!entry) continue;
						const before = ratingsBeforeRound.get(entry.id) ?? entry.rating;
						const delta = entry.rating - before;
						mdLines.push(
							`| ${i + 1} | ${entry.id} | ${entry.rating.toFixed(1)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} | ${entry.uncertainty.toFixed(1)} |\n`,
						);
					}
					await writeFile(
						join(output.standingsDir, `round${round}.md`),
						mdLines.join(""),
						"utf-8",
					);
					await writeFile(
						join(output.standingsDir, `round${round}.json`),
						JSON.stringify(
							{
								round,
								standings: standings.map((s) => ({
									id: s.id,
									rating: s.rating,
									uncertainty: s.uncertainty,
								})),
							},
							null,
							2,
						),
						"utf-8",
					);
				}
			}

			if (ratingState && stopRulesConfig.enabled) {
					const stop = evaluateStopRules(
						{
							round,
						totalCalls: countSwissJudgeCalls(
						allSwissMatches,
						SWISS_JUDGES.length,
					),
					standings: getRatingStandings(ratingState),
					topKHistory,
				},
				stopRulesConfig,
			);

				if (stop.shouldStop) {
					stopReason = stop.reason;
					console.log(`    ⏹ Swiss early stop triggered: ${stop.reason}`);
					if (!dryRun) {
						roundLogBody += `\n> Swiss stopped early at round ${round}: ${stop.reason}\n`;
					}
					if (!dryRun) {
						await writeRoundLog(round, roundLogBody);
					}
					if (!dryRun) {
						// Persist intermediate stop state; the final save (with phase-complete marker)
						// happens after the Swiss loop.
						state.swissRound = round;
					state.swissMatches = allSwissMatches as StoredSwissMatch[];
					state.contestants = serializeContestants(contestants);
					state.ratingState = serializeRatingState(ratingState);
					state.pairwiseHistory = pairwiseHistory;
					state.topKHistory = topKHistory;
					state.swissStopReason = stopReason;
						saveState(runDir, state);
					}
					break;
				}
			}

			if (!dryRun) {
				await writeRoundLog(round, roundLogBody);
			}

			if (!dryRun) {
				state.swissRound = round;
				state.swissMatches = allSwissMatches as StoredSwissMatch[];
				state.contestants = serializeContestants(contestants);
			state.ratingState = ratingState
				? serializeRatingState(ratingState)
				: null;
			state.pairwiseHistory = pairwiseHistory;
			state.topKHistory = topKHistory;
			state.swissStopReason = stopReason;
			saveState(runDir, state);
		}
	}

	console.log("");

	// If rating is enabled and configured, compute final (potentially bootstrap) CIs for display.
	if (ratingState) {
		syncContestantsWithRatings(contestants, ratingState, { bootstrapCi: true });
	}

	// Save state
	if (!dryRun) {
		// Final save ensures the swiss phase-complete marker is persisted.
		state.swissRound = lastCompletedRound;
		state.swissMatches = allSwissMatches as StoredSwissMatch[];
		state.contestants = serializeContestants(contestants);
		state.ratingState = ratingState ? serializeRatingState(ratingState) : null;
		state.pairwiseHistory = pairwiseHistory;
		state.topKHistory = topKHistory;
		state.swissStopReason = stopReason;
		markPhaseCompleted(state, "swiss");
		saveState(runDir, state);
	}

	// Populate in-memory state for downstream phases even in dry-run.
	state.ratingState = ratingState ? serializeRatingState(ratingState) : null;
	state.pairwiseHistory = pairwiseHistory;
	state.topKHistory = topKHistory;

	return { contestants, matches: allSwissMatches, ratingState };
}
