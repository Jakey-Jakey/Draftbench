export type RatingBackend = "elo" | "bradley-terry";

export interface PairwiseObservation {
	aId: string;
	bId: string;
	scoreA: number;
	scoreB: number;
	round: number;
	sourceMatchId?: string;
}

export type CiMode = "bootstrap" | "hessian" | "normal";

export interface RatingEngineConfig {
	backend: RatingBackend;
	initialRating: number;
	kFactor: number;
	tieValue: number;
	provisionalMatches: number;
	btIterations: number;
	btTolerance: number;
	ciBootstrapSamples: number;
	/** L2 regularization strength for Bradley-Terry. Shrinks theta toward 0 (the mean). 0 = disabled. */
	btRegularization: number;
	/** When true, use per-player Hessian-diagonal (Newton/MM) step sizes instead of a fixed learning rate. */
	btUseNewton: boolean;
	/** Confidence interval computation mode: "bootstrap" (resample), "hessian" (analytic, BT only), "normal" (z * uncertainty). */
	ciMode: CiMode;
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
