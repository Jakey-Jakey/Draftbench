import type {
	PairwiseObservation,
	RatingEngineConfig,
	RatingRecord,
	RatingStanding,
	RatingState,
	StoredRatingState,
} from "./types";

const RATING_SCALE = 400;
const MIN_UNCERTAINTY = 40;
export const STARTING_UNCERTAINTY = 350;
const DEFAULT_CI_CONFIDENCE = 0.9;

/**
 * Clamp a numeric input into the closed interval [0, 1], treating NaN as 0.
 *
 * @param value - The numeric input to clamp; if `NaN`, it will be treated as 0.
 * @returns The input coerced into the range 0 to 1.
function clampUnit(value: number): number {
	if (Number.isNaN(value)) return 0;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/**
 * Computes the expected score for player A against player B based on their ratings.
 *
 * @param ratingA - Rating of player A
 * @param ratingB - Rating of player B
 * @returns The expected score for A (a number between 0 and 1, interpreted as the probability of A winning) 
 */
function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** ((ratingB - ratingA) / RATING_SCALE));
}

/**
 * Updates a rating record's uncertainty based on its number of matches.
 *
 * Sets `record.uncertainty` to the larger of `MIN_UNCERTAINTY` and
 * `STARTING_UNCERTAINTY / sqrt(record.matches + 1)`.
 *
 * @param record - The RatingRecord whose `uncertainty` field will be updated
 */
function updateUncertainty(record: RatingRecord): void {
	record.uncertainty = Math.max(
		MIN_UNCERTAINTY,
		STARTING_UNCERTAINTY / Math.sqrt(record.matches + 1),
	);
}

/**
 * Create a new RatingRecord for the given id initialized to the provided rating.
 *
 * @param id - Unique identifier for the record
 * @param initialRating - Starting numeric rating for the record
 * @returns A RatingRecord with `rating` set to `initialRating`, `matches`, `wins`, `losses`, and `draws` set to 0, and `uncertainty` set to the starting uncertainty
 */
function toRecord(id: string, initialRating: number): RatingRecord {
	return {
		id,
		rating: initialRating,
		matches: 0,
		wins: 0,
		losses: 0,
		draws: 0,
		uncertainty: STARTING_UNCERTAINTY,
	};
}

/**
 * Retrieve the RatingRecord for the given id, creating and storing a new record initialized from the state's initialRating if none exists.
 *
 * @param id - Identifier for the rating record to retrieve or create
 * @returns The existing or newly created RatingRecord for `id`
 */
function getOrCreateRecord(state: RatingState, id: string): RatingRecord {
	const existing = state.records.get(id);
	if (existing) return existing;
	const created = toRecord(id, state.config.initialRating);
	state.records.set(id, created);
	return created;
}

/**
 * Update two players' match counters and uncertainties based on a single pairwise outcome.
 *
 * Increments wins/losses/draws and matches for each provided record according to the numeric
 * comparison of `scoreA` and `scoreB`, then recalculates each record's uncertainty.
 *
 * @param recordA - Rating record for the first player (associated with `scoreA`)
 * @param recordB - Rating record for the second player (associated with `scoreB`)
 * @param scoreA - Observed score for the first player (expected in the [0, 1] range)
 * @param scoreB - Observed score for the second player (expected in the [0, 1] range)
 */
function processOutcome(
	recordA: RatingRecord,
	recordB: RatingRecord,
	scoreA: number,
	scoreB: number,
): void {
	if (scoreA === scoreB) {
		recordA.draws += 1;
		recordB.draws += 1;
	} else if (scoreA > scoreB) {
		recordA.wins += 1;
		recordB.losses += 1;
	} else {
		recordB.wins += 1;
		recordA.losses += 1;
	}
	recordA.matches += 1;
	recordB.matches += 1;
	updateUncertainty(recordA);
	updateUncertainty(recordB);
}

/**
 * Applies an Elo-style update for each pairwise observation, mutating the state's records.
 *
 * For each observation this clamps scores to [0,1], computes expected scores from current
 * ratings, adjusts ratings using the configured K-factor (with a provisional-match boost
 * for players with fewer than `config.provisionalMatches`), and updates match/win/loss/draw
 * counts and uncertainties on the affected records.
 *
 * @param state - The rating state whose records are updated in place
 * @param batch - Array of pairwise observations to apply
 */
