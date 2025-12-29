import { appendFile } from "node:fs/promises";
import {
	type GenerateResult,
	judgeStatblocks,
	type ModelSlug,
	pairwiseJudge,
} from "../aiClient";
import {
	getConfig,
	getInitialLeaderboardJudges,
	getModelsForRole,
	getSwissJudge,
	type InitialLeaderboardStyle,
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
 * Determines the effective style based on config and draft count.
 * Defaults to per-model-pairwise if initialGenerations > 1.
 */
function getEffectiveStyle(
	configStyle: InitialLeaderboardStyle | undefined,
	initialGenerations: number,
): InitialLeaderboardStyle {
	// If only 1 generation, no tournament needed
	if (initialGenerations <= 1) {
		return "per-model-pairwise"; // Will be skipped anyway
	}
	return configStyle ?? "per-model-pairwise";
}

/**
 * Runs pairwise tournament for a single model's drafts.
 */
async function runPerModelPairwise(
	modelSlug: ModelSlug,
	drafts: GenerateResult[],
	leaderboardJudges: { model: string; effort?: string }[],
	dryRun: boolean,
	initialLeaderboardLogPath: string | null,
): Promise<{ winner: DraftStanding; standings: DraftStanding[] }> {
	const shortName = getShortModelName(modelSlug);
	const standings: DraftStanding[] = drafts.map((draft, idx) => ({
		model: modelSlug,
		draftIndex: idx + 1,
		text: draft.text,
		result: draft,
		points: 0,
		wins: 0,
		draws: 0,
		losses: 0,
	}));

	// Generate all pairs for this model's drafts
	const pairs: [number, number][] = [];
	for (let i = 0; i < standings.length; i++) {
		for (let j = i + 1; j < standings.length; j++) {
			pairs.push([i, j]);
		}
	}

	console.log(`  ${shortName}: ${pairs.length} matches`);

	if (dryRun) {
		// Mock matchups
		for (const [i, j] of pairs) {
			const outcome = Math.random();
			if (outcome < 0.4) {
				standings[i]!.points += 1;
				standings[i]!.wins += 1;
				standings[j]!.losses += 1;
			} else if (outcome < 0.8) {
				standings[j]!.points += 1;
				standings[j]!.wins += 1;
				standings[i]!.losses += 1;
			} else {
				standings[i]!.points += 0.5;
				standings[j]!.points += 0.5;
				standings[i]!.draws += 1;
				standings[j]!.draws += 1;
			}
		}
	} else {
		// Real API calls - all pairs in parallel
		await Promise.all(
			pairs.map(async ([i, j]) => {
				const a = standings[i]!;
				const b = standings[j]!;
				const swapped = Math.random() > 0.5;
				const [first, second] = swapped ? [b, a] : [a, b];

				const judgeResults = await Promise.all(
					leaderboardJudges.map((judge) =>
						pairwiseJudge(
							"S1",
							first.text,
							"S2",
							second.text,
							judge.model,
							(judge.effort as any) ?? "high",
						),
					),
				);

				const voteCounts = new Map<DraftStanding, number>([
					[first, 0],
					[second, 0],
				]);
				for (const result of judgeResults) {
					const winner = result.winner === "S1" ? first : second;
					voteCounts.set(winner, (voteCounts.get(winner) ?? 0) + 1);
				}

				const votes = Array.from(voteCounts.entries());
				votes.sort((x, y) => y[1]! - x[1]!);
				const topCount = votes[0]?.[1];
				const topWinners = votes
					.filter(([, count]) => count === topCount)
					.map(([standing]) => standing);

				if (topWinners.length === 1) {
					const winner = topWinners[0]!;
					const loser = winner === first ? second : first;
					winner.points += 1;
					winner.wins += 1;
					loser.losses += 1;
				} else {
					first.points += 0.5;
					second.points += 0.5;
					first.draws += 1;
					second.draws += 1;
				}

				// Log to file
				if (initialLeaderboardLogPath) {
					const idA = `${shortName}_draft${a.draftIndex}`;
					const idB = `${shortName}_draft${b.draftIndex}`;
					let logEntry = `- ${idA} vs ${idB}: `;
					if (topWinners.length === 1) {
						const winnerId = `${shortName}_draft${topWinners[0]?.draftIndex}`;
						logEntry += `**${winnerId}** wins`;
					} else {
						logEntry += "**DRAW**";
					}
					logEntry += "\n";
					await appendFile(initialLeaderboardLogPath, logEntry, "utf-8");
				}
			}),
		);
	}

	// Sort standings
	standings.sort((a, b) => {
		if (b.points !== a.points) return b.points - a.points;
		if (b.wins !== a.wins) return b.wins - a.wins;
		return a.draftIndex - b.draftIndex;
	});

	const winner = standings[0]!;
	console.log(
		`  ✓ ${shortName}: Draft ${winner.draftIndex} wins (${winner.wins}W/${winner.draws}D/${winner.losses}L)`,
	);

	return { winner, standings };
}

/**
 * Runs ranking-based selection for a single model using the Swiss judge.
 */
async function runPerModelRank(
	modelSlug: ModelSlug,
	drafts: GenerateResult[],
	swissJudge: { model: string; effort?: string },
	dryRun: boolean,
): Promise<{ winner: DraftStanding; standings: DraftStanding[] }> {
	const shortName = getShortModelName(modelSlug);
	const standings: DraftStanding[] = drafts.map((draft, idx) => ({
		model: modelSlug,
		draftIndex: idx + 1,
		text: draft.text,
		result: draft,
		points: 0,
		wins: 0,
		draws: 0,
		losses: 0,
	}));

	console.log(`  ${shortName}: 1 ranking call`);

	if (dryRun) {
		// Mock: random winner
		const winnerIdx = Math.floor(Math.random() * standings.length);
		standings[winnerIdx]!.points = 1;
		standings[winnerIdx]!.wins = 1;
	} else {
		// Real API call - single ranking
		const statblockMap = new Map<string, string>();
		for (const s of standings) {
			statblockMap.set(`Draft${s.draftIndex}`, s.text);
		}

		const result = await judgeStatblocks(
			swissJudge.model,
			statblockMap,
			(swissJudge.effort as any) ?? "high",
		);

		// Apply rankings to standings
		for (const ranking of result.rankings) {
			const draftNum = parseInt(ranking.id.replace("Draft", ""), 10);
			const standing = standings.find((s) => s.draftIndex === draftNum);
			if (standing) {
				standing.points =
					(standings.length - ranking.rank + 1) / standings.length;
			}
		}
	}

	// Sort standings
	standings.sort((a, b) => b.points - a.points);
	const winner = standings[0]!;
	console.log(`  ✓ ${shortName}: Draft ${winner.draftIndex} selected`);

	return { winner, standings };
}

/**
 * Phase 2: Optional initial leaderboard to pick the best draft per model.
 * Supports multiple styles: per-model-pairwise, global-pairwise, per-model-rank, global-rank.
 * State is saved after each model completes for granular resumability.
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
	const INITIAL_GENERATIONS = config.tournament.initialGenerations;
	const leaderboardJudges = getInitialLeaderboardJudges();
	const swissJudge = getSwissJudge();

	const style = getEffectiveStyle(
		INITIAL_LEADERBOARD.style,
		INITIAL_GENERATIONS,
	);

	console.log("Phase 2/6: Ranking initial drafts for seeding...");

	const selectedByModel = new Map<ModelSlug, GenerateResult>();

	// Resume from state if phase fully completed
	if (
		isResuming &&
		isPhaseCompleted(state, "initial_leaderboard") &&
		state.selectedDrafts
	) {
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

	// Handle disabled leaderboard or single generation
	if (!INITIAL_LEADERBOARD.enabled || INITIAL_GENERATIONS <= 1) {
		for (const modelSlug of generatorSlugs) {
			const drafts = draftsByModel.get(modelSlug) ?? [];
			if (drafts[0]) {
				selectedByModel.set(modelSlug, drafts[0]!);
			}
		}
		const reason =
			INITIAL_GENERATIONS <= 1
				? "Only 1 draft per model"
				: "Initial leaderboard disabled";
		console.log(`  ✓ ${reason} - using first drafts\n`);

		if (!dryRun) {
			state.selectedDrafts = selectedByModel as Map<
				string,
				StoredGenerateResult
			>;
			markPhaseCompleted(state, "initial_leaderboard");
			saveState(runDir, state);
		}
		return { selectedByModel };
	}

	// Handle no judges configured
	if (leaderboardJudges.length === 0 && !style.includes("rank")) {
		for (const modelSlug of generatorSlugs) {
			const drafts = draftsByModel.get(modelSlug) ?? [];
			if (drafts[0]) {
				selectedByModel.set(modelSlug, drafts[0]!);
			}
		}
		console.log("  ✓ No judges configured - using first drafts\n");

		if (!dryRun) {
			state.selectedDrafts = selectedByModel as Map<
				string,
				StoredGenerateResult
			>;
			markPhaseCompleted(state, "initial_leaderboard");
			saveState(runDir, state);
		}
		return { selectedByModel };
	}

	console.log(`  Style: ${style}`);

	// Load partially completed models from state
	const completedModels = new Set(state.completedLeaderboardModels ?? []);
	if (isResuming && state.selectedDrafts) {
		for (const [model, draft] of state.selectedDrafts as Map<
			ModelSlug,
			StoredGenerateResult
		>) {
			if (completedModels.has(model)) {
				selectedByModel.set(model, draft as GenerateResult);
				console.log(
					`  ↩︎ Loaded winner for ${getShortModelName(model)} from state`,
				);
			}
		}
	}

	// Initialize state fields if needed
	if (!state.selectedDrafts) {
		state.selectedDrafts = new Map<string, StoredGenerateResult>();
	}
	if (!state.initialLeaderboardResults) {
		state.initialLeaderboardResults = [];
	}
	if (!state.completedLeaderboardModels) {
		state.completedLeaderboardModels = [];
	}

	// Run tournaments based on style
	if (style === "per-model-pairwise") {
		// Run each model's tournament in parallel, returning results
		const modelPromises = generatorSlugs
			.filter((m) => !completedModels.has(m))
			.map(async (modelSlug) => {
				const drafts = draftsByModel.get(modelSlug) ?? [];
				if (drafts.length === 0) return null;

				const { winner } = await runPerModelPairwise(
					modelSlug,
					drafts,
					leaderboardJudges,
					dryRun,
					initialLeaderboardLogPath,
				);

				return {
					modelSlug,
					winner,
					totalDrafts: drafts.length,
				};
			});

		const results = await Promise.all(modelPromises);

		// Process results sequentially to avoid race conditions on state
		for (const result of results) {
			if (!result) continue;
			const { modelSlug, winner, totalDrafts } = result;

			selectedByModel.set(modelSlug, winner.result);

			if (!dryRun) {
				state.selectedDrafts?.set(
					modelSlug,
					winner.result as StoredGenerateResult,
				);
				state.completedLeaderboardModels.push(modelSlug);
				state.initialLeaderboardResults?.push({
					model: modelSlug,
					selectedDraftIndex: winner.draftIndex,
					wins: winner.wins,
					draws: winner.draws,
					losses: winner.losses,
					totalDrafts,
				});
				saveState(runDir, state);
				console.log(
					`  💾 State saved after ${getShortModelName(modelSlug)} tournament`,
				);
			}
		}
	} else if (style === "per-model-rank") {
		// Run each model's ranking in parallel, returning results
		const modelPromises = generatorSlugs
			.filter((m) => !completedModels.has(m))
			.map(async (modelSlug) => {
				const drafts = draftsByModel.get(modelSlug) ?? [];
				if (drafts.length === 0) return null;

				const { winner } = await runPerModelRank(
					modelSlug,
					drafts,
					swissJudge,
					dryRun,
				);

				return {
					modelSlug,
					winner,
					totalDrafts: drafts.length,
				};
			});

		const results = await Promise.all(modelPromises);

		// Process results sequentially to avoid race conditions on state
		for (const result of results) {
			if (!result) continue;
			const { modelSlug, winner, totalDrafts } = result;

			selectedByModel.set(modelSlug, winner.result);

			if (!dryRun) {
				state.selectedDrafts?.set(
					modelSlug,
					winner.result as StoredGenerateResult,
				);
				state.completedLeaderboardModels.push(modelSlug);
				state.initialLeaderboardResults?.push({
					model: modelSlug,
					selectedDraftIndex: winner.draftIndex,
					wins: 0,
					draws: 0,
					losses: 0,
					totalDrafts,
				});
				saveState(runDir, state);
			}
		}
	} else if (style === "global-pairwise") {
		// Legacy: global round robin (expensive but thorough)
		const allStandings = new Map<string, DraftStanding>();
		for (const modelSlug of generatorSlugs) {
			const drafts = draftsByModel.get(modelSlug) ?? [];
			const shortName = getShortModelName(modelSlug);
			drafts.forEach((draft, idx) => {
				allStandings.set(`${shortName}_draft${idx + 1}`, {
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

		const draftIds = Array.from(allStandings.keys());
		const pairs: [string, string][] = [];
		for (let i = 0; i < draftIds.length; i++) {
			for (let j = i + 1; j < draftIds.length; j++) {
				pairs.push([draftIds[i]!, draftIds[j]!]);
			}
		}

		console.log(`  Running ${pairs.length} global matchups`);

		// Run all pairs in parallel
		if (!dryRun) {
			await Promise.all(
				pairs.map(async ([idA, idB]) => {
					const a = allStandings.get(idA)!;
					const b = allStandings.get(idB)!;
					const swapped = Math.random() > 0.5;
					const [first, second] = swapped ? [b, a] : [a, b];
					const [_firstId, _secondId] = swapped ? [idB, idA] : [idA, idB];

					const judgeResults = await Promise.all(
						leaderboardJudges.map((judge) =>
							pairwiseJudge(
								"S1",
								first.text,
								"S2",
								second.text,
								judge.model,
								(judge.effort as any) ?? "high",
							),
						),
					);

					let firstVotes = 0;
					let secondVotes = 0;
					for (const result of judgeResults) {
						if (result.winner === "S1") firstVotes++;
						else secondVotes++;
					}

					if (firstVotes > secondVotes) {
						first.points += 1;
						first.wins += 1;
						second.losses += 1;
					} else if (secondVotes > firstVotes) {
						second.points += 1;
						second.wins += 1;
						first.losses += 1;
					} else {
						first.points += 0.5;
						second.points += 0.5;
						first.draws += 1;
						second.draws += 1;
					}
				}),
			);
		} else {
			// Mock
			for (const [idA, idB] of pairs) {
				const a = allStandings.get(idA)!;
				const b = allStandings.get(idB)!;
				const outcome = Math.random();
				if (outcome < 0.4) {
					a.points += 1;
					a.wins += 1;
					b.losses += 1;
				} else if (outcome < 0.8) {
					b.points += 1;
					b.wins += 1;
					a.losses += 1;
				} else {
					a.points += 0.5;
					b.points += 0.5;
					a.draws += 1;
					b.draws += 1;
				}
			}
		}

		// Select best per model
		const sorted = Array.from(allStandings.entries()).sort((a, b) => {
			if (b[1].points !== a[1].points) return b[1].points - a[1].points;
			if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
			return a[1].draftIndex - b[1].draftIndex;
		});

		for (const [, standing] of sorted) {
			if (!selectedByModel.has(standing.model)) {
				selectedByModel.set(standing.model, standing.result);
				if (!dryRun) {
					state.initialLeaderboardResults?.push({
						model: standing.model,
						selectedDraftIndex: standing.draftIndex,
						wins: standing.wins,
						draws: standing.draws,
						losses: standing.losses,
						totalDrafts: draftsByModel.get(standing.model)?.length ?? 0,
					});
				}
			}
		}
	} else if (style === "global-rank") {
		// Single ranking call for all drafts
		console.log("  Running 1 global ranking call");

		const statblockMap = new Map<string, string>();
		const idToStanding = new Map<string, DraftStanding>();

		for (const modelSlug of generatorSlugs) {
			const drafts = draftsByModel.get(modelSlug) ?? [];
			const shortName = getShortModelName(modelSlug);
			drafts.forEach((draft, idx) => {
				const id = `${shortName}_d${idx + 1}`;
				statblockMap.set(id, draft.text);
				idToStanding.set(id, {
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

		if (!dryRun) {
			const result = await judgeStatblocks(
				swissJudge.model,
				statblockMap,
				(swissJudge.effort as any) ?? "high",
			);

			// Assign points based on rank
			const total = statblockMap.size;
			for (const ranking of result.rankings) {
				const standing = idToStanding.get(ranking.id);
				if (standing) {
					standing.points = (total - ranking.rank + 1) / total;
				}
			}
		} else {
			// Mock: random points
			for (const standing of idToStanding.values()) {
				standing.points = Math.random();
			}
		}

		// Select best per model
		const sorted = Array.from(idToStanding.values()).sort(
			(a, b) => b.points - a.points,
		);

		for (const standing of sorted) {
			if (!selectedByModel.has(standing.model)) {
				selectedByModel.set(standing.model, standing.result);
				if (!dryRun) {
					state.initialLeaderboardResults?.push({
						model: standing.model,
						selectedDraftIndex: standing.draftIndex,
						wins: 0,
						draws: 0,
						losses: 0,
						totalDrafts: draftsByModel.get(standing.model)?.length ?? 0,
					});
				}
			}
		}
	}

	// Log selected winners
	console.log(
		`  ✓ Selected: ${generatorSlugs
			.map((m) => {
				const result = state.initialLeaderboardResults?.find(
					(r) => r.model === m,
				);
				return `${getShortModelName(m)} #${result?.selectedDraftIndex ?? 1}`;
			})
			.join(", ")}\n`,
	);

	// Mark phase completed
	if (!dryRun) {
		state.selectedDrafts = selectedByModel as Map<string, StoredGenerateResult>;
		markPhaseCompleted(state, "initial_leaderboard");
		saveState(runDir, state);
	}

	return { selectedByModel };
}
