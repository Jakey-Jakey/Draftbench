import { getConfig, getPlayoffJudges, getSwissJudges } from "./config";
import type {
	StoredInitialLeaderboardResult,
	StoredSwissContestant,
} from "./state";
import { getShortModelName } from "./utils";

// ============================================================================
// Leaderboard Types
// ============================================================================

/**
 * Runtime Swiss contestant with Set for opponents (vs array in stored state).
 */
export interface SwissContestant {
	id: string;
	text: string;
	points: number;
	opponents: Set<string>;
	placements: { first: number; second: number; third: number; ties?: number };
	wins?: number;
	losses?: number;
	draws?: number;
	rating?: number;
	ratingUncertainty?: number;
	ratingCiLow?: number;
	ratingCiHigh?: number;
}

/**
 * Swiss match result.
 */
export interface SwissMatch {
	round: number;
	ids: [string, string, string];
	first: string;
	second: string;
	third: string;
	reasoning: string;
	tieGroup?: "none" | "top2" | "bottom2" | "all3" | "head_to_head";
	sharedPoints?: Record<string, number>;
}

/**
 * Playoff result for a single contestant.
 */
export interface PlayoffResult {
	points: number;
	wins: number;
	losses: number;
	draws: number;
}

/**
 * Enriched leaderboard entry with calculated ranks and stats.
 */
export interface LeaderboardEntry extends SwissContestant {
	rank: number;
	totalScore: number;
	playoffPoints?: number;
	playoffWins?: number;
	playoffDraws?: number;
	playoffLosses?: number;
	generator?: string;
	reviewer?: string;
	reviser?: string;
}

interface RevisionMetadata {
	task?: {
		generator?: string;
		reviewer?: string;
		reviser?: string;
	};
}

// ============================================================================
// Nickname Helper
// ============================================================================

/**
 * Creates a short, readable nickname from a revision ID.
 * Example: "claude-opus-4.5_gpt-5.2_gemini-3-pro-preview" -> "Claude → GPT → Gemini"
 */
function formatRevisionNickname(id: string): string {
	const parts = id.split("_");
	return parts.map((p) => getShortNickname(p)).join(" → ");
}

/**
 * Gets a short, capitalized nickname from a model part.
 * Uses getShortModelName for proper extraction, then capitalizes.
 */