function applyEloBatch(state: RatingState, batch: PairwiseObservation[]): void {
	for (const observation of batch) {
		const scoreA = clampUnit(observation.scoreA);
		const scoreB = clampUnit(observation.scoreB);
		const recordA = getOrCreateRecord(state, observation.aId);
		const recordB = getOrCreateRecord(state, observation.bId);

		const expectedA = expectedScore(recordA.rating, recordB.rating);
		const expectedB = 1 - expectedA;
		const provisionalBoostA =
			recordA.matches < state.config.provisionalMatches ? 1.4 : 1;
		const provisionalBoostB =
			recordB.matches < state.config.provisionalMatches ? 1.4 : 1;
		const kA = state.config.kFactor * provisionalBoostA;
		const kB = state.config.kFactor * provisionalBoostB;

		recordA.rating += kA * (scoreA - expectedA);
		recordB.rating += kB * (scoreB - expectedB);
		processOutcome(recordA, recordB, scoreA, scoreB);
	}
}

/**
 * Incorporates a batch of pairwise observations into the state using a Bradley–Terry-style update.
 *
 * Appends observations to the state's history, updates per-player match/win/loss/draw counts and uncertainties from the batch (scores are clamped to [0,1]), then fits latent skill parameters (`theta`) over the accumulated history using iterative gradient updates. After convergence or reaching the iteration limit, rescales the optimized `theta` values into the rating space and writes them back to each record.
 *
 * @param state - The rating state to update; contains records, history, and Bradley–Terry configuration.
 * @param batch - Array of pairwise observations to apply; each observation's scores will be clamped to the [0,1] range before processing.
 */
function applyBradleyTerryBatch(
	state: RatingState,
	batch: PairwiseObservation[],
): void {
	state.history.push(...batch);

	for (const obs of batch) {
		const recordA = getOrCreateRecord(state, obs.aId);
		const recordB = getOrCreateRecord(state, obs.bId);
		processOutcome(
			recordA,
			recordB,
			clampUnit(obs.scoreA),
			clampUnit(obs.scoreB),
		);
	}

	const ids = Array.from(state.records.keys());
	if (ids.length < 2) return;

	const theta = new Map<string, number>();
	for (const id of ids) {
		const rating = state.records.get(id)?.rating ?? state.config.initialRating;
		theta.set(id, (rating - state.config.initialRating) / 173.7178);
	}

	const learningRate = 0.2;
	for (let iter = 0; iter < state.config.btIterations; iter++) {
		const gradients = new Map<string, number>(ids.map((id) => [id, 0]));

		for (const obs of state.history) {
			const a = theta.get(obs.aId);
			const b = theta.get(obs.bId);
			if (a === undefined || b === undefined) continue;

			const pA = 1 / (1 + Math.exp(-(a - b)));
			const scoreA = clampUnit(obs.scoreA);
			const scoreB = clampUnit(obs.scoreB);
			const gradA = scoreA - pA;
			const gradB = scoreB - (1 - pA);
			gradients.set(obs.aId, (gradients.get(obs.aId) ?? 0) + gradA);
			gradients.set(obs.bId, (gradients.get(obs.bId) ?? 0) + gradB);
		}

		let maxChange = 0;
		for (const id of ids) {
			const current = theta.get(id) ?? 0;
			const grad = gradients.get(id) ?? 0;
			const updated = current + learningRate * grad;
			theta.set(id, updated);
			maxChange = Math.max(maxChange, Math.abs(updated - current));
		}

		const mean =
			ids.reduce((acc, id) => acc + (theta.get(id) ?? 0), 0) / ids.length;
		for (const id of ids) {
			theta.set(id, (theta.get(id) ?? 0) - mean);
		}

		if (maxChange < state.config.btTolerance) {
			break;
		}
	}

	for (const id of ids) {
		const record = state.records.get(id);
		if (!record) continue;
		record.rating =
			state.config.initialRating + (theta.get(id) ?? 0) * 173.7178;
	}
}

/**
 * Map a confidence level to a z-score multiplier for a normal-approximation confidence interval.
 *
 * @param confidence - Desired confidence level in the range 0..1
 * @returns The z-score multiplier corresponding to `confidence` (e.g., 1.96 for 0.95). Returns 1.0 for confidences below 0.8.
 */
function confidenceMultiplier(confidence: number): number {
	// Normal approximation; used for the cheap CI display path.
	if (confidence >= 0.99) return 2.58;
	if (confidence >= 0.95) return 1.96;
	if (confidence >= 0.9) return 1.64;
	if (confidence >= 0.8) return 1.28;
	return 1.0;
}

/**
 * Creates a deterministic pseudorandom number generator seeded with `seed`.
 *
 * @param seed - 32-bit integer seed used to initialize the generator
 * @returns A function that, when called, returns a pseudorandom number in the range [0, 1)
 */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Derives a deterministic 32-bit integer seed from a sequence of pairwise observations.
 *
 * @param history - Array of pairwise observations used to compute the seed
 * @returns A 32-bit unsigned integer seed deterministically computed from `history`
 */
