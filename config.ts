import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseTOML } from "smol-toml";

// ============================================================================
// Configuration Types
// ============================================================================

export type ModelName = string;

/** Reasoning effort levels for LLM calls */
export type ReasoningEffort =
	| "xhigh"
	| "high"
	| "medium"
	| "low"
	| "minimal"
	| "none";

/** A role entry defines a model and its settings for that role */
export interface RoleEntry {
	/** OpenRouter model slug (e.g., "anthropic/claude-4.5-opus") */
	model: string;
	/** Reasoning effort for this role */
	effort?: ReasoningEffort;
	/** Optional temperature override */
	temperature?: number;
}

/** Role configuration - each role is an array of model entries */
export interface RolesConfig {
	/** Models that generate initial drafts */
	generators: RoleEntry[];
	/** Models that review drafts */
	reviewers: RoleEntry[];
	/** Models that revise drafts */
	revisers: RoleEntry[];
	/** Swiss tournament judges */
	swissJudges: RoleEntry[];
	/** Finale judges (multi-judge voting) */
	finaleJudges: RoleEntry[];
	/** Initial leaderboard judges (optional, defaults to finaleJudges) */
	initialLeaderboardJudges?: RoleEntry[];
}

/** Initial leaderboard tournament style */
export type InitialLeaderboardStyle =
	| "per-model-pairwise"
	| "global-pairwise"
	| "per-model-rank"
	| "global-rank";

export interface InitialLeaderboardConfig {
	enabled: boolean;
	/** Tournament style for selecting best draft per model. Default: per-model-pairwise */
	style?: InitialLeaderboardStyle;
}

export type RatingBackend = "elo" | "bradley-terry";
export type SchedulingMode = "adaptive" | "static";

export interface RatingConfig {
	enabled: boolean;
	backend: RatingBackend;
	kFactor: number;
	initialRating: number;
	provisionalMatches: number;
	tieValue: number;
	btIterations: number;
	btTolerance: number;
	ciBootstrapSamples: number;
}

export interface SchedulingConfig {
	mode: SchedulingMode;
	exploration: number;
	avoidRepeatPenalty: number;
	maxRepeatPairs: number;
}

export interface StopRulesConfig {
	enabled: boolean;
	minBatches: number;
	maxBatches: number;
	topK: number;
	minSeparation: number;
	confidence: number;
	stabilityBatches: number;
	budgetMaxCalls?: number;
}

export interface FinaleConfig {
	enabled: boolean;
	/** Parallelism within a single active-learning iteration (batch). */
	maxMatchesPerBatch: number;
	/** Budget cap for the entire finale phase. */
	maxTotalMatches: number;
	/** Target win probability for "most informative" matchups. Usually 0.5. */
	targetWinProb: number;
	/** CI separation confidence threshold for declaring adjacent ordering "settled". */
	confidence: number;
	/** Fallback rating gap threshold (0 disables). */
	minSeparation: number;
	/** If true, allows scheduling beyond scheduling.maxRepeatPairs. */
	allowOverRepeatCap: boolean;
}

export interface TournamentConfig {
	swissRounds: number;
	initialGenerations: number;
	initialLeaderboard: InitialLeaderboardConfig;
	/** Swiss match format: 1v1 (pairwise) or 1v1v1 (three-way). Default: 1v1v1 */
	swissFormat?: "1v1" | "1v1v1";
	rating: RatingConfig;
	scheduling: SchedulingConfig;
	stopRules: StopRulesConfig;
	finale: FinaleConfig;
}

export interface OutputConfig {
	runsDirectory: string;
}

export interface ConcurrencyConfig {
	/** Maximum parallel API calls. Null or omitted = unlimited. */
	maxParallel?: number | null;
}

export interface PromptsConfig {
	generate: {
		system: string;
		user: string;
	};
	review: {
		system: string;
		userTemplate: string; // {statblock} (alias: {artifact})
	};
	revise: {
		system: string;
		userTemplate: string; // {statblock} (alias: {artifact}), {feedback}
	};
	judgePairwise: {
		system: string;
		userTemplate: string; // {idA}, {idB}, {textA}, {textB}
	};
	judgeThreeWay: {
		system: string;
		userTemplate: string; // {idA}, {idB}, {idC}, {textA}, {textB}, {textC}
	};
}

