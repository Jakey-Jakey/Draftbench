export type ModelName = string;

export type ReasoningEffort =
	| "xhigh"
	| "high"
	| "medium"
	| "low"
	| "minimal"
	| "none";

export interface RoleEntry {
	model: string;
	effort?: ReasoningEffort;
	temperature?: number;
}

export interface RolesConfig {
	generators: RoleEntry[];
	reviewers: RoleEntry[];
	revisers: RoleEntry[];
	swissJudges: RoleEntry[];
	finaleJudges: RoleEntry[];
	initialLeaderboardJudges?: RoleEntry[];
}

export type InitialLeaderboardStyle =
	| "per-model-pairwise"
	| "global-pairwise"
	| "per-model-rank"
	| "global-rank";

export interface InitialLeaderboardConfig {
	enabled: boolean;
	style?: InitialLeaderboardStyle;
}

export type RatingBackend = "elo" | "bradley-terry";
export type SchedulingMode = "adaptive" | "static";
export type CiMode = "bootstrap" | "hessian" | "normal";
export type SchedulingScoringMode = "heuristic" | "fisher";

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
	/** L2 regularization strength for Bradley-Terry. 0 = disabled. */
	btRegularization: number;
	/** Use per-player Hessian-diagonal (Newton/MM) step sizes for BT. */
	btUseNewton: boolean;
	/** CI computation mode: "bootstrap", "hessian" (analytic, BT only), or "normal" (z * uncertainty). */
	ciMode: CiMode;
}

export interface SchedulingConfig {
	mode: SchedulingMode;
	exploration: number;
	avoidRepeatPenalty: number;
	maxRepeatPairs: number;
	/** Pair scoring strategy: "heuristic" (original composite) or "fisher" (Fisher-information-weighted). */
	scoringMode: SchedulingScoringMode;
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
	maxMatchesPerBatch: number;
	maxTotalMatches: number;
	targetWinProb: number;
	confidence: number;
	minSeparation: number;
	allowOverRepeatCap: boolean;
}

export interface TournamentConfig {
	swissRounds: number;
	initialGenerations: number;
	initialLeaderboard: InitialLeaderboardConfig;
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
	/**
	 * Max concurrent API calls. Omit this field (or set to 0 in TOML) for unlimited.
	 */
	maxParallel?: number;
}

export interface PromptsConfig {
	generate: {
		system: string;
		user: string;
	};
	review: {
		system: string;
		userTemplate: string;
	};
	revise: {
		system: string;
		userTemplate: string;
	};
	judgePairwise: {
		system: string;
		userTemplate: string;
	};
	judgeThreeWay: {
		system: string;
		userTemplate: string;
	};
}

export interface PipelineConfig {
	roles: RolesConfig;
	concurrency?: ConcurrencyConfig;
	tournament: TournamentConfig;
	output: OutputConfig;
	prompts: PromptsConfig;
}

export interface ApiCallEstimate {
	generation: number;
	initialLeaderboard: number;
	review: number;
	revise: number;
	swiss: number;
	finale: number;
	total: number;
}

export interface CLIArgs {
	configPath?: string;
	promptsPath?: string;
	resumeDir?: string;
	reuseArtifactsDir?: string;
	reuseFineOnly: boolean;
	dryRun: boolean;
}
