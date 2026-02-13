import { confidenceMultiplier } from "../utils";
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
/** Scale factor converting between latent theta space and rating space: rating = initialRating + theta * THETA_SCALE */
const THETA_SCALE = 173.7178;

function clampUnit(value: number): number {
	if (Number.isNaN(value)) return 0;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** ((ratingB - ratingA) / RATING_SCALE));
}

function updateUncertainty(record: RatingRecord): void {
	record.uncertainty = Math.max(
		MIN_UNCERTAINTY,
		STARTING_UNCERTAINTY / Math.sqrt(record.matches + 1),
	);
}

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

function getOrCreateRecord(state: RatingState, id: string): RatingRecord {
	const existing = state.records.get(id);
	if (existing) return existing;
	const created = toRecord(id, state.config.initialRating);
	state.records.set(id, created);
	return created;
}

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
 * Refits and updates player ratings using the Bradley-Terry model for a batch of pairwise observations.
 *
 * Applies each observation to the corresponding records (updating matches, outcomes, and uncertainty), then
 * performs an iterative estimation of latent skill parameters from the state's history and writes the resulting
 * ratings back into state.records. Modifies the provided state in place.
 *
 * Supports:
 * - L2 regularization (`btRegularization`): shrinks theta toward 0 (the prior mean) to reduce noise
 *   when some players have few observations.
 * - Newton/MM step sizes (`btUseNewton`): uses the diagonal of the Hessian of the BT log-likelihood
 *   to compute per-player adaptive step sizes, converging significantly faster than a fixed learning rate.
 *
 * @param state - The rating state to update
 * @param batch - Array of pairwise observations to apply before refitting ratings
 */
function applyBradleyTerryBatch(
	state: RatingState,
	batch: PairwiseObservation[],
): void {
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
		theta.set(id, (rating - state.config.initialRating) / THETA_SCALE);
	}

	const lambda = state.config.btRegularization;
	const useNewton = state.config.btUseNewton;
	const fallbackLearningRate = 0.2;

	for (let iter = 0; iter < state.config.btIterations; iter++) {
		const gradients = new Map<string, number>(ids.map((id) => [id, 0]));
		// Hessian diagonal: H_ii = -sum_j [ p_ij * (1 - p_ij) ] - lambda
		const hessianDiag = useNewton
			? new Map<string, number>(ids.map((id) => [id, 0]))
			: null;

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

			if (hessianDiag) {
				// Second derivative of log-likelihood: -p*(1-p) for each observation
				const h = -(pA * (1 - pA));
				hessianDiag.set(obs.aId, (hessianDiag.get(obs.aId) ?? 0) + h);
				hessianDiag.set(obs.bId, (hessianDiag.get(obs.bId) ?? 0) + h);
			}
		}

		// Apply L2 regularization: gradient -= lambda * theta_i, hessian -= lambda
		if (lambda > 0) {
			for (const id of ids) {
				const t = theta.get(id) ?? 0;
				gradients.set(id, (gradients.get(id) ?? 0) - lambda * t);
				if (hessianDiag) {
					hessianDiag.set(id, (hessianDiag.get(id) ?? 0) - lambda);
				}
			}
		}

		let maxChange = 0;
		for (const id of ids) {
			const current = theta.get(id) ?? 0;
			const grad = gradients.get(id) ?? 0;

			let step: number;
			if (hessianDiag) {
				// Newton step: -gradient / hessian (hessian is negative, so step = grad / |H|)
				const h = hessianDiag.get(id) ?? 0;
				const absH = Math.abs(h);
				// Guard against near-zero hessian (new player with no observations)
				step = absH > 1e-12 ? grad / absH : fallbackLearningRate * grad;
			} else {
				step = fallbackLearningRate * grad;
			}

			const updated = current + step;
			theta.set(id, updated);
			maxChange = Math.max(maxChange, Math.abs(step));
		}

		// Re-center theta to have zero mean (identifiability constraint)
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
			state.config.initialRating + (theta.get(id) ?? 0) * THETA_SCALE;
	}
}

/**
 * Creates a deterministic pseudorandom number generator initialized from the given seed.
 *
 * @param seed - The numeric seed used to initialize the generator (interpreted as an unsigned 32-bit integer)
 * @returns A zero-argument function that returns a pseudorandom number in the range [0, 1)
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
 * Computes confidence intervals using the inverse Hessian diagonal of the Bradley-Terry log-likelihood.
 *
 * For each player i, the Hessian diagonal entry is:
 *   H_ii = -sum_j [ p_ij * (1 - p_ij) ] - lambda
 * where p_ij is the predicted win probability and lambda is the L2 regularization strength.
 *
 * The asymptotic variance is Var(theta_i) = 1 / |H_ii|, giving CI = rating +/- z * sqrt(1/|H_ii|) * THETA_SCALE.
 * This is O(history) instead of O(bootstrap_samples * iterations * history) for bootstrap CIs.
 *
 * Falls back to normal (z * uncertainty) CIs when the backend is not Bradley-Terry or when
 * there is insufficient history.
 */
