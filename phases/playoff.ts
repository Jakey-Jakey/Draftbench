import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ModelName, pairwiseJudge } from "../aiClient";
import { getConfig } from "../config";
import type { PlayoffResult, SwissContestant } from "../leaderboard";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredPlayoffResult,
	saveState,
} from "../state";
import type { RevisionEntry } from "./revise";

// ============================================================================
// Playoff Phase
// ============================================================================

export interface PlayoffPhaseResult {
	/** Playoff results by contestant ID */
	results: Map<string, PlayoffResult>;
	/** IDs of top-N qualifiers */
	qualifierIds: Set<string>;
}

/**
 * Phase 6: Top-N Round Robin Playoff with dual-judge voting.
 */
export async function runPlayoffPhase(
	runDir: string,
	playoffLogPath: string,
	playoffJudgmentsDir: string,
	state: PipelineState,
	contestants: SwissContestant[],
	revisionsById: Map<string, RevisionEntry>,
	dryRun: boolean,
	isResuming: boolean,
): Promise<PlayoffPhaseResult> {
	const config = getConfig();
	const TOP_N_PLAYOFF = config.tournament.playoffSize;
	const PLAYOFF_JUDGES = config.tournament.playoffJudges;

	console.log(
		`Phase 6/6: Top-${TOP_N_PLAYOFF} Round Robin Playoff (judges: ${PLAYOFF_JUDGES.map((j) => `${j.model} (${j.effort})`).join(", ")})...`,
	);

	// Get top N by Swiss points
	const sortedBySwiss = [...contestants].sort((a, b) => {
		if (b.points !== a.points) return b.points - a.points;
		if (b.placements.first !== a.placements.first)
			return b.placements.first - a.placements.first;
		return b.placements.second - a.placements.second;
	});
	const topN = sortedBySwiss.slice(0, TOP_N_PLAYOFF);
	const topNIds = new Set(topN.map((c) => c.id));

	console.log(
		`  Top ${TOP_N_PLAYOFF} qualifiers: ${topN.map((c) => c.id).join(", ")}`,
	);
	if (!dryRun) {
		await appendFile(
			playoffLogPath,
			`## Qualifiers\n\n${topN.map((c, i) => `${i + 1}. ${c.id} (${c.points} pts)`).join("\n")}\n\n`,
			"utf-8",
		);
	}

	// Track playoff results
	const playoffResults = new Map<string, PlayoffResult>();
	for (const c of topN) {
		playoffResults.set(c.id, { points: 0, wins: 0, losses: 0, draws: 0 });
	}

	// Check for resume
	const resumePlayoff =
		isResuming && isPhaseCompleted(state, "playoff") && state.playoffResults;

	// Generate all pairings
	const playoffPairs: [string, string][] = [];
	for (let i = 0; i < topN.length; i++) {
		for (let j = i + 1; j < topN.length; j++) {
			playoffPairs.push([topN[i]!.id, topN[j]!.id]);
		}
	}

	console.log(
		`  Running ${playoffPairs.length} matchups (×${PLAYOFF_JUDGES.length} judges = ${playoffPairs.length * PLAYOFF_JUDGES.length} total)...`,
	);
	if (!dryRun) {
		await appendFile(playoffLogPath, `## Matches\n\n`, "utf-8");
	}

	if (resumePlayoff) {
		for (const result of state.playoffResults as StoredPlayoffResult[]) {
			playoffResults.set(result.id, {
				points: result.points,
				wins: result.wins,
				losses: result.losses,
				draws: result.draws,
			});
		}
		console.log(
			`  ↩︎ Loaded playoff standings from state (skipping playoff matches)\n`,
		);
		return { results: playoffResults, qualifierIds: topNIds };
	}

	if (dryRun) {
		// Mock playoff results
		for (const [idA, idB] of playoffPairs) {
			const resultA = playoffResults.get(idA)!;
			const resultB = playoffResults.get(idB)!;

			const outcome = Math.random();
			if (outcome < 0.4) {
				resultA.points += 1;
				resultA.wins++;
				resultB.losses++;
				console.log(`    ✓ ${idA} beat ${idB} (mock)`);
			} else if (outcome < 0.8) {
				resultB.points += 1;
				resultB.wins++;
				resultA.losses++;
				console.log(`    ✓ ${idB} beat ${idA} (mock)`);
			} else {
				resultA.points += 0.5;
				resultA.draws++;
				resultB.points += 0.5;
				resultB.draws++;
				console.log(`    = ${idA} drew ${idB} (mock)`);
			}
		}
	} else {
		// Real API calls
		const playoffPromises = playoffPairs.map(async ([idA, idB]) => {
			const textA = revisionsById.get(idA)!.result.text;
			const textB = revisionsById.get(idB)!.result.text;

			const swapped = Math.random() > 0.5;
			const [firstId, secondId] = swapped ? [idB, idA] : [idA, idB];
			const [firstText, secondText] = swapped ? [textB, textA] : [textA, textB];

			const judgeResults = await Promise.all(
				PLAYOFF_JUDGES.map((judge) =>
					pairwiseJudge(
						"S1",
						firstText,
						"S2",
						secondText,
						judge.model as ModelName,
						judge.effort,
					),
				),
			);

			const voteCounts = new Map<string, number>([
				[firstId, 0],
				[secondId, 0],
			]);

			for (const result of judgeResults) {
				const resolvedWinner = result.winner === "S1" ? firstId : secondId;
				voteCounts.set(
					resolvedWinner,
					(voteCounts.get(resolvedWinner) ?? 0) + 1,
				);
			}

			const votes = Array.from(voteCounts.entries());
			votes.sort((a, b) => b[1]! - a[1]!);
			const topCount = votes[0]![1];
			const topWinners = votes
				.filter(([, count]) => count === topCount)
				.map(([id]) => id);

			let matchResult: {
				winner: string | null;
				loser: string | null;
				isDraw: boolean;
			};
			let logEntry: string;

			if (topWinners.length === 1) {
				const winner = topWinners[0]!;
				const loser = winner === idA ? idB : idA;
				const winnerVotes = voteCounts.get(winner) ?? 0;
				const loserVotes = voteCounts.get(loser) ?? 0;
				matchResult = { winner, loser, isDraw: false };
				logEntry = `- **${winner}** beat ${loser} (${winnerVotes}-${loserVotes})\n`;
			} else {
				const votesA = voteCounts.get(idA) ?? 0;
				const votesB = voteCounts.get(idB) ?? 0;
				matchResult = { winner: null, loser: null, isDraw: true };
				logEntry = `- ${idA} vs ${idB}: **DRAW** (${votesA}-${votesB})\n`;
			}

			for (const result of judgeResults) {
				const resolvedWinner = result.winner === "S1" ? firstId : secondId;
				logEntry += `  - ${result.judge} picked ${resolvedWinner}: *${result.reasoning}*\n`;
			}

			// Write detailed judgment file
			const judgmentFile = join(playoffJudgmentsDir, `${idA}_vs_${idB}.md`);
			let judgmentMd = `# Playoff Judgment: ${idA} vs ${idB}\n\n`;
			judgmentMd += `**Position Order**: S1=${firstId}, S2=${secondId}\n\n`;
			judgmentMd += `## Judge Decisions\n\n`;
			judgmentMd += logEntry.replace(/^- /, "");
			await writeFile(judgmentFile, judgmentMd, "utf-8");

			// Update standings
			const resultA = playoffResults.get(idA)!;
			const resultB = playoffResults.get(idB)!;
			if (matchResult.isDraw) {
				resultA.points += 0.5;
				resultA.draws++;
				resultB.points += 0.5;
				resultB.draws++;
			} else if (matchResult.winner === idA) {
				resultA.points += 1;
				resultA.wins++;
				resultB.losses++;
			} else {
				resultB.points += 1;
				resultB.wins++;
				resultA.losses++;
			}

			if (!dryRun) {
				await appendFile(playoffLogPath, logEntry, "utf-8");
			}
		});

		await Promise.all(playoffPromises);
	}

	// Save state
	if (!dryRun && !resumePlayoff) {
		state.playoffResults = Array.from(playoffResults.entries()).map(
			([id, result]) => ({
				id,
				points: result.points,
				wins: result.wins,
				losses: result.losses,
				draws: result.draws,
			}),
		) as StoredPlayoffResult[];
		markPhaseCompleted(state, "playoff");
		saveState(runDir, state);
	}

	return { results: playoffResults, qualifierIds: topNIds };
}