function seedFromHistory(history: PairwiseObservation[]): number {
	// Deterministic seed based on observations to avoid nondeterministic CIs.
	let h = 2166136261; // FNV-1a 32-bit offset basis
	for (const obs of history) {
		const str = `${obs.aId}|${obs.bId}|${obs.scoreA}|${obs.scoreB}|${obs.round}|${obs.sourceMatchId ?? ""}`;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
	}
	return h >>> 0;
}

/**
 * Computes the q-th quantile from an array of numbers.
 *
 * The input array must be sorted in ascending order; if empty, returns 0. Values of `q` outside
 * [0, 1] are clamped to that range. For indices between array elements the function returns a
 * linearly interpolated value.
 *
 * @param sorted - Array of numbers sorted in ascending order
 * @param q - Quantile to compute, where 0 corresponds to the minimum and 1 to the maximum
 * @returns The value at the q-th quantile (interpolated when necessary), or 0 for an empty array
 */
function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const clamped = Math.max(0, Math.min(1, q));
	const idx = (sorted.length - 1) * clamped;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo] ?? 0;
	const a = sorted[lo] ?? 0;
	const b = sorted[hi] ?? 0;
	const t = idx - lo;
	return a + (b - a) * t;
}

/**
 * Estimates per-player rating confidence intervals by bootstrap-resampling the match history.
 *
 * Performs `state.config.ciBootstrapSamples` bootstrap resamples of `state.history`, recomputes ratings
 * on each resample, and returns the empirical lower and upper quantiles for each player at the
 * specified confidence level.
 *
 * @param state - The current rating state containing records, history, and bootstrap configuration.
 * @param confidence - Desired confidence level (e.g., 0.95 for a 95% interval); value should be in (0,1).
 * @returns A map from player id to an object with `low` and `high` fields representing the bootstrap
 *          confidence interval bounds for that player's rating. Returns an empty map if bootstrapping
 *          is disabled or there is insufficient history or fewer than two players. 
 */
function bootstrapCi(
	state: RatingState,
	confidence: number,
): Map<string, { low: number; high: number }> {
	const samples = state.config.ciBootstrapSamples;
	const history = state.history;
	const ids = Array.from(state.records.keys());
	const result = new Map<string, { low: number; high: number }>();

	if (samples <= 0 || history.length < 2 || ids.length < 2) {
		return result;
	}

	const rng = mulberry32(seedFromHistory(history));
	const perId = new Map<string, number[]>(
		ids.map((id) => [id, [] as number[]]),
	);

	for (let s = 0; s < samples; s++) {
		const boot: PairwiseObservation[] = [];
		for (let i = 0; i < history.length; i++) {
			const idx = Math.floor(rng() * history.length);
			const picked = history[idx];
			if (picked) boot.push(picked);
		}

		const bootState = createRatingState(ids, {
			...state.config,
			ciBootstrapSamples: 0, // prevent recursion
		});
		applyPairwiseBatch(bootState, boot);

		for (const id of ids) {
			const r =
				bootState.records.get(id)?.rating ?? bootState.config.initialRating;
			perId.get(id)?.push(r);
		}
	}

	const alpha = (1 - confidence) / 2;
	for (const id of ids) {
		const arr = perId.get(id) ?? [];
		arr.sort((a, b) => a - b);
		result.set(id, {
			low: quantile(arr, alpha),
			high: quantile(arr, 1 - alpha),
		});
	}

	return result;
}

/**
 * Create a RatingState initialized with records for the given ids and a config merged with defaults.
 *
 * The provided partialConfig overrides defaults for any missing fields; defaults are:
 * backend: "elo", initialRating: 1500, kFactor: 24, tieValue: 0.5, provisionalMatches: 12,
 * btIterations: 200, btTolerance: 1e-6, ciBootstrapSamples: 0.
 *
 * @param ids - Array of player identifiers to initialize in the state's records map
 * @param partialConfig - Partial engine configuration that will be merged with defaults
 * @returns A RatingState containing the resolved config, a records Map with each id initialized, and an empty history array
 */
