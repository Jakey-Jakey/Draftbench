import type { SwissMatch } from "../leaderboard";
import type { PairwiseObservation } from "./types";

/**
 * Create a PairwiseObservation for two player IDs based on their numeric scores, using `tieValue` for draws.
 *
 * @param aId - Identifier for player A
 * @param bId - Identifier for player B
 * @param aScore - Numeric score for player A used to determine the outcome
 * @param bScore - Numeric score for player B used to determine the outcome
 * @param round - Round number associated with the observation
 * @param sourceMatchId - Identifier of the originating match
 * @param tieValue - Score to assign to each player when `aScore` equals `bScore`
 * @returns A PairwiseObservation where `scoreA` and `scoreB` are `tieValue` for a draw; otherwise the winner's score is `1` and the loser's is `0`
 */
function toPairwiseFromScores(
	aId: string,
	bId: string,
	aScore: number,
	bScore: number,
	round: number,
	sourceMatchId: string,
	tieValue: number,
): PairwiseObservation {
	if (aScore === bScore) {
		return {
			aId,
			bId,
			scoreA: tieValue,
			scoreB: tieValue,
			round,
			sourceMatchId,
		};
	}
	if (aScore > bScore) {
		return { aId, bId, scoreA: 1, scoreB: 0, round, sourceMatchId };
	}
	return { aId, bId, scoreA: 0, scoreB: 1, round, sourceMatchId };
}

/**
 * Constructs a compact identifier for a SwissMatch.
 *
 * @param match - The SwissMatch whose `round` and `ids` are used to build the identifier
 * @returns A string in the format `round{round}:{id1|id2|...}` (e.g. `round3:playerA|playerB`)
 */
function getSourceMatchId(match: SwissMatch): string {
	return `round${match.round}:${match.ids.join("|")}`;
}

/**
 * Convert a SwissMatch into an array of pairwise observations for rating.
 *
 * This produces one or more PairwiseObservation entries derived from the match:
 * - Filters out "N/A" and "BYE" participant IDs and returns an empty array if fewer than two remain.
 * - For two-player matches: uses sharedPoints when available, returns a draw if the match tieGroup is "head_to_head", otherwise assigns win to the declared `first`.
 * - For three-player matches: if all sharedPoints are available, produces the three pairwise comparisons from those points; otherwise falls back to ordinal ranking based on `first`, `second`, and `third`.
 *
 * @param match - The SwissMatch to convert into pairwise comparisons.
 * @param tieValue - Score to assign to each side for a draw; defaults to 0.5.
 * @returns An array of PairwiseObservation representing pairwise results extracted or derived from `match`.
 */
export function pairwiseFromSwissMatch(
	match: SwissMatch,
	tieValue = 0.5,
): PairwiseObservation[] {
	const sourceMatchId = getSourceMatchId(match);
	const ids = match.ids.filter((id) => id !== "N/A" && id !== "BYE");
	if (ids.length < 2) return [];

	// 1v1 or 1v1 draw
	if (ids.length === 2) {
		const [aId, bId] = ids;
		if (!aId || !bId) return [];
		const sharedA = match.sharedPoints?.[aId];
		const sharedB = match.sharedPoints?.[bId];
		if (sharedA !== undefined && sharedB !== undefined) {
			return [
				toPairwiseFromScores(
					aId,
					bId,
					sharedA,
					sharedB,
					match.round,
					sourceMatchId,
					tieValue,
				),
			];
		}

		if ((match.tieGroup ?? "none") === "head_to_head") {
			return [
				{
					aId,
					bId,
					scoreA: tieValue,
					scoreB: tieValue,
					round: match.round,
					sourceMatchId,
				},
			];
		}

		const scoreA = match.first === aId ? 1 : 0;
		const scoreB = match.first === bId ? 1 : 0;
		return [{ aId, bId, scoreA, scoreB, round: match.round, sourceMatchId }];
	}

	// 1v1v1 converted to 3 pairwise comparisons based on shared points when available.
	const [idA, idB, idC] = ids;
	if (!idA || !idB || !idC) return [];

	const pointsA = match.sharedPoints?.[idA];
	const pointsB = match.sharedPoints?.[idB];
	const pointsC = match.sharedPoints?.[idC];

	if (pointsA !== undefined && pointsB !== undefined && pointsC !== undefined) {
		return [
			toPairwiseFromScores(
				idA,
				idB,
				pointsA,
				pointsB,
				match.round,
				sourceMatchId,
				tieValue,
			),
			toPairwiseFromScores(
				idA,
				idC,
				pointsA,
				pointsC,
				match.round,
				sourceMatchId,
				tieValue,
			),
			toPairwiseFromScores(
				idB,
				idC,
				pointsB,
				pointsC,
				match.round,
				sourceMatchId,
				tieValue,
			),
		];
	}

	// Fallback to ordinal ranking.
	const ordinalScores: Record<string, number> = {
		[match.first]: 2,
		[match.second]: 1,
		[match.third]: 0,
	};

	return [
		toPairwiseFromScores(
			idA,
			idB,
			ordinalScores[idA] ?? 0,
			ordinalScores[idB] ?? 0,
			match.round,
			sourceMatchId,
			tieValue,
		),
		toPairwiseFromScores(
			idA,
			idC,
			ordinalScores[idA] ?? 0,
			ordinalScores[idC] ?? 0,
			match.round,
			sourceMatchId,
			tieValue,
		),
		toPairwiseFromScores(
			idB,
			idC,
			ordinalScores[idB] ?? 0,
			ordinalScores[idC] ?? 0,
			match.round,
			sourceMatchId,
			tieValue,
		),
	];
}