function hessianCi(
	state: RatingState,
	confidence: number,
): Map<string, { low: number; high: number }> {
	const ids = Array.from(state.records.keys());
	const result = new Map<string, { low: number; high: number }>();

	if (
		state.config.backend !== "bradley-terry" ||
		state.history.length < 2 ||
		ids.length < 2
	) {
		return result;
	}

	const z = confidenceMultiplier(confidence);
	const lambda = state.config.btRegularization;

	// Build theta map from current ratings
	const theta = new Map<string, number>();
	for (const id of ids) {
		const rating = state.records.get(id)?.rating ?? state.config.initialRating;
		theta.set(id, (rating - state.config.initialRating) / THETA_SCALE);
	}

	// Compute Hessian diagonal from history
	const hessianDiag = new Map<string, number>(ids.map((id) => [id, 0]));
	for (const obs of state.history) {
		const a = theta.get(obs.aId);
		const b = theta.get(obs.bId);
		if (a === undefined || b === undefined) continue;

		const pA = 1 / (1 + Math.exp(-(a - b)));
		const h = -(pA * (1 - pA));
		hessianDiag.set(obs.aId, (hessianDiag.get(obs.aId) ?? 0) + h);
		hessianDiag.set(obs.bId, (hessianDiag.get(obs.bId) ?? 0) + h);
	}

	// Add regularization contribution to Hessian
	if (lambda > 0) {
		for (const id of ids) {
			hessianDiag.set(id, (hessianDiag.get(id) ?? 0) - lambda);
		}
	}

	for (const id of ids) {
		const rating = state.records.get(id)?.rating ?? state.config.initialRating;
		const absH = Math.abs(hessianDiag.get(id) ?? 0);
		// Variance = 1/|H_ii|; convert to rating-space standard deviation
		const stdDev =
			absH > 1e-12 ? Math.sqrt(1 / absH) * THETA_SCALE : STARTING_UNCERTAINTY;
		result.set(id, {
			low: rating - z * stdDev,
			high: rating + z * stdDev,
		});
	}

	return result;
}

export function createRatingState(
	ids: string[],
	partialConfig: Partial<RatingEngineConfig>,
): RatingState {
	const config: RatingEngineConfig = {
		backend: partialConfig.backend ?? "elo",
		initialRating: partialConfig.initialRating ?? 1000,
		kFactor: partialConfig.kFactor ?? 24,
		tieValue: partialConfig.tieValue ?? 0.5,
		provisionalMatches: partialConfig.provisionalMatches ?? 12,
		btIterations: partialConfig.btIterations ?? 200,
		btTolerance: partialConfig.btTolerance ?? 1e-6,
		// Default to 0 when omitted by callers; persisted state/config loading supplies an explicit value.
		ciBootstrapSamples: partialConfig.ciBootstrapSamples ?? 0,
		btRegularization: partialConfig.btRegularization ?? 0,
		btUseNewton: partialConfig.btUseNewton ?? false,
		ciMode: partialConfig.ciMode ?? "bootstrap",
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

export function applyPairwiseBatch(
	state: RatingState,
	batch: PairwiseObservation[],
): void {
	if (batch.length === 0) return;
	state.history.push(...batch);

	if (state.config.backend === "bradley-terry") {
		applyBradleyTerryBatch(state, batch);
	} else {
		applyEloBatch(state, batch);
	}
}

export function getRatingStandings(state: RatingState): RatingStanding[] {
	return getRatingStandingsWithOptions(state, {});
}

export function getRatingStandingsWithOptions(
	state: RatingState,
	options: { bootstrapCi?: boolean; confidence?: number },
): RatingStanding[] {
	const confidence = options.confidence ?? DEFAULT_CI_CONFIDENCE;
	const z = confidenceMultiplier(confidence);

	// Determine CI source based on config ciMode when bootstrapCi is requested.
	let ciMap = new Map<string, { low: number; high: number }>();
	if (options.bootstrapCi === true) {
		const mode = state.config.ciMode ?? "bootstrap";
		if (mode === "hessian" && state.config.backend === "bradley-terry") {
			ciMap = hessianCi(state, confidence);
		} else if (mode === "bootstrap") {
			ciMap = bootstrapCi(state, confidence);
		}
		// mode === "normal" falls through with empty map -> uses z * uncertainty below
	}

	return Array.from(state.records.values())
		.map((record) => ({
			...record,
			ciLow:
				ciMap.get(record.id)?.low ?? record.rating - z * record.uncertainty,
			ciHigh:
				ciMap.get(record.id)?.high ?? record.rating + z * record.uncertainty,
		}))
		.sort((a, b) => {
			if (b.rating !== a.rating) return b.rating - a.rating;
			if (b.wins !== a.wins) return b.wins - a.wins;
			return a.id.localeCompare(b.id);
		});
}

export function estimateWinProbability(
	state: RatingState,
	aId: string,
	bId: string,
): number {
	const a = state.records.get(aId)?.rating ?? state.config.initialRating;
	const b = state.records.get(bId)?.rating ?? state.config.initialRating;
	return expectedScore(a, b);
}

export function serializeRatingState(state: RatingState): StoredRatingState {
	return {
		config: state.config,
		records: Array.from(state.records.values()),
		history: state.history,
	};
}

export function deserializeRatingState(stored: StoredRatingState): RatingState {
	return {
		config: {
			...stored.config,
			btRegularization: stored.config.btRegularization ?? 0,
			btUseNewton: stored.config.btUseNewton ?? false,
			ciMode: stored.config.ciMode ?? "bootstrap",
		},
		records: new Map(stored.records.map((record) => [record.id, record])),
		history: stored.history,
	};
}