function getShortNickname(modelPart: string): string {
	// If it looks like a full slug, use getShortModelName
	if (modelPart.includes("/") || modelPart.includes("-")) {
		const short = getShortModelName(modelPart);
		return capitalizeFirst(short);
	}
	// Otherwise it's already a short name from the revision ID
	return capitalizeFirst(modelPart);
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalizeFirst(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// Leaderboard Computation
// ============================================================================

/**
 * Build the tournament leaderboard and return entries ordered by final ranking.
 *
 * Uses contestant ratings as the base score when rating mode is enabled and all contestants have numeric ratings; otherwise uses Swiss points. If playoff results are provided, adds a weighted playoff bonus (playoff points × 2) and prioritizes playoff participants when sorting. Tie-breakers include playoff metrics (for qualifiers), final score, wins, and Swiss placements.
 *
 * @param contestants - Runtime contestants to include in the leaderboard
 * @param _swissMatches - Swiss match data (unused by this function but kept for signature compatibility)
 * @param playoffResults - Optional map of playoff results keyed by contestant id
 * @param revisionsById - Optional map of revision metadata used to populate generator/reviewer/reviser fields
 * @returns The sorted list of leaderboard entries with `rank`, `totalScore`, and optional playoff fields (`playoffPoints`, `playoffWins`, `playoffDraws`, `playoffLosses`) populated where applicable
 */
export function getLeaderboard(
	contestants: SwissContestant[],
	_swissMatches: SwissMatch[],
	playoffResults: Map<string, PlayoffResult> | null,
	// Optional revisions map to add metadata
	revisionsById?: Map<string, RevisionMetadata>,
): LeaderboardEntry[] {
	// Combine Swiss and Playoff scores for top-8
	const finalScores = new Map<string, number>();
	const playoffOnly = new Map<string, PlayoffResult>();
	const ratingEnabled = getConfig().tournament.rating.enabled;
	// Avoid mixing scales (rating vs points) if some contestants are missing ratings.
	const useRating =
		ratingEnabled &&
		contestants.length > 0 &&
		contestants.every((c) => typeof c.rating === "number");

	for (const c of contestants) {
		finalScores.set(c.id, useRating ? (c.rating as number) : c.points);
	}

	// Add playoff bonus for top-8 (weighted higher)
	if (playoffResults) {
		for (const [id, result] of playoffResults) {
			const swissPoints = finalScores.get(id) ?? 0;
			// Playoff points are weighted 2x to ensure they dominate final ranking
			finalScores.set(id, swissPoints + result.points * 2);
			playoffOnly.set(id, result);
		}
	}

	// Sort by final score, then tiebreakers
	const sorted = [...contestants].sort((a, b) => {
		// Playoff dominates final ordering for qualifiers, regardless of rating/points mode.
		const playoffA = playoffOnly.get(a.id);
		const playoffB = playoffOnly.get(b.id);
		if (playoffA && !playoffB) return -1;
		if (!playoffA && playoffB) return 1;
		if (playoffA && playoffB) {
			if (playoffB.points !== playoffA.points)
				return playoffB.points - playoffA.points;
			if (playoffA.losses !== playoffB.losses)
				return playoffA.losses - playoffB.losses;
			if (playoffB.wins !== playoffA.wins) return playoffB.wins - playoffA.wins;
			if (playoffB.draws !== playoffA.draws)
				return playoffB.draws - playoffA.draws;
		}

		const scoreA = finalScores.get(a.id) ?? 0;
		const scoreB = finalScores.get(b.id) ?? 0;
		if (scoreB !== scoreA) return scoreB - scoreA;

		// Tiebreaker: Win/Loss record (1v1 format specific)
		const winsA = a.wins ?? 0;
		const winsB = b.wins ?? 0;
		if (winsB !== winsA) return winsB - winsA;

		// Tiebreaker: Swiss placements (most 1sts, then most 2nds - multi-player format)
		if (b.placements.first !== a.placements.first)
			return b.placements.first - a.placements.first;
		return b.placements.second - a.placements.second;
	});

	// Enrich entries
	return sorted.map((c, index) => {
		const playoff = playoffOnly.get(c.id);
		const [gen, rev, revi] = c.id.split("_");
		const revMeta = revisionsById?.get(c.id);

		const entry: LeaderboardEntry = {
			...c,
			rank: index + 1,
			totalScore: finalScores.get(c.id) ?? 0,
			generator: revMeta?.task?.generator ?? gen,
			reviewer: revMeta?.task?.reviewer ?? rev,
			reviser: revMeta?.task?.reviser ?? revi,
		};

		if (playoff) {
			entry.playoffPoints = playoff.points;
			entry.playoffWins = playoff.wins;
			entry.playoffDraws = playoff.draws;
			entry.playoffLosses = playoff.losses;
		}

		return entry;
	});
}

/**
 * Computes leaderboard and formats as markdown.
 * Wrapper around getLeaderboard.
 */
export function computeLeaderboard(
	contestants: SwissContestant[],
	swissMatches: SwissMatch[],
	playoffResults: Map<string, PlayoffResult> | null,
	revisionsById?: Map<string, RevisionMetadata>,
	initialLeaderboardResults?: StoredInitialLeaderboardResult[] | null,
): string {
	const entries = getLeaderboard(
		contestants,
		swissMatches,
		playoffResults,
		revisionsById,
	);
	return formatLeaderboardMarkdown(
		entries,
		swissMatches,
		playoffResults,
		initialLeaderboardResults,
	);
}

/**
 * Render the tournament leaderboard and related summaries as a Markdown document.
 *
 * The output includes a header with tournament config and judges, a Winner card,
 * per-role model performance tables (generator/reviewer/reviser), a Final Rankings
 * table (optionally showing ratings and playoff scores), detailed Playoff results,
 * and a Seed Selection section when initial leaderboard drafts are provided.
 *
 * @param sorted - Sorted leaderboard entries enriched with rank, totalScore and optional playoff/rating fields
 * @param _swissMatches - Swiss match data (accepted for compatibility; not used in the rendered markdown)
 * @param playoffResults - Map of playoff results keyed by contestant id, or null if no playoffs occurred
 * @param initialLeaderboardResults - Optional seed/draft results used to populate the Seed Selection table
 * @returns The assembled leaderboard as a Markdown string
 */
function formatLeaderboardMarkdown(
	sorted: LeaderboardEntry[],
	_swissMatches: SwissMatch[],
	playoffResults: Map<string, PlayoffResult> | null,
	initialLeaderboardResults?: StoredInitialLeaderboardResult[] | null,
): string {
	const config = getConfig();
	const SWISS_ROUNDS = config.tournament.swissRounds;
	const TOP_N_PLAYOFF = config.tournament.playoffSize;
	const SWISS_JUDGES = getSwissJudges();
	const PLAYOFF_JUDGES = getPlayoffJudges();
	const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
	const is1v1 = SWISS_FORMAT === "1v1";
	const showRating =
		config.tournament.rating.enabled &&
		sorted.some((entry) => typeof entry.rating === "number");

	// Calculate model-level stats (using short nicknames)
	const modelStats = {
		generator: new Map<
			string,
			{ count: number; avgRank: number; top8: number }
		>(),
		reviewer: new Map<
			string,
			{ count: number; avgRank: number; top8: number }
		>(),
		reviser: new Map<
			string,
			{ count: number; avgRank: number; top8: number }
		>(),
	};

	sorted.forEach((c) => {
		const inTop8 = playoffResults?.has(c.id) ? 1 : 0;

		for (const [role, model] of [
			["generator", c.generator],
			["reviewer", c.reviewer],
			["reviser", c.reviser],
		] as const) {
			if (!model) continue;
			const nickname = getShortNickname(model);
			const stats = modelStats[role].get(nickname) ?? {
				count: 0,
				avgRank: 0,
				top8: 0,
			};
			stats.avgRank =
				(stats.avgRank * stats.count + c.rank) / (stats.count + 1);
			stats.count++;
			stats.top8 += inTop8;
			modelStats[role].set(nickname, stats);
		}
	});

	// Build markdown
	let md = "# 🏆 Tournament Leaderboard\n\n";

	// Header section with tournament config
	md += `> **${SWISS_ROUNDS} Swiss rounds (${SWISS_FORMAT})** → **Top-${TOP_N_PLAYOFF} Round Robin**\n>\n`;
	md += `> Swiss: ${SWISS_JUDGES.map((j) => `${getShortNickname(getShortModelName(j.model))} (${j.effort ?? "low"})`).join(" + ")}`;
	md += ` | Playoff: ${PLAYOFF_JUDGES.map((j) => `${getShortNickname(getShortModelName(j.model))} (${j.effort ?? "high"})`).join(" + ")}\n\n`;

	md += "---\n\n";

	// Winner showcase (card format)
	if (sorted.length > 0) {
		const winner = sorted[0];
		if (!winner) {
			return md;
		}
		md += "## 🥇 Winner\n\n";
		md += `**${formatRevisionNickname(winner.id)}**\n\n`;
		md += `- **Swiss:** ${winner.points} pts`;
		if (!is1v1) {
			md += ` (${winner.placements.first} firsts, ${winner.placements.second} seconds)`;
		}
		md += "\n";
		if (showRating && winner.rating !== undefined) {
			const ciLow =
				winner.ratingCiLow ?? winner.rating - (winner.ratingUncertainty ?? 0);
			const ciHigh =
				winner.ratingCiHigh ?? winner.rating + (winner.ratingUncertainty ?? 0);
			md += `- **Rating:** ${winner.rating.toFixed(1)} (CI ${ciLow.toFixed(1)}–${ciHigh.toFixed(1)})\n`;
		}
		if (winner.playoffWins !== undefined) {
			md += `- **Playoff:** ${winner.playoffWins}W / ${winner.playoffDraws}D / ${winner.playoffLosses}L\n`;
		}
		md += "\n---\n\n";
	}

	// Model Performance Summary - separate tables per role
	md += "## 📊 Model Performance\n\n";

	// Generator stats (with seed win rate if available)
	md += "### As Generator\n\n";
	md += "| Model | Avg Rank | Top 8 |";
	if (initialLeaderboardResults && initialLeaderboardResults.length > 0) {
		md += " Seed Selected |";
	}
	md += "\n";
	md += "|-------|----------|-------|";
	if (initialLeaderboardResults && initialLeaderboardResults.length > 0) {
		md += "---------------|";
	}
	md += "\n";

	const genStats = Array.from(modelStats.generator.entries()).sort(
		(a, b) => a[1].avgRank - b[1].avgRank,
	);
	for (const [model, stats] of genStats) {
		md += `| ${model} | #${stats.avgRank.toFixed(1)} | ${stats.top8} |`;
		if (initialLeaderboardResults && initialLeaderboardResults.length > 0) {
			const seedResult = initialLeaderboardResults.find(
				(r) => getShortNickname(getShortModelName(r.model)) === model,
			);
			if (seedResult) {
				md += ` Draft ${seedResult.selectedDraftIndex}`;
				if (seedResult.wins > 0 || seedResult.losses > 0) {
					md += ` (${seedResult.wins}W/${seedResult.draws}D/${seedResult.losses}L)`;
				}
				md += " |";
			} else {
				md += " - |";
			}
		}
		md += "\n";
	}
	md += "\n";

	// Reviewer stats
	md += "### As Reviewer\n\n";
	md += "| Model | Avg Rank | Top 8 |\n";
	md += "|-------|----------|-------|\n";
	const revStats = Array.from(modelStats.reviewer.entries()).sort(
		(a, b) => a[1].avgRank - b[1].avgRank,
	);
	for (const [model, stats] of revStats) {
		md += `| ${model} | #${stats.avgRank.toFixed(1)} | ${stats.top8} |\n`;
	}
	md += "\n";

	// Reviser stats
	md += "### As Reviser\n\n";
	md += "| Model | Avg Rank | Top 8 |\n";
	md += "|-------|----------|-------|\n";
	const reviStats = Array.from(modelStats.reviser.entries()).sort(
		(a, b) => a[1].avgRank - b[1].avgRank,
	);
	for (const [model, stats] of reviStats) {
		md += `| ${model} | #${stats.avgRank.toFixed(1)} | ${stats.top8} |\n`;
	}

	md += "\n---\n\n";

	// Final Rankings Table (simplified)
	md += "## 🏅 Final Rankings\n\n";
	md += "| # | Revision | Swiss |";
	if (showRating) {
		md += " Rating |";
	}
	md += " Playoff | Total |\n";
	md += "|---|----------|-------|";
	if (showRating) {
		md += "--------|";
	}
	md += "---------|-------|\n";

	sorted.forEach((c) => {
		const medal = c.rank <= 3 ? ["🥇", "🥈", "🥉"][c.rank - 1] : "";
		const nickname = formatRevisionNickname(c.id);
		const playoffStr =
			c.playoffPoints !== undefined
				? `${c.playoffWins}W/${c.playoffDraws}D/${c.playoffLosses}L`
				: "-";

		md += `| ${medal}${c.rank} | ${nickname} | ${c.points} |`;
		if (showRating) {
			const ratingStr = c.rating !== undefined ? c.rating.toFixed(1) : "-";
			md += ` ${ratingStr} |`;
		}
		md += ` ${playoffStr} | ${c.totalScore.toFixed(1)} |\n`;
	});

	md += "\n---\n\n";

	// Playoff Details
	md += "## 🎯 Playoff Details\n\n";
	if (playoffResults) {
		const playoffEntries = sorted.filter((c) => c.playoffPoints !== undefined);
		playoffEntries.sort(
			(a, b) =>
				(b.playoffPoints ?? 0) - (a.playoffPoints ?? 0) ||
				(a.playoffLosses ?? 0) - (b.playoffLosses ?? 0),
		);

		md += "| # | Revision | W | D | L | Pts | Win Rate |\n";
		md += "|---|----------|---|---|---|-----|----------|\n";

		playoffEntries.forEach((c, index) => {
			const medal = index < 3 ? ["🥇", "🥈", "🥉"][index] : "";
			const nickname = formatRevisionNickname(c.id);
			const wins = c.playoffWins ?? 0;
			const draws = c.playoffDraws ?? 0;
			const losses = c.playoffLosses ?? 0;
			const points = c.playoffPoints ?? 0;

			const totalGames = wins + draws + losses;
			const winRate =
				totalGames > 0
					? (((wins + draws * 0.5) / totalGames) * 100).toFixed(0)
					: "0";
			md += `| ${medal}${index + 1} | ${nickname} | ${wins} | ${draws} | ${losses} | ${points} | ${winRate}% |\n`;
		});
	} else {
		md += "*No playoff results available*\n";
	}

	md += "\n---\n\n";

	// Seed Selection section (replaces Swiss Match History)
	md += "## 🌱 Seed Selection\n\n";
	if (initialLeaderboardResults && initialLeaderboardResults.length > 0) {
		md +=
			"Each model's initial drafts were ranked to select the best seed for the tournament.\n\n";
		md += "| Model | Selected | Record | Margin |\n";
		md += "|-------|----------|--------|--------|\n";

		for (const result of initialLeaderboardResults) {
			const nickname = getShortNickname(getShortModelName(result.model));
			const record =
				result.wins > 0 || result.losses > 0
					? `${result.wins}W/${result.draws}D/${result.losses}L`
					: "-";
			const margin =
				result.wins > 0 || result.losses > 0
					? `+${result.wins - result.losses}`
					: "-";
			md += `| ${nickname} | Draft ${result.selectedDraftIndex}/${result.totalDrafts} | ${record} | ${margin} |\n`;
		}
	} else {
		md +=
			"*Initial leaderboard was not enabled or only 1 draft per model was generated.*\n";
	}

	return md;
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * Transform stored contestant records into runtime `SwissContestant` objects.
 *
 * @param stored - Array of stored contestant records to convert
 * @param textLookup - Map from contestant `id` to the display `text` used for the runtime object
 * @returns An array of `SwissContestant` instances where opponents are a `Set`, placement and scoring fields are preserved, numeric stats default to zero when absent, and rating-related fields are forwarded when present
 */
export function storedToRuntimeContestants(
	stored: StoredSwissContestant[],
	textLookup: Map<string, string>,
): SwissContestant[] {
	return stored.map((c) => ({
		id: c.id,
		text: textLookup.get(c.id) ?? "",
		points: c.points,
		opponents: new Set(c.opponents),
		placements: c.placements,
		wins: c.wins ?? 0,
		losses: c.losses ?? 0,
		draws: c.draws ?? 0,
		rating: c.rating,
		ratingUncertainty: c.ratingUncertainty,
		ratingCiLow: c.ratingCiLow,
		ratingCiHigh: c.ratingCiHigh,
	}));
}

/**
 * Convert runtime SwissContestant objects into the persisted StoredSwissContestant shape.
 *
 * Each returned entry preserves id, points, placements, opponent list, and rating fields; wins, losses,
 * and draws default to 0 when missing on the runtime object.
 *
 * @param contestants - Runtime contestants to convert
 * @returns An array of stored contestant records ready for persistence
 */
export function runtimeToStoredContestants(
	contestants: SwissContestant[],
): StoredSwissContestant[] {
	return contestants.map((c) => ({
		id: c.id,
		points: c.points,
		opponents: Array.from(c.opponents),
		placements: c.placements,
		wins: c.wins ?? 0,
		losses: c.losses ?? 0,
		draws: c.draws ?? 0,
		rating: c.rating,
		ratingUncertainty: c.ratingUncertainty,
		ratingCiLow: c.ratingCiLow,
		ratingCiHigh: c.ratingCiHigh,
	}));
}