export function createRatingState(
	ids: string[],
	partialConfig: Partial<RatingEngineConfig>,
): RatingState {
	const config: RatingEngineConfig = {
		backend: partialConfig.backend ?? "elo",
		initialRating: partialConfig.initialRating ?? 1500,
		kFactor: partialConfig.kFactor ?? 24,
		tieValue: partialConfig.tieValue ?? 0.5,
		provisionalMatches: partialConfig.provisionalMatches ?? 12,
		btIterations: partialConfig.btIterations ?? 200,
		btTolerance: partialConfig.btTolerance ?? 1e-6,
		ciBootstrapSamples: partialConfig.ciBootstrapSamples ?? 0,
	};

	const records = new Map<string, RatingRecord>();
	for (const id of ids) {
		records.set(id, toRecord(id, config.initialRating));
	}

	return {
		config,
		records,
		history: [],
	};
}

/**
 * Applies a batch of pairwise observations to the given rating state using the configured backend.
 *
 * If the state's backend is "bradley-terry", ratings are updated with the Bradley–Terry procedure;
 * otherwise ratings are updated with the Elo-style procedure and the observations are appended to the state's history.
 *
 * @param state - The rating state to update
 * @param batch - Array of pairwise observations to apply; no action is taken for an empty array
 */
export function applyPairwiseBatch(
	state: RatingState,
	batch: PairwiseObservation[],
): void {
	if (batch.length === 0) return;

	if (state.config.backend === "bradley-terry") {
		applyBradleyTerryBatch(state, batch);
	} else {
		applyEloBatch(state, batch);
		state.history.push(...batch);
	}
}

/**
 * Produce rating standings from the given RatingState using default options.
 *
 * @param state - The rating state to derive standings from
 * @returns An array of standings sorted by rating (descending), then wins (descending), then id (ascending); each entry contains the record's current rating and related metadata (and confidence interval bounds when available)
 */
export function getRatingStandings(state: RatingState): RatingStanding[] {
	return getRatingStandingsWithOptions(state, {});
}

/**
 * Produce sorted rating standings with optional confidence intervals.
 *
 * @param state - The rating state to derive standings from
 * @param options - Options for confidence-interval calculation
 * @param options.bootstrapCi - If true, compute CIs by bootstrap resampling of the state's history; otherwise use analytical CIs from each record's uncertainty
 * @param options.confidence - Desired two-sided confidence level (e.g., 0.95). Defaults to the engine's default confidence when omitted
 * @returns An array of RatingStanding entries (each extended with `ciLow` and `ciHigh`) sorted by rating (descending), then wins (descending), then id (ascending)
 */
export function getRatingStandingsWithOptions(
	state: RatingState,
	options: { bootstrapCi?: boolean; confidence?: number },
): RatingStanding[] {
	const confidence = options.confidence ?? DEFAULT_CI_CONFIDENCE;
	const z = confidenceMultiplier(confidence);
	const boot =
		options.bootstrapCi === true
			? bootstrapCi(state, confidence)
			: new Map<string, { low: number; high: number }>();

	return Array.from(state.records.values())
		.map((record) => ({
			...record,
			ciLow: boot.get(record.id)?.low ?? record.rating - z * record.uncertainty,
			ciHigh:
				boot.get(record.id)?.high ?? record.rating + z * record.uncertainty,
		}))
		.sort((a, b) => {
			if (b.rating !== a.rating) return b.rating - a.rating;
			if (b.wins !== a.wins) return b.wins - a.wins;
			return a.id.localeCompare(b.id);
		});
}

/**
 * Compute the probability that player A will beat player B using the current ratings.
 *
 * @param state - The rating state to read player ratings and configuration from
 * @param aId - Identifier of player A
 * @param bId - Identifier of player B
 * @returns The expected score for player A against player B: a number between 0 and 1 where `1` means a certain win for A and `0` means a certain loss
 */
export function estimateWinProbability(
	state: RatingState,
	aId: string,
	bId: string,
): number {
	const a = state.records.get(aId)?.rating ?? state.config.initialRating;
	const b = state.records.get(bId)?.rating ?? state.config.initialRating;
	return expectedScore(a, b);
}

/**
 * Produces a serializable snapshot of the rating state.
 *
 * @param state - The in-memory RatingState to serialize
 * @returns A StoredRatingState containing the engine config, an array of rating records, and the history of observations
 */
export function serializeRatingState(state: RatingState): StoredRatingState {
	return {
		config: state.config,
		records: Array.from(state.records.values()),
		history: state.history,
	};
}

/**
 * Reconstructs an in-memory RatingState from a persisted StoredRatingState.
 *
 * @param stored - The persisted rating state to restore
 * @returns A RatingState containing the same config, a `Map` of records keyed by `id`, and the preserved history array
 */
export function deserializeRatingState(stored: StoredRatingState): RatingState {
	return {
		config: stored.config,
		records: new Map(stored.records.map((record) => [record.id, record])),
		history: stored.history,
	};
}