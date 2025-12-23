import { appendFile, writeFile } from "fs/promises";
import { join } from "path";
import { type ModelName, threeWayJudge } from "../aiClient";
import { getConfig } from "../config";
import type { SwissContestant, SwissMatch } from "../leaderboard";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredSwissContestant,
	type StoredSwissMatch,
	saveState,
} from "../state";
import { shuffleArray } from "../utils";
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
		const first = available[0]!;
		used.add(first.id);

		// Find best 2nd: closest in points, hasn't faced first
		let secondIdx = -1;
		for (let i = 1; i < available.length; i++) {
			if (!first.opponents.has(available[i]!.id)) {
				secondIdx = i;
				break;
			}
		}
		if (secondIdx === -1) secondIdx = 1;
		const second = available[secondIdx]!;
		used.add(second.id);

		// Find best 3rd: closest in points, hasn't faced first or second
		let thirdIdx = -1;
		for (let i = 1; i < available.length; i++) {
			if (available[i]!.id === second.id) continue;
			if (
				!first.opponents.has(available[i]!.id) &&
				!second.opponents.has(available[i]!.id)
			) {
				thirdIdx = i;
				break;
			}
		}
		if (thirdIdx === -1) {
			for (let i = 1; i < available.length; i++) {
				if (available[i]!.id !== second.id) {
					thirdIdx = i;
					break;
				}
			}
		}
		const third = available[thirdIdx]!;
		used.add(third.id);

		triples.push([first.id, second.id, third.id]);
	}

	return { triples };
}

// ============================================================================
// Swiss Phase
// ============================================================================

/**
 * Phase 5: Swiss Tournament (7 rounds, 1v1v1 format).
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
	const SWISS_JUDGE = config.tournament.swissJudge;

	console.log(
		`Phase 5/6: Swiss Tournament (${SWISS_ROUNDS} rounds, 1v1v1 format)...`,
	);

	// Check for resume
	const resumeSwiss =
		isResuming &&
		isPhaseCompleted(state, "swiss") &&
		state.contestants &&
		state.swissMatches.length > 0;

	// Initialize contestants
	const contestants: SwissContestant[] = resumeSwiss
		? (state.contestants as StoredSwissContestant[]).map((c) => ({
				id: c.id,
				text: revisionsById.get(c.id)?.result.text ?? "",
				points: c.points,
				opponents: new Set(c.opponents),
				placements: c.placements,
			}))
		: Array.from(revisionsById.entries()).map(([id, data]) => ({
				id,
				text: data.result.text,
				points: 0,
				opponents: new Set<string>(),
				placements: { first: 0, second: 0, third: 0 },
			}));

	const allSwissMatches: SwissMatch[] = resumeSwiss
		? [...(state.swissMatches as StoredSwissMatch[])]
		: [];

	if (resumeSwiss) {
		console.log(
			`  ↩︎ Loaded Swiss tournament state with ${contestants.length} contestants; skipping rounds\n`,
		);
		return { contestants, matches: allSwissMatches };
	}

	// Run Swiss rounds
	for (let round = 1; round <= SWISS_ROUNDS; round++) {
		console.log(`  Round ${round}/${SWISS_ROUNDS}...`);
		if (!dryRun) {
			await appendFile(swissLogPath, `## Round ${round}\n\n`, "utf-8");
		}

		const { triples } = generateSwissTriples(contestants, round);

		if (dryRun) {
			// Mock judging
			for (const [idA, idB, idC] of triples) {
				const ids = shuffleArray([idA, idB, idC]);
				const match: SwissMatch = {
					round,
					ids: [idA, idB, idC],
					first: ids[0]!,
					second: ids[1]!,
					third: ids[2]!,
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
					const entries: [string, string][] = [
						[idA, revisionsById.get(idA)!.result.text],
						[idB, revisionsById.get(idB)!.result.text],
						[idC, revisionsById.get(idC)!.result.text],
					];
					const shuffled = shuffleArray(entries);
					const [e1, e2, e3] = [shuffled[0]!, shuffled[1]!, shuffled[2]!];

					const result = await threeWayJudge(
						"S1",
						e1[1],
						"S2",
						e2[1],
						"S3",
						e3[1],
						SWISS_JUDGE.model as ModelName,
						SWISS_JUDGE.effort,
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

					await appendFile(
						swissLogPath,
						`- **1st: ${match.first}** | 2nd: ${match.second} | 3rd: ${match.third}\n  - *${match.reasoning}*\n`,
						"utf-8",
					);

					const judgmentFile = join(
						swissJudgmentsDir,
						`round${round}_${match.first}_vs_${match.second}_vs_${match.third}.md`,
					);
					let judgmentMd = `# Swiss Round ${round} Judgment\n\n`;
					judgmentMd += `**Judge**: ${SWISS_JUDGE.model} (${SWISS_JUDGE.effort} thinking)\n\n`;
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

	console.log("");

	// Save state
	if (!dryRun && !resumeSwiss) {
		state.swissRound = SWISS_ROUNDS;
		state.swissMatches = allSwissMatches as StoredSwissMatch[];
		state.contestants = contestants.map((c) => ({
			id: c.id,
			points: c.points,
			opponents: Array.from(c.opponents),
			placements: c.placements,
		})) as StoredSwissContestant[];
		markPhaseCompleted(state, "swiss");
		saveState(runDir, state);
	}

	return { contestants, matches: allSwissMatches };
}