export interface PipelineConfig {
	roles: RolesConfig;
	concurrency?: ConcurrencyConfig;
	tournament: TournamentConfig;
	output: OutputConfig;
	prompts: PromptsConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
	roles: {
		generators: [
			{ model: "openai/gpt-5.2", effort: "high" },
			{ model: "anthropic/claude-opus-4.5", effort: "high" },
			{ model: "google/gemini-3-pro-preview", effort: "high" },
		],
		reviewers: [
			{ model: "openai/gpt-5.2", effort: "high" },
			{ model: "anthropic/claude-opus-4.5", effort: "high" },
			{ model: "google/gemini-3-pro-preview", effort: "high" },
		],
		revisers: [
			{ model: "openai/gpt-5.2", effort: "high" },
			{ model: "anthropic/claude-opus-4.5", effort: "high" },
			{ model: "google/gemini-3-pro-preview", effort: "high" },
		],
		swissJudges: [{ model: "anthropic/claude-opus-4.5", effort: "low" }],
		finaleJudges: [
			{ model: "anthropic/claude-opus-4.5", effort: "low" },
			{ model: "openai/gpt-5.2", effort: "medium" },
		],
	},
	tournament: {
		swissRounds: 7,
		initialGenerations: 1,
		swissFormat: "1v1v1",
		initialLeaderboard: {
			enabled: false,
		},
		rating: {
			enabled: true,
			backend: "elo",
			kFactor: 24,
			initialRating: 1000,
			provisionalMatches: 5,
			tieValue: 0.5,
			btIterations: 200,
			btTolerance: 1e-6,
			ciBootstrapSamples: 200,
		},
		scheduling: {
			mode: "adaptive",
			exploration: 0.15,
			avoidRepeatPenalty: 0.35,
			maxRepeatPairs: 2,
		},
		stopRules: {
			enabled: true,
			minBatches: 3,
			maxBatches: 7,
			topK: 8,
			minSeparation: 65,
			confidence: 0.9,
			stabilityBatches: 2,
		},
		finale: {
			enabled: true,
			maxMatchesPerBatch: 4,
			maxTotalMatches: 30,
			targetWinProb: 0.5,
			confidence: 0.9,
			minSeparation: 0,
			allowOverRepeatCap: false,
		},
	},
	output: {
		runsDirectory: "runs",
	},
	prompts: {
		generate: {
			system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Create well constructed monster statblocks that follow official 5e formatting conventions. Include all standard statblock components: size/type/alignment, AC, HP, speed, ability scores, saving throws, skills, damage immunities/resistances/vulnerabilities, senses, languages, challenge rating, and special abilities/actions.`,
			user: `Create a D&D 5e monster statblock for Doctor Doom (Marvel Comics). This should be a powerful villain suitable for high-level play. Output only the statblock without commentary.`,
		},
		review: {
			system: `You are an expert D&D 5e game designer and balance consultant. Review the monster statblock provided and give constructive feedback on: mechanical balance, CR accuracy, thematic representation of the character, adherence to 5e formatting conventions, action economy, and potential gameplay issues. Be thorough but constructive. Focus on actionable improvements.`,
			userTemplate: `Please review the following D&D 5e monster statblock and provide feedback:\n\n{statblock}`,
		},
		revise: {
			system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Revise the provided monster statblock based on the feedback given.`,
			userTemplate: `Original statblock:\n{statblock}\n\nReview feedback:\n{feedback}\n\nPlease revise the statblock based on the feedback above. Output only the revised statblock without commentary.`,
		},
		judgePairwise: {
			system: `You are an expert D&D 5e game designer. Compare the two statblocks and pick the better one based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "winner": "ID of the better statblock",
  "reasoning": "One sentence explaining why."
}

The IDs are: "{idA}" and "{idB}". Pick exactly one winner.`,
			userTemplate: `Compare these two D&D 5e statblocks:

## Statblock: {idA}

{textA}

---

## Statblock: {idB}

{textB}`,
		},
		judgeThreeWay: {
			system: `You are an expert D&D 5e game designer. Compare the three statblocks and rank them from best to worst based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "first": "ID of the best statblock",
  "second": "ID of the second-best statblock",
  "third": "ID of the worst statblock",
  "reasoning": "One sentence explaining the ranking."
}

The IDs are: "{idA}", "{idB}", "{idC}". Rank all three.`,
			userTemplate: `Compare and rank these three D&D 5e statblocks:

## Statblock: {idA}

{textA}

---

## Statblock: {idB}

{textB}

---

## Statblock: {idC}

{textC}`,
		},
	},
};

// ============================================================================
// Configuration Loading
// ============================================================================

let loadedConfig: PipelineConfig | null = null;

const VALID_REASONING_EFFORTS: ReasoningEffort[] = [
	"xhigh",
	"high",
	"medium",
	"low",
	"minimal",
	"none",
];
const HIGH_CALL_VOLUME_THRESHOLD = 500;

interface ApiCallEstimate {
	generation: number;
	initialLeaderboard: number;
	review: number;
	revise: number;
	swiss: number;
	finale: number;
	total: number;
}

/**
 * Merge a complete PipelineConfig with a partial override to produce a new configuration with overrides applied.
 *
 * Arrays in `roles` are replaced entirely when provided; nested sections for `tournament` (including `initialLeaderboard`, `rating`, `scheduling`, `stopRules`, and `finale`), `prompts` (generate, review, revise, judgePairwise, judgeThreeWay), `output`, and `concurrency` are merged so that values from `source` overwrite those in `target`.
 *
 * @param target - The base PipelineConfig to merge into
 * @param source - Partial configuration whose values override those in `target`
 * @returns A new PipelineConfig with `source` values applied on top of `target`
 */
