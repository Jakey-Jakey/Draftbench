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
 * Clamp a numeric value to the interval [0, 1], treating NaN as 0.
 *
 * @param value - The number to clamp; `NaN` is treated as `0`
 * @returns The input constrained to the range `0` through `1`; `0` if the input is `NaN`
 */
function clampUnit(value: number): number {
	if (Number.isNaN(value)) return 0;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/**
 * Compute the Elo-style expected score for player A against player B.
 *
 * @param ratingA - Rating of player A
 * @param ratingB - Rating of player B
 * @returns A number between 0 and 1 representing the probability that player A scores against player B under the Elo logistic model
 */
function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** ((ratingB - ratingA) / RATING_SCALE));
}

/**
 * Update a rating record's uncertainty based on its number of matches.
 *
 * Sets `record.uncertainty` to a value that decreases as `record.matches` increases, but never falls below the configured minimum uncertainty.
 *
 * @param record - The RatingRecord to update (mutated in place)
 */
function updateUncertainty(record: RatingRecord): void {
	record.uncertainty = Math.max(
		MIN_UNCERTAINTY,
		STARTING_UNCERTAINTY / Math.sqrt(record.matches + 1),
	);
}

/**
 * Create a new RatingRecord initialized for the given id.
 *
 * @param id - The unique identifier for the record
 * @param initialRating - The starting rating to assign to the record
 * @returns A `RatingRecord` for `id` with `rating` set to `initialRating`, match counters set to zero, and `uncertainty` set to `STARTING_UNCERTAINTY`
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
 * Retrieve the RatingRecord for `id`, creating and storing a new record initialized with the state's initial rating if one does not exist.
 *
 * @returns The existing or newly created `RatingRecord` for `id`.
 */
function getOrCreateRecord(state: RatingState, id: string): RatingRecord {
	const existing = state.records.get(id);
	if (existing) return existing;
	const created = toRecord(id, state.config.initialRating);
	state.records.set(id, created);
	return created;
}

