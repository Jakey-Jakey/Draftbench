import { existsSync, readFileSync } from "node:fs";
import { parse as parseTOML } from "smol-toml";
import type {
	InitialLeaderboardStyle,
	PipelineConfig,
	PromptsConfig,
	RatingBackend,
	RoleEntry,
	RolesConfig,
	SchedulingMode,
	TournamentConfig,
} from "./types";

export function deepMerge(
	target: PipelineConfig,
	source: Partial<PipelineConfig>,
): PipelineConfig {
	const result = { ...target };

	if (source.roles) {
		result.roles = {
			...target.roles,
			...source.roles,
		};
	}

	if (source.tournament) {
		result.tournament = {
			...target.tournament,
			...source.tournament,
			initialLeaderboard: {
				...target.tournament.initialLeaderboard,
				...source.tournament.initialLeaderboard,
			},
			rating: {
				...target.tournament.rating,
				...source.tournament.rating,
			},
			scheduling: {
				...target.tournament.scheduling,
				...source.tournament.scheduling,
			},
			stopRules: {
				...target.tournament.stopRules,
				...source.tournament.stopRules,
			},
			finale: {
				...target.tournament.finale,
				...source.tournament.finale,
			},
		};
	}

	if (source.output) {
		result.output = { ...target.output, ...source.output };
	}

	if (source.concurrency) {
		result.concurrency = { ...target.concurrency, ...source.concurrency };
	}

	if (source.prompts) {
		result.prompts = {
			generate: { ...target.prompts.generate, ...source.prompts.generate },
			review: { ...target.prompts.review, ...source.prompts.review },
			revise: { ...target.prompts.revise, ...source.prompts.revise },
			judgePairwise: {
				...target.prompts.judgePairwise,
				...source.prompts.judgePairwise,
			},
			judgeThreeWay: {
				...target.prompts.judgeThreeWay,
				...source.prompts.judgeThreeWay,
			},
		};
	}

	return result;
}