function deepMerge(
	target: PipelineConfig,
	source: Partial<PipelineConfig>,
): PipelineConfig {
	const result = { ...target };

	// Merge roles (replace arrays entirely if provided)
	if (source.roles) {
		result.roles = {
			...target.roles,
			...source.roles,
		};
	}

	// Merge tournament
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

	// Merge output
	if (source.output) {
		result.output = { ...target.output, ...source.output };
	}

	// Merge concurrency
	if (source.concurrency) {
		result.concurrency = { ...target.concurrency, ...source.concurrency };
	}

	// Merge prompts (nested)
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

function normalizeRoleEntry(
	entry: RoleEntry,
	label: string,
	warnings: string[],
): void {
	if (
		entry.effort !== undefined &&
		!VALID_REASONING_EFFORTS.includes(entry.effort)
	) {
		warnings.push(
			`Invalid effort "${entry.effort}" for ${label}; using role default effort instead.`,
		);
		delete entry.effort;
	}

	if (
		entry.temperature !== undefined &&
		(typeof entry.temperature !== "number" || Number.isNaN(entry.temperature))
	) {
		warnings.push(
			`Invalid temperature for ${label}; removing temperature override.`,
		);
		delete entry.temperature;
	}
}

/**
 * Normalize role entries in a PipelineConfig and collect warnings.
 *
 * Mutates the provided config: ensures `config.roles.swissJudges` is defined and normalizes entries in
 * `generators`, `reviewers`, `revisers`, `swissJudges`, `finaleJudges`, and `initialLeaderboardJudges`.
 *
 * @param config - Pipeline configuration to normalize (modified in-place)
 * @returns An array of warning messages produced during normalization
 */
function normalizeConfig(config: PipelineConfig): string[] {
	const warnings: string[] = [];
	config.roles.swissJudges = config.roles.swissJudges ?? [];

	config.roles.generators.forEach((entry, index) => {
		normalizeRoleEntry(entry, `roles.generators[${index}]`, warnings);
	});
	config.roles.reviewers.forEach((entry, index) => {
		normalizeRoleEntry(entry, `roles.reviewers[${index}]`, warnings);
	});
	config.roles.revisers.forEach((entry, index) => {
		normalizeRoleEntry(entry, `roles.revisers[${index}]`, warnings);
	});
	config.roles.swissJudges.forEach((entry, index) => {
		normalizeRoleEntry(entry, `roles.swissJudges[${index}]`, warnings);
	});
	config.roles.finaleJudges.forEach((entry, index) => {
		normalizeRoleEntry(entry, `roles.finaleJudges[${index}]`, warnings);
	});
	(config.roles.initialLeaderboardJudges ?? []).forEach((entry, index) => {
		normalizeRoleEntry(
			entry,
			`roles.initialLeaderboardJudges[${index}]`,
			warnings,
		);
	});

	return warnings;
}

/**
 * Estimate the number of API calls the pipeline will make for each stage using the provided configuration.
 *
 * @param config - The resolved PipelineConfig to base the estimation on
 * @returns An ApiCallEstimate object containing counts for `generation`, `initialLeaderboard`, `review`, `revise`, `swiss`, `finale`, and `total`
 */
function estimateApiCalls(config: PipelineConfig): ApiCallEstimate {
	const generatorCount = config.roles.generators.length;
	const reviewerCount = config.roles.reviewers.length;
	const reviserCount = config.roles.revisers.length;
	const swissJudgeCount = config.roles.swissJudges.length;
	const finaleJudgeCount = config.roles.finaleJudges.length;
	const initialGenerations = config.tournament.initialGenerations;
	const initialLeaderboardEnabled =
		config.tournament.initialLeaderboard.enabled;
	const initialLeaderboardStyle =
		config.tournament.initialLeaderboard.style ?? "per-model-pairwise";
	const initialLeaderboardJudgeCount =
		config.roles.initialLeaderboardJudges?.length ??
		config.roles.finaleJudges.length;

	const generation = generatorCount * initialGenerations;

	let initialLeaderboard = 0;
	if (initialLeaderboardEnabled && initialGenerations > 1) {
		if (initialLeaderboardStyle === "per-model-pairwise") {
			initialLeaderboard =
				generatorCount *
				((initialGenerations * (initialGenerations - 1)) / 2) *
				initialLeaderboardJudgeCount;
		} else if (initialLeaderboardStyle === "global-pairwise") {
			const totalDrafts = generatorCount * initialGenerations;
			initialLeaderboard =
				((totalDrafts * (totalDrafts - 1)) / 2) * initialLeaderboardJudgeCount;
		} else if (initialLeaderboardStyle === "per-model-rank") {
			initialLeaderboard = generatorCount;
		} else if (initialLeaderboardStyle === "global-rank") {
			initialLeaderboard = 1;
		}
	}

	const review = reviewerCount * generatorCount;
	const revise = review * reviserCount;
	const contestants = revise;
	const swissMatchesPerRound =
		(config.tournament.swissFormat ?? "1v1v1") === "1v1"
			? Math.floor(contestants / 2)
			: Math.floor(contestants / 3);
	const effectiveSwissBatches = config.tournament.stopRules.enabled
		? Math.min(
				config.tournament.swissRounds,
				config.tournament.stopRules.maxBatches,
			)
		: config.tournament.swissRounds;
	const swiss = swissMatchesPerRound * effectiveSwissBatches * swissJudgeCount;

	const finale =
		config.tournament.finale.enabled === true
			? config.tournament.finale.maxTotalMatches * finaleJudgeCount
			: 0;
	const total =
		generation + initialLeaderboard + review + revise + swiss + finale;

	return {
		generation,
		initialLeaderboard,
		review,
		revise,
		swiss,
		finale,
		total,
	};
}

/**
 * Parse a TOML pipeline configuration into the library's internal config shape.
 *
 * Parses supported top-level sections (roles, tournament, output, concurrency, prompts),
 * ignores unknown keys with a console warning, and applies best-effort migrations for
 * deprecated keys (for example, `roles.playoffJudges` -> `roles.finaleJudges` and
 * `tournament.playoffSize` -> `tournament.stopRules.topK`), emitting warnings when migrations occur.
 *
 * @returns A partial PipelineConfig constructed from the TOML content; unknown keys are omitted, and deprecated keys may be migrated with console warnings.
 */
function parseTOMLConfig(content: string): Partial<PipelineConfig> {
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

	// Parse roles
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

	// Parse tournament
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
			// Deprecated keys (migration)
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
						style: firstDraftSelectionRaw.style as InitialLeaderboardStyle | undefined,
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
			const knownRatingKeys = new Set([
				"enabled",
				"backend",
				"kFactor",
				"initialRating",
				"provisionalMatches",
				"tieValue",
				"btIterations",
				"btTolerance",
				"ciBootstrapSamples",
			]);
			for (const key of Object.keys(ratingRaw)) {
				if (!knownRatingKeys.has(key)) {
					console.warn(
						`⚠️ Unknown tournament.rating key ignored: tournament.rating.${key}`,
					);
				}
			}
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
				result.tournament.rating.initialRating =
					ratingRaw.initialRating as number;
			}
			if (ratingRaw.provisionalMatches !== undefined) {
				result.tournament.rating.provisionalMatches =
					ratingRaw.provisionalMatches as number;
			}
			if (ratingRaw.tieValue !== undefined) {
				result.tournament.rating.tieValue = ratingRaw.tieValue as number;
			}
			if (ratingRaw.btIterations !== undefined) {
				result.tournament.rating.btIterations =
					ratingRaw.btIterations as number;
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
			const knownSchedulingKeys = new Set([
				"mode",
				"exploration",
				"avoidRepeatPenalty",
				"maxRepeatPairs",
			]);
			for (const key of Object.keys(schedulingRaw)) {
				if (!knownSchedulingKeys.has(key)) {
					console.warn(
						`⚠️ Unknown tournament.scheduling key ignored: tournament.scheduling.${key}`,
					);
				}
			}
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
			const knownStopRulesKeys = new Set([
				"enabled",
				"minBatches",
				"maxBatches",
				"topK",
				"minSeparation",
				"confidence",
				"stabilityBatches",
				"budgetMaxCalls",
			]);
			for (const key of Object.keys(stopRulesRaw)) {
				if (!knownStopRulesKeys.has(key)) {
					console.warn(
						`⚠️ Unknown tournament.stopRules key ignored: tournament.stopRules.${key}`,
					);
				}
			}
			result.tournament.stopRules = {} as TournamentConfig["stopRules"];
			if (stopRulesRaw.enabled !== undefined) {
				result.tournament.stopRules.enabled = stopRulesRaw.enabled as boolean;
			}
			if (stopRulesRaw.minBatches !== undefined) {
				result.tournament.stopRules.minBatches =
					stopRulesRaw.minBatches as number;
			}
			if (stopRulesRaw.maxBatches !== undefined) {
				result.tournament.stopRules.maxBatches =
					stopRulesRaw.maxBatches as number;
			}
			if (stopRulesRaw.topK !== undefined) {
				result.tournament.stopRules.topK = stopRulesRaw.topK as number;
			}
			if (stopRulesRaw.minSeparation !== undefined) {
				result.tournament.stopRules.minSeparation =
					stopRulesRaw.minSeparation as number;
			}
			if (stopRulesRaw.confidence !== undefined) {
				result.tournament.stopRules.confidence =
					stopRulesRaw.confidence as number;
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
				const knownFinaleKeys = new Set([
					"enabled",
					"maxMatchesPerBatch",
					"maxTotalMatches",
					"targetWinProb",
					"confidence",
					"minSeparation",
					"allowOverRepeatCap",
				]);
				for (const key of Object.keys(rawObj)) {
					if (!knownFinaleKeys.has(key)) {
						console.warn(
							`⚠️ Unknown tournament.fineRanking key ignored: tournament.fineRanking.${key}`,
						);
					}
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
					result.tournament.finale.maxTotalMatches =
						rawObj.maxTotalMatches as number;
				}
				if (rawObj.targetWinProb !== undefined) {
					result.tournament.finale.targetWinProb =
						rawObj.targetWinProb as number;
				}
				if (rawObj.confidence !== undefined) {
					result.tournament.finale.confidence = rawObj.confidence as number;
				}
				if (rawObj.minSeparation !== undefined) {
					result.tournament.finale.minSeparation =
						rawObj.minSeparation as number;
				}
				if (rawObj.allowOverRepeatCap !== undefined) {
					result.tournament.finale.allowOverRepeatCap =
						rawObj.allowOverRepeatCap as boolean;
				}
			}

		// Migration: tournament.playoffSize -> tournament.stopRules.topK (only if topK not explicitly set)
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

			// Migration: tournament.disambiguation -> tournament.finale (best-effort mapping).
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
				result.tournament.finale.maxTotalMatches =
					disRaw.maxTotalMatches as number;
			}
			if (disRaw.targetWinProb !== undefined) {
				result.tournament.finale.targetWinProb = disRaw.targetWinProb as number;
			}
			if (disRaw.allowOverRepeatCap !== undefined) {
				result.tournament.finale.allowOverRepeatCap =
					disRaw.allowOverRepeatCap as boolean;
			}
			// Sensible defaults for fields that didn't exist on disambiguation.
			result.tournament.finale.confidence =
				(result.tournament.stopRules?.confidence as number | undefined) ?? 0.9;
			result.tournament.finale.minSeparation = 0;
		}
	}

	// Parse output
	if (raw.output) {
		const outputRaw = raw.output as Record<string, unknown>;
		if (typeof outputRaw.runsDirectory === "string") {
			result.output = {
				runsDirectory: outputRaw.runsDirectory,
			};
		}
	}

	// Parse concurrency
	if (raw.concurrency) {
		const concurrencyRaw = raw.concurrency as Record<string, unknown>;
		if (
			typeof concurrencyRaw.maxParallel === "number" ||
			concurrencyRaw.maxParallel === null
		) {
			result.concurrency = {
				maxParallel: concurrencyRaw.maxParallel,
			};
		}
	}

	// Parse prompts (nested structure)
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

