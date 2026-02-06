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
	/** Playoff judges (multi-judge voting) */
	playoffJudges: RoleEntry[];
	/** Initial leaderboard judges (optional, defaults to playoffJudges) */
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
export type DisambiguationJudgesSource = "playoff" | "swiss";

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

export interface DisambiguationConfig {
	enabled: boolean;
	/** Which judge pool to use for disambiguation matches. Default: playoff */
	judgesSource: DisambiguationJudgesSource;
	/** Max number of disambiguation matches to run after a single Swiss round. */
	maxMatchesPerSwissRound: number;
	/** Max number of disambiguation matches across the entire Swiss phase. */
	maxTotalMatches: number;
	/** How many challengers outside the top-K to consider (K+1..K+N). */
	candidatesOutsideK: number;
	/** If true, allow some matches within the top-K as well (near the cutoff). */
	includeTopKInternal: boolean;
	/** Target win probability for "most informative" matchups. Usually 0.5. */
	targetWinProb: number;
	/** If false, respects scheduling.maxRepeatPairs as a hard cap. */
	allowOverRepeatCap: boolean;
}

export interface TournamentConfig {
	swissRounds: number;
	playoffSize: number;
	initialGenerations: number;
	initialLeaderboard: InitialLeaderboardConfig;
	/** Swiss match format: 1v1 (pairwise) or 1v1v1 (three-way). Default: 1v1v1 */
	swissFormat?: "1v1" | "1v1v1";
	rating: RatingConfig;
	scheduling: SchedulingConfig;
	stopRules: StopRulesConfig;
	disambiguation: DisambiguationConfig;
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
		userTemplate: string; // {statblock}
	};
	revise: {
		system: string;
		userTemplate: string; // {statblock}, {feedback}
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
			{ model: "anthropic/claude-sonnet-4", effort: "high" },
			{ model: "openai/gpt-4.1", effort: "high" },
			{ model: "google/gemini-2.5-pro-preview", effort: "high" },
		],
		reviewers: [
			{ model: "anthropic/claude-sonnet-4", effort: "medium" },
			{ model: "openai/gpt-4.1", effort: "medium" },
			{ model: "google/gemini-2.5-pro-preview", effort: "medium" },
		],
		revisers: [
			{ model: "anthropic/claude-sonnet-4", effort: "high" },
			{ model: "openai/gpt-4.1", effort: "high" },
			{ model: "google/gemini-2.5-pro-preview", effort: "high" },
		],
		swissJudges: [{ model: "anthropic/claude-sonnet-4", effort: "low" }],
		playoffJudges: [
			{ model: "anthropic/claude-sonnet-4", effort: "low" },
			{ model: "openai/gpt-4.1", effort: "high" },
		],
	},
	tournament: {
		swissRounds: 7,
		playoffSize: 8,
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
		disambiguation: {
			enabled: true,
			judgesSource: "playoff",
			maxMatchesPerSwissRound: 2,
			maxTotalMatches: 12,
			candidatesOutsideK: 2,
			includeTopKInternal: false,
			targetWinProb: 0.5,
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
	disambiguation: number;
	playoff: number;
	total: number;
}

/**
 * Deep merge two objects, with source overwriting target for matching keys.
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
			disambiguation: {
				...target.tournament.disambiguation,
				...source.tournament.disambiguation,
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
	config.roles.playoffJudges.forEach((entry, index) => {
		normalizeRoleEntry(entry, `roles.playoffJudges[${index}]`, warnings);
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

function estimateApiCalls(config: PipelineConfig): ApiCallEstimate {
	const generatorCount = config.roles.generators.length;
	const reviewerCount = config.roles.reviewers.length;
	const reviserCount = config.roles.revisers.length;
	const swissJudgeCount = config.roles.swissJudges.length;
	const playoffJudgeCount = config.roles.playoffJudges.length;
	const initialGenerations = config.tournament.initialGenerations;
	const initialLeaderboardEnabled =
		config.tournament.initialLeaderboard.enabled;
	const initialLeaderboardStyle =
		config.tournament.initialLeaderboard.style ?? "per-model-pairwise";
	const initialLeaderboardJudgeCount =
		config.roles.initialLeaderboardJudges?.length ??
		config.roles.playoffJudges.length;

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

	const disambiguationJudgeCount =
		(config.tournament.disambiguation.judgesSource ?? "playoff") === "swiss"
			? swissJudgeCount
			: playoffJudgeCount;
	const disambiguation =
		config.tournament.disambiguation.enabled === true
			? config.tournament.disambiguation.maxTotalMatches *
				disambiguationJudgeCount
			: 0;
	const playoffContestants = Math.max(
		1,
		Math.min(config.tournament.playoffSize, contestants),
	);
	const playoffPairs = (playoffContestants * (playoffContestants - 1)) / 2;
	const playoff = playoffPairs * playoffJudgeCount;
	const total =
		generation +
		initialLeaderboard +
		review +
		revise +
		swiss +
		disambiguation +
		playoff;

	return {
		generation,
		initialLeaderboard,
		review,
		revise,
		swiss,
		disambiguation,
		playoff,
		total,
	};
}

/**
 * Parse TOML config file and convert to PipelineConfig.
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
			"playoffJudges",
			"initialLeaderboardJudges",
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
		if (rolesRaw.swissJudges) {
			result.roles.swissJudges = rolesRaw.swissJudges as RoleEntry[];
		}
		if (rolesRaw.playoffJudges) {
			result.roles.playoffJudges = rolesRaw.playoffJudges as RoleEntry[];
		}
		if (rolesRaw.initialLeaderboardJudges) {
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
			"playoffSize",
			"initialGenerations",
			"swissFormat",
			"initialLeaderboard",
			"rating",
			"scheduling",
			"stopRules",
			"disambiguation",
		]);
		for (const key of Object.keys(tournamentRaw)) {
			if (!knownTournamentKeys.has(key)) {
				console.warn(`⚠️ Unknown tournament key ignored: tournament.${key}`);
			}
		}

		if (tournamentRaw.swissRounds !== undefined) {
			result.tournament.swissRounds = tournamentRaw.swissRounds as number;
		}
		if (tournamentRaw.playoffSize !== undefined) {
			result.tournament.playoffSize = tournamentRaw.playoffSize as number;
		}
		if (tournamentRaw.initialGenerations !== undefined) {
			result.tournament.initialGenerations =
				tournamentRaw.initialGenerations as number;
		}
		if (tournamentRaw.swissFormat !== undefined) {
			result.tournament.swissFormat = tournamentRaw.swissFormat as
				| "1v1"
				| "1v1v1";
		}
		if (tournamentRaw.initialLeaderboard) {
			const ilRaw = tournamentRaw.initialLeaderboard as Record<string, unknown>;
			result.tournament.initialLeaderboard = {
				enabled: ilRaw.enabled as boolean,
				style: ilRaw.style as InitialLeaderboardStyle | undefined,
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
		if (tournamentRaw.disambiguation) {
			const disRaw = tournamentRaw.disambiguation as Record<string, unknown>;
			const knownDisambiguationKeys = new Set([
				"enabled",
				"judgesSource",
				"maxMatchesPerSwissRound",
				"maxTotalMatches",
				"candidatesOutsideK",
				"includeTopKInternal",
				"targetWinProb",
				"allowOverRepeatCap",
			]);
			for (const key of Object.keys(disRaw)) {
				if (!knownDisambiguationKeys.has(key)) {
					console.warn(
						`⚠️ Unknown tournament.disambiguation key ignored: tournament.disambiguation.${key}`,
					);
				}
			}
			result.tournament.disambiguation =
				{} as TournamentConfig["disambiguation"];
			if (disRaw.enabled !== undefined) {
				result.tournament.disambiguation.enabled = disRaw.enabled as boolean;
			}
			if (disRaw.judgesSource !== undefined) {
				result.tournament.disambiguation.judgesSource =
					disRaw.judgesSource as DisambiguationJudgesSource;
			}
			if (disRaw.maxMatchesPerSwissRound !== undefined) {
				result.tournament.disambiguation.maxMatchesPerSwissRound =
					disRaw.maxMatchesPerSwissRound as number;
			}
			if (disRaw.maxTotalMatches !== undefined) {
				result.tournament.disambiguation.maxTotalMatches =
					disRaw.maxTotalMatches as number;
			}
			if (disRaw.candidatesOutsideK !== undefined) {
				result.tournament.disambiguation.candidatesOutsideK =
					disRaw.candidatesOutsideK as number;
			}
			if (disRaw.includeTopKInternal !== undefined) {
				result.tournament.disambiguation.includeTopKInternal =
					disRaw.includeTopKInternal as boolean;
			}
			if (disRaw.targetWinProb !== undefined) {
				result.tournament.disambiguation.targetWinProb =
					disRaw.targetWinProb as number;
			}
			if (disRaw.allowOverRepeatCap !== undefined) {
				result.tournament.disambiguation.allowOverRepeatCap =
					disRaw.allowOverRepeatCap as boolean;
			}
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
 * Loads configuration from a TOML file, merging with defaults.
 * If no path provided, looks for config.toml in current directory.
 * If file doesn't exist, uses defaults.
 * @param configPath Path to config TOML file
 * @param promptsPath Optional path to separate prompts TOML file
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

	const mergedConfig = deepMerge(DEFAULT_CONFIG, userConfig);

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
		`📊 Estimated API calls: total ${estimate.total} (gen ${estimate.generation}, seed ${estimate.initialLeaderboard}, review ${estimate.review}, revise ${estimate.revise}, swiss ${estimate.swiss}, disambig ${estimate.disambiguation}, playoff ${estimate.playoff})`,
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
 * Gets the effort for a specific model in a specific role.
 * Returns the first matching entry's effort, or "high" as default.
 */
export function getEffortForRole(
	role:
		| "generators"
		| "reviewers"
		| "revisers"
		| "swissJudges"
		| "playoffJudges",
	modelSlug: string,
): ReasoningEffort {
	const config = getConfig();

	if (role === "swissJudges") {
		const entry = config.roles.swissJudges.find((e) => e.model === modelSlug);
		return entry?.effort ?? "high";
	}

	if (role === "playoffJudges") {
		const entry = config.roles.playoffJudges.find((e) => e.model === modelSlug);
		return entry?.effort ?? "high";
	}

	const entries = config.roles[role];
	const entry = entries.find((e) => e.model === modelSlug);
	return entry?.effort ?? "high";
}

/**
 * Gets Swiss judge configurations.
 */
export function getSwissJudges(): RoleEntry[] {
	return getConfig().roles.swissJudges;
}

/**
 * Gets the playoff judges configuration.
 */
export function getPlayoffJudges(): RoleEntry[] {
	return getConfig().roles.playoffJudges;
}

/**
 * Gets the initial leaderboard judges (falls back to playoff judges if not set).
 */
export function getInitialLeaderboardJudges(): RoleEntry[] {
	const config = getConfig();
	return config.roles.initialLeaderboardJudges ?? config.roles.playoffJudges;
}

/**
 * Validates the loaded configuration for consistency.
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
		throw new Error("roles.swissJudges must have at least one entry");
	}
	if (!config.roles.playoffJudges || config.roles.playoffJudges.length === 0) {
		throw new Error("roles.playoffJudges must have at least one entry");
	}
	if (
		!Number.isInteger(config.tournament.swissRounds) ||
		config.tournament.swissRounds < 1
	) {
		throw new Error("tournament.swissRounds must be an integer >= 1");
	}
	if (
		!Number.isInteger(config.tournament.initialGenerations) ||
		config.tournament.initialGenerations < 1
	) {
		throw new Error("tournament.initialGenerations must be an integer >= 1");
	}
	if (
		!Number.isInteger(config.tournament.playoffSize) ||
		config.tournament.playoffSize < 2
	) {
		throw new Error("tournament.playoffSize must be an integer >= 2");
	}
	if (
		config.tournament.swissFormat &&
		config.tournament.swissFormat !== "1v1" &&
		config.tournament.swissFormat !== "1v1v1"
	) {
		throw new Error('tournament.swissFormat must be either "1v1" or "1v1v1"');
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

	if (
		config.tournament.disambiguation.judgesSource !== "playoff" &&
		config.tournament.disambiguation.judgesSource !== "swiss"
	) {
		throw new Error(
			'tournament.disambiguation.judgesSource must be either "playoff" or "swiss"',
		);
	}
	if (
		!Number.isInteger(
			config.tournament.disambiguation.maxMatchesPerSwissRound,
		) ||
		config.tournament.disambiguation.maxMatchesPerSwissRound < 0
	) {
		throw new Error(
			"tournament.disambiguation.maxMatchesPerSwissRound must be an integer >= 0",
		);
	}
	if (
		!Number.isInteger(config.tournament.disambiguation.maxTotalMatches) ||
		config.tournament.disambiguation.maxTotalMatches < 0
	) {
		throw new Error(
			"tournament.disambiguation.maxTotalMatches must be an integer >= 0",
		);
	}
	if (
		!Number.isInteger(config.tournament.disambiguation.candidatesOutsideK) ||
		config.tournament.disambiguation.candidatesOutsideK < 0
	) {
		throw new Error(
			"tournament.disambiguation.candidatesOutsideK must be an integer >= 0",
		);
	}
	if (
		typeof config.tournament.disambiguation.includeTopKInternal !== "boolean"
	) {
		throw new Error(
			"tournament.disambiguation.includeTopKInternal must be a boolean",
		);
	}
	if (!Number.isFinite(config.tournament.disambiguation.targetWinProb)) {
		throw new Error("tournament.disambiguation.targetWinProb must be a number");
	}
	if (
		config.tournament.disambiguation.targetWinProb < 0 ||
		config.tournament.disambiguation.targetWinProb > 1
	) {
		throw new Error(
			"tournament.disambiguation.targetWinProb must be between 0 and 1",
		);
	}
	if (
		typeof config.tournament.disambiguation.allowOverRepeatCap !== "boolean"
	) {
		throw new Error(
			"tournament.disambiguation.allowOverRepeatCap must be a boolean",
		);
	}

	// Validate that all role entries have valid model slugs
	const allEntries = [
		...config.roles.generators,
		...config.roles.reviewers,
		...config.roles.revisers,
		...config.roles.swissJudges,
		...config.roles.playoffJudges,
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
	if (config.tournament.playoffSize > estimatedContestants) {
		const clamped = Math.max(1, estimatedContestants);
		warnings.push(
			`tournament.playoffSize (${config.tournament.playoffSize}) exceeds estimated contestant count (${estimatedContestants}); clamping to ${clamped}.`,
		);
		config.tournament.playoffSize = clamped;
	}
	if (estimatedContestants < 2) {
		warnings.push(
			`Only ${estimatedContestants} contestant expected from current role counts; playoff rounds will be minimal.`,
		);
	}
	if (config.tournament.stopRules.maxBatches > config.tournament.swissRounds) {
		warnings.push(
			`tournament.stopRules.maxBatches (${config.tournament.stopRules.maxBatches}) exceeds swissRounds (${config.tournament.swissRounds}); clamping to ${config.tournament.swissRounds}.`,
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
	if (
		config.tournament.stopRules.topK > config.tournament.playoffSize &&
		config.tournament.stopRules.enabled
	) {
		warnings.push(
			`tournament.stopRules.topK (${config.tournament.stopRules.topK}) exceeds playoffSize (${config.tournament.playoffSize}); clamping to ${config.tournament.playoffSize}.`,
		);
		config.tournament.stopRules.topK = config.tournament.playoffSize;
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

	if (
		config.tournament.disambiguation.enabled &&
		(!config.tournament.stopRules.enabled || !config.tournament.rating.enabled)
	) {
		warnings.push(
			"tournament.disambiguation.enabled requires tournament.stopRules.enabled and tournament.rating.enabled; disabling disambiguation.",
		);
		config.tournament.disambiguation.enabled = false;
	}
	if (
		config.tournament.disambiguation.maxTotalMatches <
		config.tournament.disambiguation.maxMatchesPerSwissRound
	) {
		warnings.push(
			`tournament.disambiguation.maxTotalMatches (${config.tournament.disambiguation.maxTotalMatches}) is less than maxMatchesPerSwissRound (${config.tournament.disambiguation.maxMatchesPerSwissRound}); clamping maxMatchesPerSwissRound to ${config.tournament.disambiguation.maxTotalMatches}.`,
		);
		config.tournament.disambiguation.maxMatchesPerSwissRound =
			config.tournament.disambiguation.maxTotalMatches;
	}

	const estimate = estimateApiCalls(config);
	if (estimate.total >= HIGH_CALL_VOLUME_THRESHOLD) {
		warnings.push(
			`High estimated API volume (${estimate.total} calls: gen ${estimate.generation}, seed ${estimate.initialLeaderboard}, review ${estimate.review}, revise ${estimate.revise}, swiss ${estimate.swiss}, disambig ${estimate.disambiguation}, playoff ${estimate.playoff}). Consider reducing rounds/models for faster runs.`,
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