export function parseTOMLConfig(content: string): Partial<PipelineConfig> {
	const raw = parseTOML(content) as Record<string, unknown>;
	const result: Partial<PipelineConfig> = {};
	const knownTopLevelKeys = new Set([
		"roles",
		"tournament",
		"output",
		"concurrency",
		"prompts",
	]);
	for (const key of Object.keys(raw)) {
		if (!knownTopLevelKeys.has(key)) {
			console.warn(`⚠️ Unknown config key ignored: ${key}`);
		}
	}

	if (raw.roles) {
		const rolesRaw = raw.roles as Record<string, unknown>;
		result.roles = {} as RolesConfig;
		if (Object.hasOwn(rolesRaw, "swissJudge")) {
			throw new Error(
				"roles.swissJudge is no longer supported. Use [[roles.swissJudges]] instead.",
			);
		}
		const knownRoleKeys = new Set([
			"generators",
			"reviewers",
			"revisers",
			"swissJudges",
			"coarseJudges",
			"finaleJudges",
			"fineJudges",
			"playoffJudges",
			"initialLeaderboardJudges",
			"firstDraftSelectionJudges",
		]);
		for (const key of Object.keys(rolesRaw)) {
			if (!knownRoleKeys.has(key)) {
				console.warn(`⚠️ Unknown roles key ignored: roles.${key}`);
			}
		}

		if (rolesRaw.generators) {
			result.roles.generators = rolesRaw.generators as RoleEntry[];
		}
		if (rolesRaw.reviewers) {
			result.roles.reviewers = rolesRaw.reviewers as RoleEntry[];
		}
		if (rolesRaw.revisers) {
			result.roles.revisers = rolesRaw.revisers as RoleEntry[];
		}
		if (rolesRaw.coarseJudges) {
			if (rolesRaw.swissJudges) {
				console.warn(
					"⚠️ Both [[roles.coarseJudges]] and [[roles.swissJudges]] are set; using [[roles.coarseJudges]].",
				);
			}
			result.roles.swissJudges = rolesRaw.coarseJudges as RoleEntry[];
		} else if (rolesRaw.swissJudges) {
			console.warn(
				"⚠️ Deprecated config key [[roles.swissJudges]] detected; please rename to [[roles.coarseJudges]].",
			);
			result.roles.swissJudges = rolesRaw.swissJudges as RoleEntry[];
		}

		if (rolesRaw.fineJudges) {
			if (rolesRaw.finaleJudges) {
				console.warn(
					"⚠️ Both [[roles.fineJudges]] and [[roles.finaleJudges]] are set; using [[roles.fineJudges]].",
				);
			}
			result.roles.finaleJudges = rolesRaw.fineJudges as RoleEntry[];
		} else if (rolesRaw.finaleJudges) {
			console.warn(
				"⚠️ Deprecated config key [[roles.finaleJudges]] detected; please rename to [[roles.fineJudges]].",
			);
			result.roles.finaleJudges = rolesRaw.finaleJudges as RoleEntry[];
		}

		if (rolesRaw.playoffJudges) {
			if (!rolesRaw.fineJudges && !rolesRaw.finaleJudges) {
				console.warn(
					"⚠️ Deprecated config key roles.playoffJudges detected; please rename to [[roles.fineJudges]].",
				);
				result.roles.finaleJudges = rolesRaw.playoffJudges as RoleEntry[];
			} else {
				console.warn(
					"⚠️ Deprecated config key roles.playoffJudges ignored because fine judges are set.",
				);
			}
		}

		if (rolesRaw.firstDraftSelectionJudges) {
			if (rolesRaw.initialLeaderboardJudges) {
				console.warn(
					"⚠️ Both [[roles.firstDraftSelectionJudges]] and [[roles.initialLeaderboardJudges]] are set; using [[roles.firstDraftSelectionJudges]].",
				);
			}
			result.roles.initialLeaderboardJudges =
				rolesRaw.firstDraftSelectionJudges as RoleEntry[];
		} else if (rolesRaw.initialLeaderboardJudges) {
			console.warn(
				"⚠️ Deprecated config key [[roles.initialLeaderboardJudges]] detected; please rename to [[roles.firstDraftSelectionJudges]].",
			);
			result.roles.initialLeaderboardJudges =
				rolesRaw.initialLeaderboardJudges as RoleEntry[];
		}
	}

	if (raw.tournament) {
		const tournamentRaw = raw.tournament as Record<string, unknown>;
		result.tournament = {} as TournamentConfig;
		const knownTournamentKeys = new Set([
			"swissRounds",
			"coarseRounds",
			"initialGenerations",
			"swissFormat",
			"coarseFormat",
			"initialLeaderboard",
			"firstDraftSelection",
			"rating",
			"scheduling",
			"stopRules",
			"finale",
			"fineRanking",
			"playoffSize",
			"disambiguation",
		]);
		for (const key of Object.keys(tournamentRaw)) {
			if (!knownTournamentKeys.has(key)) {
				console.warn(`⚠️ Unknown tournament key ignored: tournament.${key}`);
			}
		}

		if (tournamentRaw.coarseRounds !== undefined) {
			if (tournamentRaw.swissRounds !== undefined) {
				console.warn(
					"⚠️ Both tournament.coarseRounds and tournament.swissRounds are set; using tournament.coarseRounds.",
				);
			}
			result.tournament.swissRounds = tournamentRaw.coarseRounds as number;
		} else if (tournamentRaw.swissRounds !== undefined) {
			console.warn(
				"⚠️ Deprecated config key tournament.swissRounds detected; please rename to tournament.coarseRounds.",
			);
			result.tournament.swissRounds = tournamentRaw.swissRounds as number;
		}

		const deprecatedPlayoffSize =
			tournamentRaw.playoffSize !== undefined
				? (tournamentRaw.playoffSize as number)
				: undefined;
		if (deprecatedPlayoffSize !== undefined) {
			console.warn(
				"⚠️ Deprecated config key tournament.playoffSize detected; please remove it and use tournament.stopRules.topK instead.",
			);
		}

		if (tournamentRaw.initialGenerations !== undefined) {
			console.warn(
				"⚠️ Deprecated config key tournament.initialGenerations detected; please move this to tournament.firstDraftSelection.initialGenerations.",
			);
			result.tournament.initialGenerations =
				tournamentRaw.initialGenerations as number;
		}

		if (tournamentRaw.coarseFormat !== undefined) {
			if (tournamentRaw.swissFormat !== undefined) {
				console.warn(
					"⚠️ Both tournament.coarseFormat and tournament.swissFormat are set; using tournament.coarseFormat.",
				);
			}
			result.tournament.swissFormat = tournamentRaw.coarseFormat as
				| "1v1"
				| "1v1v1";
		} else if (tournamentRaw.swissFormat !== undefined) {
			console.warn(
				"⚠️ Deprecated config key tournament.swissFormat detected; please rename to tournament.coarseFormat.",
			);
			result.tournament.swissFormat = tournamentRaw.swissFormat as
				| "1v1"
				| "1v1v1";
		}

		const firstDraftSelectionRaw = tournamentRaw.firstDraftSelection
			? (tournamentRaw.firstDraftSelection as Record<string, unknown>)
			: null;
		const initialLeaderboardRaw = tournamentRaw.initialLeaderboard
			? (tournamentRaw.initialLeaderboard as Record<string, unknown>)
			: null;
		if (firstDraftSelectionRaw) {
			if (initialLeaderboardRaw) {
				console.warn(
					"⚠️ Both [tournament.firstDraftSelection] and [tournament.initialLeaderboard] are set; using [tournament.firstDraftSelection].",
				);
			}
			result.tournament.initialLeaderboard = {
				enabled: firstDraftSelectionRaw.enabled as boolean,
				style: firstDraftSelectionRaw.style as
					| InitialLeaderboardStyle
					| undefined,
			};
			if (firstDraftSelectionRaw.initialGenerations !== undefined) {
				if (tournamentRaw.initialGenerations !== undefined) {
					console.warn(
						"⚠️ Both tournament.initialGenerations and tournament.firstDraftSelection.initialGenerations are set; using tournament.firstDraftSelection.initialGenerations.",
					);
				}
				result.tournament.initialGenerations =
					firstDraftSelectionRaw.initialGenerations as number;
			}
		} else if (initialLeaderboardRaw) {
			console.warn(
				"⚠️ Deprecated config section [tournament.initialLeaderboard] detected; please rename to [tournament.firstDraftSelection].",
			);
			result.tournament.initialLeaderboard = {
				enabled: initialLeaderboardRaw.enabled as boolean,
				style: initialLeaderboardRaw.style as InitialLeaderboardStyle | undefined,
			};
		}

		if (tournamentRaw.rating) {
			const ratingRaw = tournamentRaw.rating as Record<string, unknown>;
			result.tournament.rating = {} as TournamentConfig["rating"];
			if (ratingRaw.enabled !== undefined) {
				result.tournament.rating.enabled = ratingRaw.enabled as boolean;
			}
			if (ratingRaw.backend !== undefined) {
				result.tournament.rating.backend = ratingRaw.backend as RatingBackend;
			}
			if (ratingRaw.kFactor !== undefined) {
				result.tournament.rating.kFactor = ratingRaw.kFactor as number;
			}
			if (ratingRaw.initialRating !== undefined) {
				result.tournament.rating.initialRating = ratingRaw.initialRating as number;
			}
			if (ratingRaw.provisionalMatches !== undefined) {
				result.tournament.rating.provisionalMatches =
					ratingRaw.provisionalMatches as number;
			}
			if (ratingRaw.tieValue !== undefined) {
				result.tournament.rating.tieValue = ratingRaw.tieValue as number;
			}
			if (ratingRaw.btIterations !== undefined) {
				result.tournament.rating.btIterations = ratingRaw.btIterations as number;
			}
			if (ratingRaw.btTolerance !== undefined) {
				result.tournament.rating.btTolerance = ratingRaw.btTolerance as number;
			}
			if (ratingRaw.ciBootstrapSamples !== undefined) {
				result.tournament.rating.ciBootstrapSamples =
					ratingRaw.ciBootstrapSamples as number;
			}
		}

		if (tournamentRaw.scheduling) {
			const schedulingRaw = tournamentRaw.scheduling as Record<string, unknown>;
			result.tournament.scheduling = {} as TournamentConfig["scheduling"];
			if (schedulingRaw.mode !== undefined) {
				result.tournament.scheduling.mode =
					schedulingRaw.mode as SchedulingMode;
			}
			if (schedulingRaw.exploration !== undefined) {
				result.tournament.scheduling.exploration =
					schedulingRaw.exploration as number;
			}
			if (schedulingRaw.avoidRepeatPenalty !== undefined) {
				result.tournament.scheduling.avoidRepeatPenalty =
					schedulingRaw.avoidRepeatPenalty as number;
			}
			if (schedulingRaw.maxRepeatPairs !== undefined) {
				result.tournament.scheduling.maxRepeatPairs =
					schedulingRaw.maxRepeatPairs as number;
			}
		}

		if (tournamentRaw.stopRules) {
			const stopRulesRaw = tournamentRaw.stopRules as Record<string, unknown>;
			result.tournament.stopRules = {} as TournamentConfig["stopRules"];
			if (stopRulesRaw.enabled !== undefined) {
				result.tournament.stopRules.enabled = stopRulesRaw.enabled as boolean;
			}
			if (stopRulesRaw.minBatches !== undefined) {
				result.tournament.stopRules.minBatches = stopRulesRaw.minBatches as number;
			}
			if (stopRulesRaw.maxBatches !== undefined) {
				result.tournament.stopRules.maxBatches = stopRulesRaw.maxBatches as number;
			}
			if (stopRulesRaw.topK !== undefined) {
				result.tournament.stopRules.topK = stopRulesRaw.topK as number;
			}
			if (stopRulesRaw.minSeparation !== undefined) {
				result.tournament.stopRules.minSeparation =
					stopRulesRaw.minSeparation as number;
			}
			if (stopRulesRaw.confidence !== undefined) {
				result.tournament.stopRules.confidence = stopRulesRaw.confidence as number;
			}
			if (stopRulesRaw.stabilityBatches !== undefined) {
				result.tournament.stopRules.stabilityBatches =
					stopRulesRaw.stabilityBatches as number;
			}
			if (stopRulesRaw.budgetMaxCalls !== undefined) {
				result.tournament.stopRules.budgetMaxCalls =
					stopRulesRaw.budgetMaxCalls as number;
			}
		}

		const fineRankingRaw = tournamentRaw.fineRanking
			? (tournamentRaw.fineRanking as Record<string, unknown>)
			: null;
		const finaleRaw = tournamentRaw.finale
			? (tournamentRaw.finale as Record<string, unknown>)
			: null;
		if (fineRankingRaw || finaleRaw) {
			if (fineRankingRaw && finaleRaw) {
				console.warn(
					"⚠️ Both [tournament.fineRanking] and [tournament.finale] are set; using [tournament.fineRanking].",
				);
			}
			const rawObj = fineRankingRaw ?? finaleRaw ?? {};
			if (!fineRankingRaw && finaleRaw) {
				console.warn(
					"⚠️ Deprecated config section [tournament.finale] detected; please rename to [tournament.fineRanking].",
				);
			}
			result.tournament.finale = {} as TournamentConfig["finale"];
			if (rawObj.enabled !== undefined) {
				result.tournament.finale.enabled = rawObj.enabled as boolean;
			}
			if (rawObj.maxMatchesPerBatch !== undefined) {
				result.tournament.finale.maxMatchesPerBatch =
					rawObj.maxMatchesPerBatch as number;
			}
			if (rawObj.maxTotalMatches !== undefined) {
				result.tournament.finale.maxTotalMatches = rawObj.maxTotalMatches as number;
			}
			if (rawObj.targetWinProb !== undefined) {
				result.tournament.finale.targetWinProb = rawObj.targetWinProb as number;
			}
			if (rawObj.confidence !== undefined) {
				result.tournament.finale.confidence = rawObj.confidence as number;
			}
			if (rawObj.minSeparation !== undefined) {
				result.tournament.finale.minSeparation = rawObj.minSeparation as number;
			}
			if (rawObj.allowOverRepeatCap !== undefined) {
				result.tournament.finale.allowOverRepeatCap =
					rawObj.allowOverRepeatCap as boolean;
			}
		}

		if (
			deprecatedPlayoffSize !== undefined &&
			(result.tournament.stopRules?.topK === undefined ||
				result.tournament.stopRules.topK === null)
		) {
			if (!result.tournament.stopRules) {
				result.tournament.stopRules = {} as TournamentConfig["stopRules"];
			}
			result.tournament.stopRules.topK = deprecatedPlayoffSize;
		}

		if (tournamentRaw.disambiguation && !result.tournament.finale) {
			console.warn(
				"⚠️ Deprecated config section tournament.disambiguation detected; please rename it to tournament.fineRanking.",
			);
			const disRaw = tournamentRaw.disambiguation as Record<string, unknown>;
			result.tournament.finale = {} as TournamentConfig["finale"];
			if (disRaw.enabled !== undefined) {
				result.tournament.finale.enabled = disRaw.enabled as boolean;
			}
			if (disRaw.maxMatchesPerSwissRound !== undefined) {
				result.tournament.finale.maxMatchesPerBatch =
					disRaw.maxMatchesPerSwissRound as number;
			}
			if (disRaw.maxTotalMatches !== undefined) {
				result.tournament.finale.maxTotalMatches = disRaw.maxTotalMatches as number;
			}
			if (disRaw.targetWinProb !== undefined) {
				result.tournament.finale.targetWinProb = disRaw.targetWinProb as number;
			}
			if (disRaw.allowOverRepeatCap !== undefined) {
				result.tournament.finale.allowOverRepeatCap =
					disRaw.allowOverRepeatCap as boolean;
			}
			result.tournament.finale.confidence =
				(result.tournament.stopRules?.confidence as number | undefined) ?? 0.9;
			result.tournament.finale.minSeparation = 0;
		}
	}

	if (raw.output) {
		const outputRaw = raw.output as Record<string, unknown>;
		if (typeof outputRaw.runsDirectory === "string") {
			result.output = {
				runsDirectory: outputRaw.runsDirectory,
			};
		}
	}

	if (raw.concurrency) {
		const concurrencyRaw = raw.concurrency as Record<string, unknown>;
		if (typeof concurrencyRaw.maxParallel === "number") {
			result.concurrency = {
				maxParallel: concurrencyRaw.maxParallel,
			};
		}
	}

	if (raw.prompts) {
		const promptsRaw = raw.prompts as Record<string, Record<string, string>>;
		result.prompts = {} as PromptsConfig;

		if (promptsRaw.generate) {
			result.prompts.generate = promptsRaw.generate as {
				system: string;
				user: string;
			};
		}
		if (promptsRaw.review) {
			result.prompts.review = promptsRaw.review as {
				system: string;
				userTemplate: string;
			};
		}
		if (promptsRaw.revise) {
			result.prompts.revise = promptsRaw.revise as {
				system: string;
				userTemplate: string;
			};
		}
		if (promptsRaw.judgePairwise) {
			result.prompts.judgePairwise = promptsRaw.judgePairwise as {
				system: string;
				userTemplate: string;
			};
		}
		if (promptsRaw.judgeThreeWay) {
			result.prompts.judgeThreeWay = promptsRaw.judgeThreeWay as {
				system: string;
				userTemplate: string;
			};
		}
	}

	return result;
}