/**
 * Parses prompts from a TOML file.
 */
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

/**
 * Loads prompts from a separate TOML file.
 */
export function loadPrompts(promptsPath: string): Partial<PromptsConfig> {
	if (!existsSync(promptsPath)) {
		throw new Error(`Prompts file not found: ${promptsPath}`);
	}

	const content = readFileSync(promptsPath, "utf-8");
	return parsePromptsTOML(content);
}

/**
 * Loads configuration from a TOML file, merging with defaults.
 * If no path provided, looks for config.toml in current directory.
 * If file doesn't exist, uses defaults.
 * @param configPath Path to config TOML file
 * @param promptsPath Optional path to separate prompts TOML file
 */
// Track which paths were used to load the current config (stores absolute paths)
let loadedPaths: { configPath: string; promptsPath: string } | null = null;

/**
 * Load the pipeline configuration by merging user TOML settings with the built-in defaults.
 *
 * If `configPath` is omitted the loader looks for `config.toml` in the current directory and falls back to defaults when absent; if `configPath` is provided and the file is missing or invalid an error is thrown. Prompts are loaded from `promptsPath` when supplied, otherwise `prompts.toml` in the current directory is used if present; a missing `promptsPath` that was explicitly provided will cause an error.
 *
 * @param configPath - Optional path to a configuration TOML file (defaults to `config.toml` when omitted)
 * @param promptsPath - Optional path to a separate prompts TOML file (defaults to `prompts.toml` when omitted)
 * @returns The merged PipelineConfig composed from defaults and any provided TOML configuration
 */
