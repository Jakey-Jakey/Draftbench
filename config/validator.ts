import type {
	ApiCallEstimate,
	PipelineConfig,
	ReasoningEffort,
	RoleEntry,
} from "./types";

const VALID_REASONING_EFFORTS: ReasoningEffort[] = [
	"xhigh",
	"high",
	"medium",
	"low",
	"minimal",
	"none",
];

const HIGH_CALL_VOLUME_THRESHOLD = 500;

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

export function normalizeConfig(config: PipelineConfig): string[] {
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

export function estimateApiCalls(config: PipelineConfig): ApiCallEstimate {
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

export function validateConfig(config: PipelineConfig): string[] {
	const warnings: string[] = [];

	if (
		!config.output ||
		typeof config.output.runsDirectory !== "string" ||
		config.output.runsDirectory.trim().length === 0
	) {
		throw new Error("output.runsDirectory must be a non-empty string");
	}

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
		!Number.isFinite(config.tournament.rating.btRegularization) ||
		config.tournament.rating.btRegularization < 0
	) {
		throw new Error("tournament.rating.btRegularization must be a number >= 0");
	}
	if (typeof config.tournament.rating.btUseNewton !== "boolean") {
		throw new Error("tournament.rating.btUseNewton must be a boolean");
	}
	if (
		config.tournament.rating.ciMode !== "bootstrap" &&
		config.tournament.rating.ciMode !== "hessian" &&
		config.tournament.rating.ciMode !== "normal"
	) {
		throw new Error(
			'tournament.rating.ciMode must be "bootstrap", "hessian", or "normal"',
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
		config.tournament.scheduling.scoringMode !== "heuristic" &&
		config.tournament.scheduling.scoringMode !== "fisher"
	) {
		throw new Error(
			'tournament.scheduling.scoringMode must be "heuristic" or "fisher"',
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
		if (
			entry.temperature !== undefined &&
			(!Number.isFinite(entry.temperature) ||
				entry.temperature < 0 ||
				entry.temperature > 2)
		) {
			throw new Error(
				`Invalid temperature for model "${entry.model}": expected a number between 0 and 2`,
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
