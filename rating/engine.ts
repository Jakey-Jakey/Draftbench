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
const STARTING_UNCERTAINTY = 350;

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

function confidenceMultiplier(): number {
	return 1.64;
}

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

	if (state.config.backend === "bradley-terry") {
		applyBradleyTerryBatch(state, batch);
	} else {
		applyEloBatch(state, batch);
		state.history.push(...batch);
	}
}

export function getRatingStandings(state: RatingState): RatingStanding[] {
	const z = confidenceMultiplier();
	return Array.from(state.records.values())
		.map((record) => ({
			...record,
			ciLow: record.rating - z * record.uncertainty,
			ciHigh: record.rating + z * record.uncertainty,
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
		config: stored.config,
		records: new Map(stored.records.map((record) => [record.id, record])),
		history: stored.history,
	};
}