export function loadConfig(
	configPath?: string,
	promptsPath?: string,
): PipelineConfig {
	// Resolve paths to absolute to ensure consistent caching
	// Default to "config.toml" / "prompts.toml" if undefined, just like the loading logic below effectively does
	const effectiveConfigPath = resolve(configPath ?? "config.toml");
	const effectivePromptsPath = resolve(promptsPath ?? "prompts.toml");

	// If we have a cached config, check if the requested paths match what we loaded
	if (loadedConfig && loadedPaths) {
		const configPathMatch = loadedPaths.configPath === effectiveConfigPath;
		const promptsPathMatch = loadedPaths.promptsPath === effectivePromptsPath;

		if (configPathMatch && promptsPathMatch) {
			return loadedConfig;
		}
		// Paths changed, reload
		console.log("🔄 Config paths changed, reloading...");
	}

	const path = configPath ?? "config.toml";
	let userConfig: Partial<PipelineConfig> = {};

	if (existsSync(path)) {
		try {
			const content = readFileSync(path, "utf-8");
			userConfig = parseTOMLConfig(content);
			console.log(`📁 Loaded config from: ${path}`);
		} catch (e) {
			if (configPath) {
				const message = e instanceof Error ? e.message : String(e);
				throw new Error(`Failed to parse config file ${path}: ${message}`);
			}
			console.error(`⚠️ Failed to parse config file ${path}:`, e);
			console.log("   Using default configuration.");
		}
	} else if (configPath) {
		// User explicitly specified a config that doesn't exist
		throw new Error(`Config file not found: ${configPath}`);
	} else {
		console.log("📁 No config.toml found, using defaults.");
	}

	// deepMerge is mostly "structural" and normalizeConfig mutates fields in-place.
	// Clone defaults up front so we never mutate DEFAULT_CONFIG across loads.
	const mergedConfig = deepMerge(
		JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as PipelineConfig,
		userConfig,
	);

	// Load prompts from separate file
	// Priority: --prompts flag > prompts.toml in cwd > defaults
	const resolvedPromptsPath = promptsPath ?? "prompts.toml";
	if (existsSync(resolvedPromptsPath)) {
		try {
			const prompts = loadPrompts(resolvedPromptsPath);
			mergedConfig.prompts = {
				generate: { ...mergedConfig.prompts.generate, ...prompts.generate },
				review: { ...mergedConfig.prompts.review, ...prompts.review },
				revise: { ...mergedConfig.prompts.revise, ...prompts.revise },
				judgePairwise: {
					...mergedConfig.prompts.judgePairwise,
					...prompts.judgePairwise,
				},
				judgeThreeWay: {
					...mergedConfig.prompts.judgeThreeWay,
					...prompts.judgeThreeWay,
				},
			};
			console.log(`📝 Loaded prompts from: ${resolvedPromptsPath}`);
		} catch (e) {
			console.error(
				`⚠️ Failed to parse prompts file ${resolvedPromptsPath}:`,
				e,
			);
			console.log("   Using default prompts.");
		}
	} else if (promptsPath) {
		// User explicitly specified a prompts file that doesn't exist
		throw new Error(`Prompts file not found: ${promptsPath}`);
	}
	// If no prompts.toml found and no --prompts flag, silently use defaults

	const normalizeWarnings = normalizeConfig(mergedConfig);
	const validateWarnings = validateConfig(mergedConfig);
	for (const warning of [...normalizeWarnings, ...validateWarnings]) {
		console.warn(`⚠️ ${warning}`);
	}
		const estimate = estimateApiCalls(mergedConfig);
		console.log(
			`📊 Estimated API calls: total ${estimate.total} (gen ${estimate.generation}, firstDraftSelection ${estimate.initialLeaderboard}, review ${estimate.review}, revise ${estimate.revise}, coarse ${estimate.swiss}, fine ${estimate.finale})`,
		);
	loadedConfig = mergedConfig;
	loadedPaths = {
		configPath: effectiveConfigPath,
		promptsPath: effectivePromptsPath,
	};
	return mergedConfig;
}

/**
 * Gets the current configuration (must call loadConfig first).
 */
export function getConfig(): PipelineConfig {
	if (!loadedConfig) {
		return loadConfig();
	}
	return loadedConfig;
}

/**
 * Resets loaded config (useful for testing).
 */
export function resetConfig(): void {
	loadedConfig = null;
	loadedPaths = null;
}

/**
 * Helper to interpolate template strings with variables.
 * Uses {varname} syntax.
 */