function parsePromptsTOML(content: string): Partial<PromptsConfig> {
	const raw = parseTOML(content) as Record<string, Record<string, string>>;
	const result: Partial<PromptsConfig> = {};

	if (raw.generate) {
		result.generate = {
			system: raw.generate.system ?? "",
			user: raw.generate.user ?? "",
		};
	}
	if (raw.review) {
		result.review = {
			system: raw.review.system ?? "",
			userTemplate: raw.review.userTemplate ?? "",
		};
	}
	if (raw.revise) {
		result.revise = {
			system: raw.revise.system ?? "",
			userTemplate: raw.revise.userTemplate ?? "",
		};
	}
	if (raw.judgePairwise) {
		result.judgePairwise = {
			system: raw.judgePairwise.system ?? "",
			userTemplate: raw.judgePairwise.userTemplate ?? "",
		};
	}
	if (raw.judgeThreeWay) {
		result.judgeThreeWay = {
			system: raw.judgeThreeWay.system ?? "",
			userTemplate: raw.judgeThreeWay.userTemplate ?? "",
		};
	}

	return result;
}

export function loadPrompts(promptsPath: string): Partial<PromptsConfig> {
	if (!existsSync(promptsPath)) {
		throw new Error(`Prompts file not found: ${promptsPath}`);
	}

	const content = readFileSync(promptsPath, "utf-8");
	return parsePromptsTOML(content);
}
