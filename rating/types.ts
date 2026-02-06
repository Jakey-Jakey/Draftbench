export type RatingBackend = "elo" | "bradley-terry";

export interface PairwiseObservation {
	aId: string;
	bId: string;
	scoreA: number;
	scoreB: number;
	round: number;
	sourceMatchId?: string;
}

export interface RatingEngineConfig {
	backend: RatingBackend;
	initialRating: number;
	kFactor: number;
	tieValue: number;
	provisionalMatches: number;
	btIterations: number;
	btTolerance: number;
	ciBootstrapSamples: number;
}

export interface RatingRecord {
	id: string;
	rating: number;
	matches: number;
	wins: number;
	losses: number;
	draws: number;
	uncertainty: number;
}

export interface RatingStanding extends RatingRecord {
	ciLow: number;
	ciHigh: number;
}

export interface RatingState {
	config: RatingEngineConfig;
	records: Map<string, RatingRecord>;
	history: PairwiseObservation[];
}

export interface StoredRatingState {
	config: RatingEngineConfig;
	records: RatingRecord[];
	history: PairwiseObservation[];
}