/**
 * Update two rating records' match counters (wins, losses, draws, matches) based on a single pairwise outcome and refresh their uncertainties.
 *
 * Increments wins/losses/draws according to the comparison of `scoreA` and `scoreB`, increments each record's match count, and calls `updateUncertainty` for both records.
 *
 * @param recordA - The first participant's rating record to update
 * @param recordB - The second participant's rating record to update
 * @param scoreA - The first participant's score for the encounter; higher score indicates a better result, equal scores indicate a draw
 * @param scoreB - The second participant's score for the encounter; higher score indicates a better result, equal scores indicate a draw
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
 * Applies a sequence of pairwise observations to the given rating state using an Elo-style update and updates records in-place.
 *
 * @param state - The rating state to update
 * @param batch - Array of pairwise observations (each with aId, bId, scoreA, scoreB) to apply to the state
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
 * Applies a batch of pairwise observations to the state using a Bradley–Terry-style model and updates ratings.
 *
 * Appends observations to the state's history, updates per-record outcome counters, then fits per-id theta parameters
 * by iteratively accumulating gradients over the full history (gradient-ascent-like updates), recenters the thetas each
 * iteration, and stops when changes fall below the configured tolerance or the iteration limit is reached. Final thetas
 * are converted back into the rating scale and written into the state's records.
 *
 * @param state - The rating state to update
 * @param batch - Array of pairwise observations to apply
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
 * Maps a confidence level to a z-score multiplier for approximate confidence-interval calculations.
 *
 * @param confidence - Confidence level between 0 and 1 (e.g., 0.95 for 95% confidence)
 * @returns The z-score multiplier corresponding to the provided confidence (used with a normal-approximation CI) 
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
 * Creates a deterministic pseudo-random number generator seeded with the given value.
 *
 * @param seed - Integer seed used to initialize the generator
 * @returns A function that returns a pseudo-random number in [0, 1) on each call; sequences are reproducible for the same seed
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
 * Derives a deterministic 32-bit seed from a sequence of pairwise observations.
 *
 * @param history - The ordered list of pairwise observations used to compute the seed
 * @returns A non-negative 32-bit integer seed that is stable for the same input history
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
 * Computes the q-th quantile from a sorted numeric array using linear interpolation.
 *
 * @param sorted - Array of numbers sorted in ascending order (non-decreasing).
 * @param q - Quantile to compute, where 0 represents the minimum and 1 the maximum; values outside [0,1] are clamped.
 * @returns The value at the q-th quantile computed by linear interpolation between neighboring elements, or `0` if `sorted` is empty.
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
 * Computes per-id bootstrap confidence intervals for ratings based on the state's observation history.
 *
 * @param state - The current RatingState whose history and config drive bootstrap resampling.
 * @param confidence - Confidence level as a number between 0 and 1 (e.g., 0.95 for 95% CI).
 * @returns A map from record id to an object with `low` and `high` bounds for the requested confidence level. Returns an empty map if bootstrap is not feasible (insufficient samples, history, or ids).
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
 * Create an initial rating state containing a record for each provided id and a config
 * produced by merging `partialConfig` with engine defaults.
 *
 * @param ids - Array of ids to initialize rating records for
 * @param partialConfig - Partial engine configuration that overrides defaults (backend, initialRating, kFactor, tieValue, provisionalMatches, btIterations, btTolerance, ciBootstrapSamples)
 * @returns The initialized `RatingState` with `config`, a `records` map for each id, and an empty `history`
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
 * Updates the state's records according to each observation; if the configured backend is not
 * "bradley-terry", the batch is appended to the state's history.
 *
 * @param state - The rating state to update (mutated in place)
 * @param batch - Array of pairwise observations to apply; an empty array is a no-op
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
 * Retrieve the current rating standings from the provided state using default options.
 *
 * @returns An array of rating standings sorted by rating, then wins, then id; each standing includes rating, win/draw/loss counters, uncertainty, and `ciLow`/`ciHigh` when confidence intervals are available.
 */
export function getRatingStandings(state: RatingState): RatingStanding[] {
	return getRatingStandingsWithOptions(state, {});
}

/**
 * Produce current rating standings with confidence intervals, optionally computed via bootstrap.
 *
 * @param state - The rating state containing all records and history.
 * @param options - Options to control confidence-interval computation.
 * @param options.bootstrapCi - If true, compute per-id CIs using bootstrap resampling of the history; otherwise use each record's uncertainty with a normal-approximation multiplier.
 * @param options.confidence - Confidence level in the range (0,1) used to compute CI bounds; defaults to the engine's default confidence when omitted.
 * @returns An array of rating standings (records) augmented with `ciLow` and `ciHigh`, sorted by rating desc, then wins desc, then id asc.
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
 * Compute the expected score (win probability) of player A against player B using their current ratings.
 *
 * @param state - The rating state containing records and configuration; if a player ID is not present, the state's `initialRating` is used
 * @param aId - Identifier of player A
 * @param bId - Identifier of player B
 * @returns The expected score for player A against player B, a number between 0 and 1 where larger values indicate a higher probability that A outperforms B
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
 * Convert an in-memory rating state into a plain serializable representation.
 *
 * @param state - The in-memory RatingState to serialize
 * @returns A StoredRatingState containing the engine `config`, an array of `records`, and the `history` of observations
 */
export function serializeRatingState(state: RatingState): StoredRatingState {
	return {
		config: state.config,
		records: Array.from(state.records.values()),
		history: state.history,
	};
}

/**
 * Reconstructs an in-memory RatingState from a stored representation.
 *
 * @param stored - The persisted rating state to deserialize
 * @returns The reconstructed RatingState containing `config`, a `records` map keyed by id, and `history`
 */
export function deserializeRatingState(stored: StoredRatingState): RatingState {
	return {
		config: stored.config,
		records: new Map(stored.records.map((record) => [record.id, record])),
		history: stored.history,
	};
}