import type { SwissMatch } from "../leaderboard";
import type { PairwiseObservation } from "./types";

/**
 * Produce a PairwiseObservation for two players by comparing their numeric scores.
 *
 * @param aId - Identifier of player A
 * @param bId - Identifier of player B
 * @param aScore - Numeric score for player A used to determine the outcome
 * @param bScore - Numeric score for player B used to determine the outcome
 * @param round - Tournament round number to include in the observation
 * @param sourceMatchId - Source match identifier to include in the observation
 * @param tieValue - Value to assign to each player's score when `aScore` equals `bScore`
 * @returns A PairwiseObservation with `scoreA` and `scoreB` set to `tieValue` when scores are equal, otherwise the winner receives `1` and the loser `0`; includes `round` and `sourceMatchId`
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
 * Build a compact source identifier for a Swiss match.
 *
 * The identifier is formatted as `round{round}:{id1|id2|...}` using the match's
 * round and ordered ids.
 *
 * @param match - The Swiss match whose round and ids will be used
 * @returns The source match identifier string in the form `round{round}:{id1|id2|...}`
 */
function getSourceMatchId(match: SwissMatch): string {
	return `round${match.round}:${match.ids.join("|")}`;
}

/**
 * Convert a Swiss-style match record into one or more pairwise observations.
 *
 * Filters out non-playable IDs ("N/A", "BYE") and produces pairwise comparisons for the remaining players:
 * - For two players: uses sharedPoints when available, treats `tieGroup === "head_to_head"` as a draw using `tieValue`, otherwise assigns a win to the player listed in `match.first`.
 * - For three players: uses sharedPoints for all three pairwise comparisons when available; otherwise falls back to ordinal scoring based on `match.first`, `match.second`, and `match.third`.
 *
 * @param match - The SwissMatch to convert.
 * @param tieValue - Score to assign to each player in a tied comparison (default: 0.5).
 * @returns An array of PairwiseObservation objects representing pairwise comparisons derived from the match.
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