export function interpolate(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/**
 * Gets role entries for a specific role.
 * Returns an array of RoleEntry objects with model slugs and effort.
 */
export function getRoleEntries(
	role: "generators" | "reviewers" | "revisers",
): RoleEntry[] {
	const config = getConfig();
	return config.roles[role];
}

/**
 * Gets model slugs for a specific role (for backward compatibility).
 * Returns just the model slug strings.
 */
export function getModelsForRole(
	role: "generators" | "reviewers" | "revisers",
): string[] {
	return getRoleEntries(role).map((e) => e.model);
}

/**
 * Retrieves the configured reasoning effort for a model in a given role.
 *
 * @param role - The role to query (accepts "playoffJudges" as a deprecated alias for "finaleJudges")
 * @param modelSlug - The model slug to look up
 * @returns The model's `ReasoningEffort` value; `"high"` if the model is not configured for the role
 */
export function getEffortForRole(
	role:
		| "generators"
		| "reviewers"
		| "revisers"
		| "swissJudges"
		| "finaleJudges"
		| "playoffJudges",
	modelSlug: string,
): ReasoningEffort {
	const config = getConfig();

	if (role === "swissJudges") {
		const entry = config.roles.swissJudges.find((e) => e.model === modelSlug);
		return entry?.effort ?? "high";
	}

	if (role === "finaleJudges" || role === "playoffJudges") {
		const entry = config.roles.finaleJudges.find((e) => e.model === modelSlug);
		return entry?.effort ?? "high";
	}

	const entries = config.roles[role];
	const entry = entries.find((e) => e.model === modelSlug);
	return entry?.effort ?? "high";
}

/**
 * Retrieve the configured Swiss judges from the current pipeline configuration.
 *
 * @returns The array of `RoleEntry` objects configured as Swiss judges
 */
export function getSwissJudges(): RoleEntry[] {
	return getConfig().roles.swissJudges;
}

/**
 * Retrieve the configured finale judges.
 *
 * @returns The array of `RoleEntry` objects defined as finale judges in the current configuration
 */
export function getFinaleJudges(): RoleEntry[] {
	return getConfig().roles.finaleJudges;
}

/**
 * Deprecated alias for getFinaleJudges (config key was renamed from roles.playoffJudges).
 */
export function getPlayoffJudges(): RoleEntry[] {
	console.warn(
		"⚠️ getPlayoffJudges() is deprecated. Use getFinaleJudges() and [[roles.finaleJudges]] instead.",
	);
	return getFinaleJudges();
}

/**
 * Retrieve the role entries used as initial leaderboard judges, falling back to finale judges when not configured.
 *
 * @returns The array of `RoleEntry` objects for initial leaderboard judging; falls back to `roles.finaleJudges` if `roles.initialLeaderboardJudges` is not defined.
 */
export function getInitialLeaderboardJudges(): RoleEntry[] {
	const config = getConfig();
	return config.roles.initialLeaderboardJudges ?? config.roles.finaleJudges;
}

/**
 * Validate a PipelineConfig for internal consistency and clamp or adjust values when necessary.
 *
 * Performs strict checks of required fields and numeric bounds, throws an Error for invalid
 * required settings, and returns non-fatal warnings for issues that are auto-corrected or
 * potentially problematic (e.g., high estimated API usage, degenerate contestant counts).
 *
 * @param config - The loaded PipelineConfig to validate and normalize in-place.
 * @returns An array of warning messages produced during validation and normalization.
 * @throws Error - When a required configuration value is missing or fails validation (for example:
 *                 missing runsDirectory, empty role lists, invalid numeric ranges, or malformed
 *                 model slugs).
 */
function validateConfig(config: PipelineConfig): string[] {
	const warnings: string[] = [];

	// Validate output config
	if (
		!config.output ||
		typeof config.output.runsDirectory !== "string" ||
		config.output.runsDirectory.trim().length === 0
	) {
		throw new Error("output.runsDirectory must be a non-empty string");
	}

	// Validate that role arrays are non-empty
	if (!config.roles.generators || config.roles.generators.length === 0) {
		throw new Error("roles.generators must have at least one entry");
	}
	if (!config.roles.reviewers || config.roles.reviewers.length === 0) {
		throw new Error("roles.reviewers must have at least one entry");
	}
	if (!config.roles.revisers || config.roles.revisers.length === 0) {
		throw new Error("roles.revisers must have at least one entry");
	}
		if (!config.roles.swissJudges || config.roles.swissJudges.length === 0) {
			throw new Error(
				"roles.coarseJudges (aka roles.swissJudges) must have at least one entry",
			);
		}
		if (
			config.tournament.finale.enabled &&
			(!config.roles.finaleJudges || config.roles.finaleJudges.length === 0)
		) {
			throw new Error(
				"roles.fineJudges (aka roles.finaleJudges) must have at least one entry when tournament.fineRanking.enabled (aka tournament.finale.enabled) is true",
			);
		}
	if (
		!Number.isInteger(config.tournament.swissRounds) ||
		config.tournament.swissRounds < 1
		) {
			throw new Error(
				"tournament.coarseRounds (aka tournament.swissRounds) must be an integer >= 1",
			);
		}
		if (
			!Number.isInteger(config.tournament.initialGenerations) ||
			config.tournament.initialGenerations < 1
		) {
			throw new Error(
				"tournament.firstDraftSelection.initialGenerations (aka tournament.initialGenerations) must be an integer >= 1",
			);
		}

		// Initial leaderboard: pairwise styles require at least one judge.
		// getInitialLeaderboardJudges() falls back to fineJudges when firstDraftSelectionJudges is unset.
		if (config.tournament.initialLeaderboard.enabled) {
		const gens = config.tournament.initialGenerations;
		const effectiveStyle =
			gens <= 1
				? "per-model-pairwise"
				: (config.tournament.initialLeaderboard.style ?? "per-model-pairwise");
		const usesPairwise =
			effectiveStyle === "per-model-pairwise" ||
			effectiveStyle === "global-pairwise";
		if (gens > 1 && usesPairwise) {
			const judges =
				config.roles.initialLeaderboardJudges ??
				config.roles.finaleJudges ??
				[];
				if (judges.length === 0) {
					throw new Error(
						"First Draft Selection pairwise styles require at least one judge in roles.firstDraftSelectionJudges (or roles.fineJudges fallback).",
					);
				}
			}
		}

	if (
		config.tournament.swissFormat &&
		config.tournament.swissFormat !== "1v1" &&
		config.tournament.swissFormat !== "1v1v1"
		) {
			throw new Error(
				'tournament.coarseFormat (aka tournament.swissFormat) must be either "1v1" or "1v1v1"',
			);
		}
	if (
		config.tournament.rating.backend !== "elo" &&
		config.tournament.rating.backend !== "bradley-terry"
	) {
		throw new Error(
			'tournament.rating.backend must be either "elo" or "bradley-terry"',
		);
	}
	if (
		!Number.isFinite(config.tournament.rating.kFactor) ||
		config.tournament.rating.kFactor <= 0
	) {
		throw new Error("tournament.rating.kFactor must be a number > 0");
	}
	if (
		!Number.isFinite(config.tournament.rating.initialRating) ||
		config.tournament.rating.initialRating <= 0
	) {
		throw new Error("tournament.rating.initialRating must be a number > 0");
	}
	if (
		!Number.isInteger(config.tournament.rating.provisionalMatches) ||
		config.tournament.rating.provisionalMatches < 0
	) {
		throw new Error(
			"tournament.rating.provisionalMatches must be an integer >= 0",
		);
	}
	if (
		!Number.isFinite(config.tournament.rating.tieValue) ||
		config.tournament.rating.tieValue < 0 ||
		config.tournament.rating.tieValue > 1
	) {
		throw new Error("tournament.rating.tieValue must be between 0 and 1");
	}
	if (
		!Number.isInteger(config.tournament.rating.btIterations) ||
		config.tournament.rating.btIterations < 1
	) {
		throw new Error("tournament.rating.btIterations must be an integer >= 1");
	}
	if (
		!Number.isFinite(config.tournament.rating.btTolerance) ||
		config.tournament.rating.btTolerance <= 0
	) {
		throw new Error("tournament.rating.btTolerance must be a number > 0");
	}
	if (
		!Number.isInteger(config.tournament.rating.ciBootstrapSamples) ||
		config.tournament.rating.ciBootstrapSamples < 0
	) {
		throw new Error(
			"tournament.rating.ciBootstrapSamples must be an integer >= 0",
		);
	}
	if (
		config.tournament.scheduling.mode !== "adaptive" &&
		config.tournament.scheduling.mode !== "static"
	) {
		throw new Error(
			'tournament.scheduling.mode must be either "adaptive" or "static"',
		);
	}
	if (
		!Number.isFinite(config.tournament.scheduling.exploration) ||
		config.tournament.scheduling.exploration < 0 ||
		config.tournament.scheduling.exploration > 1
	) {
		throw new Error(
			"tournament.scheduling.exploration must be a number between 0 and 1",
		);
	}
	if (
		!Number.isFinite(config.tournament.scheduling.avoidRepeatPenalty) ||
		config.tournament.scheduling.avoidRepeatPenalty < 0
	) {
		throw new Error(
			"tournament.scheduling.avoidRepeatPenalty must be a number >= 0",
		);
	}
	if (
		!Number.isInteger(config.tournament.scheduling.maxRepeatPairs) ||
		config.tournament.scheduling.maxRepeatPairs < 1
	) {
		throw new Error(
			"tournament.scheduling.maxRepeatPairs must be an integer >= 1",
		);
	}
	if (
		!Number.isInteger(config.tournament.stopRules.minBatches) ||
		config.tournament.stopRules.minBatches < 1
	) {
		throw new Error("tournament.stopRules.minBatches must be an integer >= 1");
	}
	if (
		!Number.isInteger(config.tournament.stopRules.maxBatches) ||
		config.tournament.stopRules.maxBatches < 1
	) {
		throw new Error("tournament.stopRules.maxBatches must be an integer >= 1");
	}
	if (
		!Number.isInteger(config.tournament.stopRules.topK) ||
		config.tournament.stopRules.topK < 1
	) {
		throw new Error("tournament.stopRules.topK must be an integer >= 1");
	}
	if (
		!Number.isFinite(config.tournament.stopRules.minSeparation) ||
		config.tournament.stopRules.minSeparation < 0
	) {
		throw new Error("tournament.stopRules.minSeparation must be a number >= 0");
	}
	if (
		!Number.isFinite(config.tournament.stopRules.confidence) ||
		config.tournament.stopRules.confidence <= 0 ||
		config.tournament.stopRules.confidence >= 1
	) {
		throw new Error(
			"tournament.stopRules.confidence must be a number in the open interval (0, 1)",
		);
	}
	if (
		!Number.isInteger(config.tournament.stopRules.stabilityBatches) ||
		config.tournament.stopRules.stabilityBatches < 1
	) {
		throw new Error(
			"tournament.stopRules.stabilityBatches must be an integer >= 1",
		);
	}
	if (
		config.tournament.stopRules.budgetMaxCalls !== undefined &&
		(!Number.isInteger(config.tournament.stopRules.budgetMaxCalls) ||
			config.tournament.stopRules.budgetMaxCalls < 1)
	) {
		throw new Error(
			"tournament.stopRules.budgetMaxCalls must be an integer >= 1 when set",
		);
	}

		if (typeof config.tournament.finale.enabled !== "boolean") {
			throw new Error(
				"tournament.fineRanking.enabled (aka tournament.finale.enabled) must be a boolean",
			);
		}
	if (
		!Number.isInteger(config.tournament.finale.maxMatchesPerBatch) ||
		config.tournament.finale.maxMatchesPerBatch < 0
		) {
			throw new Error(
				"tournament.fineRanking.maxMatchesPerBatch (aka tournament.finale.maxMatchesPerBatch) must be an integer >= 0",
			);
		}
	if (
		!Number.isInteger(config.tournament.finale.maxTotalMatches) ||
		config.tournament.finale.maxTotalMatches < 0
		) {
			throw new Error(
				"tournament.fineRanking.maxTotalMatches (aka tournament.finale.maxTotalMatches) must be an integer >= 0",
			);
		}
		if (!Number.isFinite(config.tournament.finale.targetWinProb)) {
			throw new Error(
				"tournament.fineRanking.targetWinProb (aka tournament.finale.targetWinProb) must be a number",
			);
		}
	if (
		config.tournament.finale.targetWinProb < 0 ||
		config.tournament.finale.targetWinProb > 1
		) {
			throw new Error(
				"tournament.fineRanking.targetWinProb (aka tournament.finale.targetWinProb) must be between 0 and 1",
			);
		}
		if (!Number.isFinite(config.tournament.finale.confidence)) {
			throw new Error(
				"tournament.fineRanking.confidence (aka tournament.finale.confidence) must be a number",
			);
		}
	if (
		config.tournament.finale.confidence <= 0 ||
		config.tournament.finale.confidence >= 1
		) {
			throw new Error(
				"tournament.fineRanking.confidence (aka tournament.finale.confidence) must be a number in the open interval (0, 1)",
			);
		}
	if (
		!Number.isFinite(config.tournament.finale.minSeparation) ||
		config.tournament.finale.minSeparation < 0
		) {
			throw new Error(
				"tournament.fineRanking.minSeparation (aka tournament.finale.minSeparation) must be a number >= 0",
			);
		}
		if (typeof config.tournament.finale.allowOverRepeatCap !== "boolean") {
			throw new Error(
				"tournament.fineRanking.allowOverRepeatCap (aka tournament.finale.allowOverRepeatCap) must be a boolean",
			);
		}

	// Validate that all role entries have valid model slugs
	const allEntries = [
		...config.roles.generators,
		...config.roles.reviewers,
		...config.roles.revisers,
		...config.roles.swissJudges,
		...config.roles.finaleJudges,
		...(config.roles.initialLeaderboardJudges ?? []),
	];

	for (const entry of allEntries) {
		if (!entry.model || typeof entry.model !== "string") {
			throw new Error(`Invalid role entry: missing or invalid 'model' field`);
		}
		const [provider, modelName] = entry.model.split("/");
		if (!provider || !modelName || entry.model.split("/").length !== 2) {
			throw new Error(
				`Invalid model slug "${entry.model}": expected "provider/model-name"`,
			);
		}
	}

	const estimatedContestants =
		config.roles.generators.length *
		config.roles.reviewers.length *
		config.roles.revisers.length;
	if (estimatedContestants < 2) {
		warnings.push(
			`Only ${estimatedContestants} contestant expected from current role counts; results may be degenerate.`,
		);
	}
		if (config.tournament.stopRules.maxBatches > config.tournament.swissRounds) {
			warnings.push(
				`tournament.stopRules.maxBatches (${config.tournament.stopRules.maxBatches}) exceeds tournament.coarseRounds (${config.tournament.swissRounds}); clamping to ${config.tournament.swissRounds}.`,
			);
			config.tournament.stopRules.maxBatches = config.tournament.swissRounds;
		}
	if (
		config.tournament.stopRules.minBatches >
		config.tournament.stopRules.maxBatches
	) {
		warnings.push(
			`tournament.stopRules.minBatches (${config.tournament.stopRules.minBatches}) exceeds maxBatches (${config.tournament.stopRules.maxBatches}); clamping minBatches to ${config.tournament.stopRules.maxBatches}.`,
		);
		config.tournament.stopRules.minBatches =
			config.tournament.stopRules.maxBatches;
	}
	if (config.tournament.stopRules.topK > estimatedContestants) {
		const clamped = Math.max(1, estimatedContestants);
		warnings.push(
			`tournament.stopRules.topK (${config.tournament.stopRules.topK}) exceeds estimated contestant count (${estimatedContestants}); clamping to ${clamped}.`,
		);
		config.tournament.stopRules.topK = clamped;
	}
	if (
		config.tournament.stopRules.enabled &&
		!config.tournament.rating.enabled
	) {
		warnings.push(
			"tournament.stopRules.enabled requires tournament.rating.enabled; disabling stop rules.",
		);
		config.tournament.stopRules.enabled = false;
	}

		if (config.tournament.finale.enabled && !config.tournament.rating.enabled) {
			warnings.push(
				"tournament.fineRanking.enabled (aka tournament.finale.enabled) requires tournament.rating.enabled; disabling fine ranking.",
			);
			config.tournament.finale.enabled = false;
		}
		if (
			config.tournament.finale.maxTotalMatches <
			config.tournament.finale.maxMatchesPerBatch
		) {
			warnings.push(
				`tournament.fineRanking.maxTotalMatches (${config.tournament.finale.maxTotalMatches}) is less than maxMatchesPerBatch (${config.tournament.finale.maxMatchesPerBatch}); clamping maxMatchesPerBatch to ${config.tournament.finale.maxTotalMatches}.`,
			);
			config.tournament.finale.maxMatchesPerBatch =
				config.tournament.finale.maxTotalMatches;
		}

	const estimate = estimateApiCalls(config);
	if (estimate.total >= HIGH_CALL_VOLUME_THRESHOLD) {
		warnings.push(
			`High estimated API volume (${estimate.total} calls: gen ${estimate.generation}, seed ${estimate.initialLeaderboard}, review ${estimate.review}, revise ${estimate.revise}, swiss ${estimate.swiss}, finale ${estimate.finale}). Consider reducing rounds/models for faster runs.`,
		);
	}

	return warnings;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

export interface CLIArgs {
	configPath?: string;
	promptsPath?: string;
	resumeDir?: string;
	dryRun: boolean;
}

/**
 * Parses command line arguments.
 * Supports: --config <path>, --prompts <path>, --resume <run-dir>, --dry-run
 */
export function parseArgs(argv: string[] = process.argv): CLIArgs {
	const args: CLIArgs = {
		dryRun: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--config" && argv[i + 1]) {
			args.configPath = argv[i + 1];
			i++; // Skip next arg
		} else if (arg === "--prompts" && argv[i + 1]) {
			args.promptsPath = argv[i + 1];
			i++; // Skip next arg
		} else if (arg === "--resume" && argv[i + 1]) {
			args.resumeDir = argv[i + 1];
			i++; // Skip next arg
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		}
	}

	return args;
}

// Export types for model names derived from config
