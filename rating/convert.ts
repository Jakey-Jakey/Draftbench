import type { SwissMatch } from "../leaderboard";
import type { PairwiseObservation } from "./types";

function toPairwiseFromScores(
	aId: string,
	bId: string,
	aScore: number,
	bScore: number,
	round: number,
	sourceMatchId: string,
): PairwiseObservation {
	if (aScore === bScore) {
		return { aId, bId, scoreA: 0.5, scoreB: 0.5, round, sourceMatchId };
	}
	if (aScore > bScore) {
		return { aId, bId, scoreA: 1, scoreB: 0, round, sourceMatchId };
	}
	return { aId, bId, scoreA: 0, scoreB: 1, round, sourceMatchId };
}

function getSourceMatchId(match: SwissMatch): string {
	return `round${match.round}:${match.ids.join("|")}`;
}

export function pairwiseFromSwissMatch(
	match: SwissMatch,
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
				),
			];
		}

		if ((match.tieGroup ?? "none") === "head_to_head") {
			return [
				{
					aId,
					bId,
					scoreA: 0.5,
					scoreB: 0.5,
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
			),
			toPairwiseFromScores(
				idA,
				idC,
				pointsA,
				pointsC,
				match.round,
				sourceMatchId,
			),
			toPairwiseFromScores(
				idB,
				idC,
				pointsB,
				pointsC,
				match.round,
				sourceMatchId,
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
		),
		toPairwiseFromScores(
			idA,
			idC,
			ordinalScores[idA] ?? 0,
			ordinalScores[idC] ?? 0,
			match.round,
			sourceMatchId,
		),
		toPairwiseFromScores(
			idB,
			idC,
			ordinalScores[idB] ?? 0,
			ordinalScores[idC] ?? 0,
			match.round,
			sourceMatchId,
		),
	];
}
