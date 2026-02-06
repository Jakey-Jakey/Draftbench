import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pairwiseJudge, threeWayJudge } from "../aiClient";
import { getConfig, getSwissJudge } from "../config";
import type { SwissContestant, SwissMatch } from "../leaderboard";
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
		placements: c.placements,
		wins: c.wins ?? 0,
		losses: c.losses ?? 0,
		draws: c.draws ?? 0,
	}));
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
	const SWISS_JUDGE = getSwissJudge();
	const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
	const judgeShortName = getShortModelName(SWISS_JUDGE.model);

	console.log(
		`Phase 5/6: Swiss Tournament (${SWISS_ROUNDS} rounds, ${SWISS_FORMAT} format)...`,
	);

	const fileLock = new Semaphore(1);

	const hasSwissProgress =
		isResuming &&
		(state.swissRound ?? 0) > 0 &&
		state.contestants &&
		state.swissMatches.length > 0;
	const swissAlreadyCompleted =
		hasSwissProgress &&
		isPhaseCompleted(state, "swiss") &&
		state.swissRound >= SWISS_ROUNDS;

	// Initialize contestants
	const contestants: SwissContestant[] = hasSwissProgress
		? (state.contestants as StoredSwissContestant[]).map((c) => ({
				id: c.id,
				text: revisionsById.get(c.id)?.result.text ?? "",
				points: c.points,
				opponents: new Set(c.opponents),
				placements: c.placements,
				wins: c.wins ?? 0,
				losses: c.losses ?? 0,
				draws: c.draws ?? 0,
			}))
		: Array.from(revisionsById.entries()).map(([id, data]) => ({
				id,
				text: data.result.text,
				points: 0,
				opponents: new Set<string>(),
				placements: { first: 0, second: 0, third: 0 },
				wins: 0,
				losses: 0,
				draws: 0,
			}));

	const allSwissMatches: SwissMatch[] = hasSwissProgress
		? [...(state.swissMatches as StoredSwissMatch[])]
		: [];

	if (swissAlreadyCompleted) {
		console.log(
			`  ↩︎ Loaded Swiss tournament state with ${contestants.length} contestants; skipping rounds\n`,
		);
		return { contestants, matches: allSwissMatches };
	}
	const startRound = hasSwissProgress ? state.swissRound + 1 : 1;
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
			const { pairs, bye } = generateSwissPairs(contestants);
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

					let winnerId: string;
					let _loserId: string;
					let reasoning: string;

					if (dryRun) {
						// Mock
						winnerId = idA; // Arbitrary winner for dry run
						_loserId = idB;
						reasoning = "Mock judgment for dry run (1v1).";
						console.log(
							`    ✓ Winner: ${winnerId} | Loser: ${_loserId} (mock)`,
						);
					} else {
						// Real
						const result = await pairwiseJudge(
							"S1",
							e1[1],
							"S2",
							e2[1],
							SWISS_JUDGE.model,
							SWISS_JUDGE.effort ?? "low",
						);
						const anonToReal = new Map<string, string>([
							["S1", e1[0]],
							["S2", e2[0]],
						]);
						winnerId = anonToReal.get(result.winner) ?? idA;
						_loserId = anonToReal.get(result.loser) ?? idB;
						reasoning = result.reasoning;

						// Log to file
						await fileLock.acquire();
						try {
							await appendFile(
								swissLogPath,
								`- **Winner: ${winnerId}** | Loser: ${_loserId}\n  - *${reasoning}*\n`,
								"utf-8",
							);
						} finally {
							fileLock.release();
						}

						// Save judgment artifact
						const judgmentFile = join(
							swissJudgmentsDir,
							`round${round}_${idA}_vs_${idB}.md`,
						);
						const judgmentMd = `# Swiss Round ${round} Judgment (1v1)\n\n**Judge**: ${judgeShortName}\n\n## Contestants\n- S1: ${e1[0]}\n- S2: ${e2[0]}\n\n## Result\n**Winner**: ${winnerId}\n\n## Reasoning\n${reasoning}\n`;
						await writeFile(judgmentFile, judgmentMd, "utf-8");
					}

					return {
						round,
						// Use "N/A" as a placeholder for the third slot in 1v1 matches to satisfy the tuple schema.
						ids: [idA, idB, "N/A"],
						first: winnerId,
						second: _loserId,
						third: "N/A",
						reasoning,
					};
				},
			);

			const roundMatches = await Promise.all(pairPromises);

			for (const match of roundMatches) {
				const winner = contestants.find((c) => c.id === match.first);
				const loser = contestants.find((c) => c.id === match.second);

				if (winner && loser) {
					winner.points += 1;
					// Update wins/losses for 1v1 instead of placements
					winner.wins = (winner.wins ?? 0) + 1;
					loser.points += 0;
					loser.losses = (loser.losses ?? 0) + 1;

					winner.opponents.add(loser.id);
					loser.opponents.add(winner.id);
				}
				if (!dryRun) {
					console.log(`    ✓ Winner: ${match.first} | Loser: ${match.second}`);
				}
				allSwissMatches.push(match);
			}

			if (bye) {
				const byeContestant = contestants.find((c) => c.id === bye);
				if (byeContestant) {
					byeContestant.points += 1;
					byeContestant.wins = (byeContestant.wins ?? 0) + 1;
				}

				const byeMatch: SwissMatch = {
					round,
					ids: [bye, "BYE", "N/A"],
					first: bye,
					second: "BYE",
					third: "N/A",
					reasoning: "Bye (no opponent available this round).",
				};

				if (!dryRun) {
					await appendFile(
						swissLogPath,
						`- **Winner: ${bye}** (bye)\n  - *${byeMatch.reasoning}*\n`,
						"utf-8",
					);
				}

				console.log(`    ✓ ${bye} receives a bye (1 point awarded)`);
				allSwissMatches.push(byeMatch);
			}
			if (!dryRun) await appendFile(swissLogPath, "\n", "utf-8");
			const matchCount = pairs.length + (bye ? 1 : 0);
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
					};

					const first = contestants.find((c) => c.id === match.first);
					const second = contestants.find((c) => c.id === match.second);
					const third = contestants.find((c) => c.id === match.third);

					if (first && second && third) {
						first.points += 2;
						first.placements.first++;
						second.points += 1;
						second.placements.second++;
						third.placements.third++;

						first.opponents.add(second.id);
						first.opponents.add(third.id);
						second.opponents.add(first.id);
						second.opponents.add(third.id);
						third.opponents.add(first.id);
						third.opponents.add(second.id);
					}

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

						const result = await threeWayJudge(
							"S1",
							e1[1],
							"S2",
							e2[1],
							"S3",
							e3[1],
							SWISS_JUDGE.model,
							SWISS_JUDGE.effort ?? "low",
						);

						const anonToReal = new Map<string, string>([
							["S1", e1[0]],
							["S2", e2[0]],
							["S3", e3[0]],
						]);

						const match: SwissMatch = {
							round,
							ids: [idA, idB, idC],
							first: anonToReal.get(result.first) ?? idA,
							second: anonToReal.get(result.second) ?? idB,
							third: anonToReal.get(result.third) ?? idC,
							reasoning: result.reasoning,
						};

						await fileLock.acquire();
						try {
							await appendFile(
								swissLogPath,
								`- **1st: ${match.first}** | 2nd: ${match.second} | 3rd: ${match.third}\n  - *${match.reasoning}*\n`,
								"utf-8",
							);
						} finally {
							fileLock.release();
						}

						const judgmentFile = join(
							swissJudgmentsDir,
							`round${round}_${match.first}_vs_${match.second}_vs_${match.third}.md`,
						);
						let judgmentMd = `# Swiss Round ${round} Judgment\n\n`;
						judgmentMd += `**Judge**: ${judgeShortName} (${SWISS_JUDGE.effort ?? "low"} thinking)\n\n`;
						judgmentMd += `## Contestants\n\n`;
						judgmentMd += `- S1 (${e1[0]}): ${e1[0]}\n`;
						judgmentMd += `- S2 (${e2[0]}): ${e2[0]}\n`;
						judgmentMd += `- S3 (${e3[0]}): ${e3[0]}\n\n`;
						judgmentMd += `## Result\n\n`;
						judgmentMd += `1. **${match.first}** (2 pts)\n`;
						judgmentMd += `2. ${match.second} (1 pt)\n`;
						judgmentMd += `3. ${match.third} (0 pts)\n\n`;
						judgmentMd += `## Reasoning\n\n${result.reasoning}\n`;
						await writeFile(judgmentFile, judgmentMd, "utf-8");

						return match;
					},
				);

				const roundResults = await Promise.all(triplePromises);

				for (const match of roundResults) {
					const first = contestants.find((c) => c.id === match.first);
					const second = contestants.find((c) => c.id === match.second);
					const third = contestants.find((c) => c.id === match.third);

					if (first && second && third) {
						first.points += 2;
						first.placements.first++;
						second.points += 1;
						second.placements.second++;
						third.placements.third++;

						first.opponents.add(second.id);
						first.opponents.add(third.id);
						second.opponents.add(first.id);
						second.opponents.add(third.id);
						third.opponents.add(first.id);
						third.opponents.add(second.id);
					}

					allSwissMatches.push(match);
					console.log(
						`    ✓ 1st: ${match.first} | 2nd: ${match.second} | 3rd: ${match.third}`,
					);
				}

				await appendFile(swissLogPath, "\n", "utf-8");
			}
			console.log(`    ✓ Round ${round} complete (${triples.length} matches)`);
		}

		if (!dryRun) {
			state.swissRound = round;
			state.swissMatches = allSwissMatches as StoredSwissMatch[];
			state.contestants = serializeContestants(contestants);
			saveState(runDir, state);
		}
	}

	console.log("");

	// Save state
	if (!dryRun) {
		state.swissRound = SWISS_ROUNDS;
		state.swissMatches = allSwissMatches as StoredSwissMatch[];
		state.contestants = serializeContestants(contestants);
		markPhaseCompleted(state, "swiss");
		saveState(runDir, state);
	}

	return { contestants, matches: allSwissMatches };
}
