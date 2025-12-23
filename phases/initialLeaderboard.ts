import { appendFile } from "node:fs/promises";
import {
	type GenerateResult,
	type ModelSlug,
	pairwiseJudge,
} from "../aiClient";
import {
	getConfig,
	getInitialLeaderboardJudges,
	getModelsForRole,
	type RoleEntry,
} from "../config";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredGenerateResult,
	saveState,
} from "../state";
import { getShortModelName } from "../utils";

// ============================================================================
// Initial Leaderboard Phase
// ============================================================================

interface DraftStanding {
	model: ModelSlug;
	draftIndex: number;
	text: string;
	result: GenerateResult;
	points: number;
	wins: number;
	draws: number;
	losses: number;
}

export interface InitialLeaderboardResult {
	/** Best draft selected for each model */
	selectedByModel: Map<ModelSlug, GenerateResult>;
}

/**
 * Phase 2: Optional initial round robin to pick the best draft per model.
 * If disabled or only 1 generation per model, simply uses the first draft.
 */
export async function runInitialLeaderboardPhase(
	runDir: string,
	state: PipelineState,
	draftsByModel: Map<ModelSlug, GenerateResult[]>,
	initialLeaderboardLogPath: string | null,
	dryRun: boolean,
	isResuming: boolean,
): Promise<InitialLeaderboardResult> {
	const config = getConfig();
	const generatorSlugs = getModelsForRole("generators");
	const INITIAL_LEADERBOARD = config.tournament.initialLeaderboard;
	const leaderboardJudges = getInitialLeaderboardJudges();

	console.log("Phase 2/6: Ranking initial drafts for seeding...");

	const selectedByModel = new Map<ModelSlug, GenerateResult>();

	// Build standings map
	const draftStandings = new Map<string, DraftStanding>();
	for (const modelSlug of generatorSlugs) {
		const drafts = draftsByModel.get(modelSlug) ?? [];
		const shortName = getShortModelName(modelSlug);
		drafts.forEach((draft, idx) => {
			draftStandings.set(`${shortName}_draft${idx + 1}`, {
				model: modelSlug,
				draftIndex: idx + 1,
				text: draft.text,
				result: draft,
				points: 0,
				wins: 0,
				draws: 0,
				losses: 0,
			});
		});
	}

	// Resume from state if available
	const resumeSelected =
		isResuming &&
		isPhaseCompleted(state, "initial_leaderboard") &&
		state.selectedDrafts;

	if (resumeSelected) {
		for (const [model, draft] of state.selectedDrafts as Map<
			ModelSlug,
			StoredGenerateResult
		>) {
			selectedByModel.set(model, draft as GenerateResult);
		}
		console.log(
			"  ↩︎ Loaded initial leaderboard winners from state (skipping ranking)\n",
		);
		return { selectedByModel };
	}

	// If leaderboard disabled or no judges, just take first draft
	if (!INITIAL_LEADERBOARD.enabled || leaderboardJudges.length === 0) {
		for (const modelSlug of generatorSlugs) {
			const drafts = draftsByModel.get(modelSlug) ?? [];
			if (drafts[0]) {
				selectedByModel.set(modelSlug, drafts[0]!);
			}
		}
		console.log(
			`  ✓ ${
				INITIAL_LEADERBOARD.enabled && leaderboardJudges.length === 0
					? "Initial leaderboard skipped (no judges configured)"
					: "Initial leaderboard disabled"
			}\n`,
		);
	} else {
		// Run round robin
		const draftIds = Array.from(draftStandings.keys());
		const pairs: [string, string][] = [];
		for (let i = 0; i < draftIds.length; i++) {
			for (let j = i + 1; j < draftIds.length; j++) {
				pairs.push([draftIds[i]!, draftIds[j]!]);
			}
		}

		console.log(
			`  Running ${pairs.length} matchups with judges: ${leaderboardJudges.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "high"})`).join(", ")}`,
		);

		if (dryRun) {
			// Mock matchups
			for (const [idA, idB] of pairs) {
				const outcome = Math.random();
				if (outcome < 0.4) {
					draftStandings.get(idA)!.points += 1;
					draftStandings.get(idA)!.wins += 1;
					draftStandings.get(idB)!.losses += 1;
				} else if (outcome < 0.8) {
					draftStandings.get(idB)!.points += 1;
					draftStandings.get(idB)!.wins += 1;
					draftStandings.get(idA)!.losses += 1;
				} else {
					draftStandings.get(idA)!.points += 0.5;
					draftStandings.get(idB)!.points += 0.5;
					draftStandings.get(idA)!.draws += 1;
					draftStandings.get(idB)!.draws += 1;
				}
			}
		} else {
			// Real API calls
			const leaderboardPromises = pairs.map(async ([idA, idB]) => {
				const a = draftStandings.get(idA)!;
				const b = draftStandings.get(idB)!;
				const swapped = Math.random() > 0.5;
				const [firstId, secondId] = swapped ? [idB, idA] : [idA, idB];
				const [firstText, secondText] = swapped
					? [b.text, a.text]
					: [a.text, b.text];

				const judgeResults = await Promise.all(
					leaderboardJudges.map((judge) =>
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

				const voteCounts = new Map<string, number>([
					[firstId, 0],
					[secondId, 0],
				]);
				for (const result of judgeResults) {
					const winner = result.winner === "S1" ? firstId : secondId;
					voteCounts.set(winner, (voteCounts.get(winner) ?? 0) + 1);
				}

				const votes = Array.from(voteCounts.entries());
				votes.sort((a, b) => b[1]! - a[1]!);
				const topCount = votes[0]![1];
				const topWinners = votes
					.filter(([, count]) => count === topCount)
					.map(([id]) => id);

				if (topWinners.length === 1) {
					const winner = topWinners[0]!;
					const loser = winner === firstId ? secondId : firstId;
					draftStandings.get(winner)!.points += 1;
					draftStandings.get(winner)!.wins += 1;
					draftStandings.get(loser)!.losses += 1;
				} else {
					draftStandings.get(firstId)!.points += 0.5;
					draftStandings.get(secondId)!.points += 0.5;
					draftStandings.get(firstId)!.draws += 1;
					draftStandings.get(secondId)!.draws += 1;
				}

				if (initialLeaderboardLogPath) {
					let logEntry = `- ${idA} vs ${idB}: `;
					if (topWinners.length === 1) {
						const winnerVotes = voteCounts.get(topWinners[0]!) ?? 0;
						const loserVotes =
							voteCounts.get(topWinners[0] === firstId ? secondId : firstId) ??
							0;
						logEntry += `**${topWinners[0]}** wins (${winnerVotes}-${loserVotes})`;
					} else {
						logEntry += `**DRAW** (${voteCounts.get(firstId)}-${voteCounts.get(secondId)})`;
					}
					logEntry += "\n";
					for (const result of judgeResults) {
						const resolvedWinner = result.winner === "S1" ? firstId : secondId;
						logEntry += `  - ${getShortModelName(result.judge)} picked ${resolvedWinner}: *${result.reasoning}*\n`;
					}
					await appendFile(initialLeaderboardLogPath, logEntry, "utf-8");
				}
			});

			await Promise.all(leaderboardPromises);
		}

		// Sort and select winners
		const sortedStandings = Array.from(draftStandings.entries()).sort(
			(a, b) => {
				if (b[1].points !== a[1].points) return b[1].points - a[1].points;
				if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
				return a[1].draftIndex - b[1].draftIndex;
			},
		);

		const winners = new Map<ModelSlug, DraftStanding>();
		for (const [, standing] of sortedStandings) {
			if (!winners.has(standing.model)) {
				winners.set(standing.model, standing);
				selectedByModel.set(standing.model, standing.result);
			}
		}

		// Write standings
		if (!dryRun && initialLeaderboardLogPath) {
			await appendFile(
				initialLeaderboardLogPath,
				"\n## Standings\n\n",
				"utf-8",
			);
			await appendFile(
				initialLeaderboardLogPath,
				"| Rank | Draft | Model | Points | W | D | L |\n",
				"utf-8",
			);
			await appendFile(
				initialLeaderboardLogPath,
				"|------|-------|-------|--------|---|---|---|\n",
				"utf-8",
			);
			for (let i = 0; i < sortedStandings.length; i++) {
				const [id, s] = sortedStandings[i]!;
				await appendFile(
					initialLeaderboardLogPath,
					`| ${i + 1} | ${id} | ${getShortModelName(s.model)} | ${s.points} | ${s.wins} | ${s.draws} | ${s.losses} |\n`,
					"utf-8",
				);
			}
		}

		console.log(
			`  ✓ Selected winners: ${generatorSlugs
				.map(
					(m) =>
						`${getShortModelName(m)} draft ${winners.get(m)?.draftIndex ?? 1}`,
				)
				.join(", ")}\n`,
		);
	}

	// Save state
	if (!dryRun && !resumeSelected) {
		state.selectedDrafts = selectedByModel as Map<string, StoredGenerateResult>;
		markPhaseCompleted(state, "initial_leaderboard");
		saveState(runDir, state);
	}

	return { selectedByModel };
}
