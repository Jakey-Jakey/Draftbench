import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pairwiseJudge, threeWayJudge } from "../aiClient";
import { getConfig, getPlayoffJudges, getSwissJudges } from "../config";
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
import {
	countRepeatPairs,
	planDisambiguationPairs,
} from "../scheduling/disambiguation";
import { evaluateStopRules } from "../scheduling/stopRules";
import { Semaphore } from "../semaphore";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredDisambiguationMatch,
	type StoredSwissContestant,
	type StoredSwissMatch,
	saveState,
} from "../state";
import { getShortModelName, requireDefined, shuffleArray } from "../utils";
import type { RevisionEntry } from "./revise";

// ============================================================================
// Swiss Tournament Types & Logic
// ============================================================================

function fnv1a32(input: string): number {
	// Deterministic 32-bit hash (FNV-1a) for seeded RNG.
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
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

export interface SwissPhaseResult {
	contestants: SwissContestant[];
	matches: SwissMatch[];
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

function syncContestantsWithRatings(
	contestants: SwissContestant[],
	ratingState: RatingState,
	options?: { bootstrapCi?: boolean },
): string[] {
	const standings =
		options?.bootstrapCi === true
			? getRatingStandingsWithOptions(ratingState, { bootstrapCi: true })
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

function countDisambiguationJudgeCalls(
	matches: StoredDisambiguationMatch[],
): number {
	let calls = 0;
	for (const match of matches) {
		calls += match.judges.length;
	}
	return calls;
}

// ============================================================================
// Swiss Phase
// ============================================================================

/**
 * Phase 5: Swiss Tournament.
 * Supports 1v1v1 (three-way) or 1v1 (pairwise) format.
 */
export async function runSwissPhase(
	runDir: string,
	swissLogPath: string,
	swissJudgmentsDir: string,
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
	const disambiguationConfig = config.tournament.disambiguation;
	const judgeLabel = SWISS_JUDGES.map(
		(j) => `${getShortModelName(j.model)} (${j.effort ?? "low"})`,
	).join(", ");

	console.log(
		`Phase 5/6: Swiss Tournament (${SWISS_ROUNDS} rounds, ${SWISS_FORMAT} format, judges: ${judgeLabel})...`,
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
	if (
		disambiguationConfig.enabled &&
		(!stopRulesConfig.enabled || !ratingConfig.enabled)
	) {
		console.warn(
			"  ⚠️ Disambiguation enabled without stop rules + rating backend; disambiguation will be ignored.",
		);
	}

	const fileLock = new Semaphore(1);
	const disambiguationJudgmentsDir = join(swissJudgmentsDir, "disambiguation");
	if (!dryRun) {
		await mkdir(disambiguationJudgmentsDir, { recursive: true });
	}

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
	const disambiguationMatches: StoredDisambiguationMatch[] =
		hasSwissProgress && (state.disambiguationMatches?.length ?? 0) > 0
			? [...(state.disambiguationMatches ?? [])]
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
			`  ↩︎ Loaded Swiss tournament state with ${contestants.length} contestants; skipping rounds\n`,
		);
		return { contestants, matches: allSwissMatches };
	}
	const startRound = hasSwissProgress ? state.swissRound + 1 : 1;
	let lastCompletedRound = hasSwissProgress ? state.swissRound : 0;
	let stopReason = state.swissStopReason ?? null;
	if (hasSwissProgress) {
		console.log(
			`  ↩︎ Loaded Swiss progress through round ${state.swissRound}; resuming at round ${startRound}`,
		);
	}

	// Run Swiss rounds
	for (let round = startRound; round <= SWISS_ROUNDS; round++) {
		console.log(`  Round ${round}/${SWISS_ROUNDS}...`);
		if (!dryRun) {
			await appendFile(swissLogPath, `## Round ${round}\n\n`, "utf-8");
		}

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
				async ([idA, idB]): Promise<SwissMatch> => {
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

						// Log to file
						await fileLock.acquire();
						try {
							await appendFile(swissLogPath, logEntry, "utf-8");
						} finally {
							fileLock.release();
						}

						// Save judgment artifact
						const judgmentFile = join(
							swissJudgmentsDir,
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

					return match;
				},
			);

			const roundMatches = await Promise.all(pairPromises);

			for (const match of roundMatches) {
				const idA = match.ids[0];
				const idB = match.ids[1];
				if (!idA || !idB || idB === "BYE") {
					allSwissMatches.push(match);
					continue;
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
					await appendFile(
						swissLogPath,
						`- **Winner: ${byeId}** (bye)\n  - *${byeMatch.reasoning}*\n`,
						"utf-8",
					);
				}

				console.log(`    ✓ ${byeId} receives a bye (1 point awarded)`);
				allSwissMatches.push(byeMatch);
			}
			if (!dryRun) await appendFile(swissLogPath, "\n", "utf-8");
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
					async ([idA, idB, idC]): Promise<SwissMatch> => {
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

						await fileLock.acquire();
						try {
							await appendFile(swissLogPath, logEntry, "utf-8");
						} finally {
							fileLock.release();
						}

						const judgmentFile = join(
							swissJudgmentsDir,
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

						return match;
					},
				);

				const roundResults = await Promise.all(triplePromises);

				for (const match of roundResults) {
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

				await appendFile(swissLogPath, "\n", "utf-8");
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

		if (ratingState && stopRulesConfig.enabled) {
			const getTotalCalls = () =>
				countSwissJudgeCalls(allSwissMatches, SWISS_JUDGES.length) +
				countDisambiguationJudgeCalls(disambiguationMatches);

			let stop = evaluateStopRules(
				{
					round,
					totalCalls: getTotalCalls(),
					standings: getRatingStandings(ratingState),
					topKHistory,
				},
				stopRulesConfig,
			);

			if (
				!stop.shouldStop &&
				stop.kind === "stable_not_separated" &&
				disambiguationConfig.enabled &&
				disambiguationConfig.maxMatchesPerSwissRound > 0 &&
				disambiguationConfig.maxTotalMatches > 0
			) {
				const remaining =
					disambiguationConfig.maxTotalMatches - disambiguationMatches.length;
				const maxThisRound = Math.min(
					disambiguationConfig.maxMatchesPerSwissRound,
					remaining,
				);
				const disambigJudges =
					disambiguationConfig.judgesSource === "swiss"
						? SWISS_JUDGES
						: getPlayoffJudges();

				if (maxThisRound > 0 && disambigJudges.length > 0) {
					const standings = getRatingStandings(ratingState);
					const planned = planDisambiguationPairs({
						standings,
						ratingState,
						topK: stopRulesConfig.topK,
						candidatesOutsideK: disambiguationConfig.candidatesOutsideK,
						includeTopKInternal: disambiguationConfig.includeTopKInternal,
						repeatCounts: countRepeatPairs(pairwiseHistory),
						maxRepeatPairs: schedulingConfig.maxRepeatPairs,
						allowOverRepeatCap: disambiguationConfig.allowOverRepeatCap,
						targetWinProb: disambiguationConfig.targetWinProb,
						maxMatches: maxThisRound,
					});

					if (planned.length > 0) {
						const judgeLabel = disambigJudges
							.map(
								(j) => `${getShortModelName(j.model)} (${j.effort ?? "low"})`,
							)
							.join(", ");
						console.log(
							`    ↻ Disambiguation: running ${planned.length} targeted pairwise matchup(s) (judges: ${judgeLabel})...`,
						);
						if (!dryRun) {
							await appendFile(
								swissLogPath,
								`### Disambiguation (rating-only)\n\n> Swiss top-${stopRulesConfig.topK} is stable but not separated; running targeted pairwise matches to tighten confidence.\n\n`,
								"utf-8",
							);
						}

						const contestantById = new Map(
							contestants.map((c) => [c.id, c] as const),
						);

						for (let i = 0; i < planned.length; i++) {
							const [idA, idB] = planned[i] ?? [];
							if (!idA || !idB) continue;

							const revisionA = revisionsById.get(idA);
							const revisionB = revisionsById.get(idB);
							if (!revisionA || !revisionB) {
								throw new Error(
									`Missing revision for disambiguation match: ${!revisionA ? idA : idB}`,
								);
							}

							const rng = mulberry32(
								fnv1a32(
									`disambig|r${round}|${[idA, idB].sort().join("::")}|${i}`,
								),
							);
							const swapped = rng() > 0.5;
							const [firstId, secondId] = swapped ? [idB, idA] : [idA, idB];
							const [firstText, secondText] = swapped
								? [revisionB.result.text, revisionA.result.text]
								: [revisionA.result.text, revisionB.result.text];

							let votesA = 0;
							let votesB = 0;
							let isDraw = false;

							if (dryRun) {
								const outcome = rng();
								if (outcome < 0.45) votesA = disambigJudges.length;
								else if (outcome < 0.9) votesB = disambigJudges.length;
								else {
									isDraw = true;
									votesA = Math.floor(disambigJudges.length / 2);
									votesB = disambigJudges.length - votesA;
								}
							} else {
								const judgeResults = await Promise.all(
									disambigJudges.map((judge) =>
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
									const resolvedWinner =
										result.winner === "S1" ? firstId : secondId;
									if (resolvedWinner === idA) votesA += 1;
									else votesB += 1;
								}
								isDraw = votesA === votesB;

								const safeKey = `${idA}__vs__${idB}`.replaceAll("/", "_");
								const judgmentFile = join(
									disambiguationJudgmentsDir,
									`round_${round}_${safeKey}.md`,
								);
								let md = `# Disambiguation Match (Round ${round})\n\n`;
								md += `- A: ${idA}\n`;
								md += `- B: ${idB}\n\n`;
								md += `## Judges\n\n`;
								for (const judge of disambigJudges) {
									md += `- ${judge.model} (${judge.effort ?? "high"})\n`;
								}
								md += "\n## Votes\n\n";
								md += `- ${idA}: ${votesA}\n`;
								md += `- ${idB}: ${votesB}\n`;
								md += `- Result: ${isDraw ? "DRAW" : votesA > votesB ? idA : idB}\n`;
								await writeFile(judgmentFile, md, "utf-8");
							}

							const totalVotes = Math.max(1, votesA + votesB);
							const scoreA = isDraw
								? ratingConfig.tieValue
								: votesA / totalVotes;
							const scoreB = isDraw ? ratingConfig.tieValue : 1 - scoreA;
							const sourceMatchId = `disambig:r${round}:${[idA, idB].sort().join("::")}:${disambiguationMatches.length + 1}`;

							const observation: PairwiseObservation = {
								aId: idA,
								bId: idB,
								scoreA,
								scoreB,
								round,
								sourceMatchId,
							};
							pairwiseHistory.push(observation);
							applyPairwiseBatch(ratingState, [observation]);

							// Record opponent history so static Swiss pairing doesn't unknowingly repeat.
							const ca = contestantById.get(idA);
							const cb = contestantById.get(idB);
							ca?.opponents.add(idB);
							cb?.opponents.add(idA);

							disambiguationMatches.push({
								round,
								aId: idA,
								bId: idB,
								scoreA,
								scoreB,
								votesA,
								votesB,
								judges: disambigJudges.map((j) => j.model),
								sourceMatchId,
							});

							if (!dryRun) {
								const line = isDraw
									? `- ${idA} vs ${idB}: **DRAW** (${votesA}-${votesB})\n`
									: `- **${votesA > votesB ? idA : idB}** beat ${votesA > votesB ? idB : idA} (${votesA}-${votesB})\n`;
								await appendFile(swissLogPath, line, "utf-8");
							}
						}

						const orderedIds = syncContestantsWithRatings(
							contestants,
							ratingState,
						);
						const topK = Math.max(
							1,
							Math.min(stopRulesConfig.topK, orderedIds.length),
						);
						if (topKHistory.length === 0) {
							topKHistory.push(orderedIds.slice(0, topK));
						} else {
							topKHistory[topKHistory.length - 1] = orderedIds.slice(0, topK);
						}

						stop = evaluateStopRules(
							{
								round,
								totalCalls: getTotalCalls(),
								standings: getRatingStandings(ratingState),
								topKHistory,
							},
							stopRulesConfig,
						);
					}
				}
			}

			if (stop.shouldStop) {
				stopReason = stop.reason;
				console.log(`    ⏹ Swiss stop rule triggered: ${stop.reason}`);
				if (!dryRun) {
					await appendFile(
						swissLogPath,
						`\n> Swiss stopped early at round ${round}: ${stop.reason}\n\n`,
						"utf-8",
					);
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
					state.disambiguationMatches = disambiguationMatches;
					state.swissStopReason = stopReason;
					saveState(runDir, state);
				}
				break;
			}
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
			state.disambiguationMatches = disambiguationMatches;
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
		state.disambiguationMatches = disambiguationMatches;
		state.swissStopReason = stopReason;
		markPhaseCompleted(state, "swiss");
		saveState(runDir, state);
	}

	return { contestants, matches: allSwissMatches };
}
