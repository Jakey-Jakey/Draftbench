import { getConfig, getPlayoffJudges, getSwissJudge } from "./config";
import type { StoredSwissContestant, StoredSwissMatch } from "./state";
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
	placements: { first: number; second: number; third: number };
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

// ============================================================================
// Leaderboard Computation
// ============================================================================

/**
 * Computes the sorted leaderboard data.
 */
export function getLeaderboard(
	contestants: SwissContestant[],
	swissMatches: SwissMatch[],
	playoffResults: Map<string, PlayoffResult> | null,
	// Optional revisions map to add metadata
	revisionsById?: Map<string, any>,
): LeaderboardEntry[] {
	// Combine Swiss and Playoff scores for top-8
	const finalScores = new Map<string, number>();
	const playoffOnly = new Map<string, PlayoffResult>();

	for (const c of contestants) {
		finalScores.set(c.id, c.points);
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
		const scoreA = finalScores.get(a.id) ?? 0;
		const scoreB = finalScores.get(b.id) ?? 0;
		if (scoreB !== scoreA) return scoreB - scoreA;

		// Tiebreaker 1: Playoff performance (higher points, fewer losses)
		const playoffA = playoffOnly.get(a.id);
		const playoffB = playoffOnly.get(b.id);
		if (playoffA && playoffB) {
			// First by playoff points
			if (playoffB.points !== playoffA.points)
				return playoffB.points - playoffA.points;
			// Then by fewer losses (undefeated > 1 loss)
			if (playoffA.losses !== playoffB.losses)
				return playoffA.losses - playoffB.losses;
		} else if (playoffA && !playoffB) {
			return -1; // A was in playoff, B wasn't
		} else if (!playoffA && playoffB) {
			return 1; // B was in playoff, A wasn't
		}

		// Tiebreaker 2: Swiss placements (most 1sts, then most 2nds)
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
	revisionsById?: Map<string, any>,
): string {
	const entries = getLeaderboard(
		contestants,
		swissMatches,
		playoffResults,
		revisionsById,
	);
	return formatLeaderboardMarkdown(entries, swissMatches, playoffResults);
}

/**
 * Formats leaderboard data into markdown.
 */
function formatLeaderboardMarkdown(
	sorted: LeaderboardEntry[],
	swissMatches: SwissMatch[],
	playoffResults: Map<string, PlayoffResult> | null,
): string {
	const config = getConfig();
	const SWISS_ROUNDS = config.tournament.swissRounds;
	const TOP_N_PLAYOFF = config.tournament.playoffSize;
	const SWISS_JUDGE = getSwissJudge();
	const PLAYOFF_JUDGES = getPlayoffJudges();

	// Calculate model-level stats
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
		// Use keys from ID (default) or potentially enriched metadata could be used, 
		// but keeping it simple based on ID convention generally used in stats
		const [gen, rev, revi] = c.id.split("_");

		for (const [role, model] of [
			["generator", c.generator || gen],
			["reviewer", c.reviewer || rev],
			["reviser", c.reviser || revi],
		] as const) {
			if (!model) continue;
			const stats = modelStats[role].get(model) ?? {
				count: 0,
				avgRank: 0,
				top8: 0,
			};
			stats.avgRank = (stats.avgRank * stats.count + c.rank) / (stats.count + 1);
			stats.count++;
			stats.top8 += inTop8;
			modelStats[role].set(model, stats);
		}
	});

	// Build markdown
	let md = "# 🏆 Tournament Leaderboard\n\n";
	const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
	md += `> **${SWISS_ROUNDS} Swiss rounds (${SWISS_FORMAT})** + **Top-${TOP_N_PLAYOFF} Round Robin playoff**\n>\n`;
	md += `> Swiss Judge: ${getShortModelName(SWISS_JUDGE.model)} (${SWISS_JUDGE.effort ?? "low"}) | Playoff Judges: ${PLAYOFF_JUDGES.map((j) => `${getShortModelName(j.model)} (${j.effort ?? "high"})`).join(" + ")}\n>\n`;
	md += `> Tiebreaker: Playoff performance → Swiss placements\n\n`;

	// Model Performance Summary
	md += "## 📊 Model Performance Summary\n\n";
	md += "### By Role\n\n";
	md += "| Role | Model Stats |\n";
	md += "|------|-------------|\n";

	for (const role of ["generator", "reviewer", "reviser"] as const) {
		const stats = modelStats[role];
		const entries = Array.from(stats.entries())
			.map(
				([model, s]) =>
					`${model}: Avg #${s.avgRank.toFixed(1)} (${s.top8} in T8)`,
			)
			.join(", ");
		md += `| **${role.charAt(0).toUpperCase() + role.slice(1)}** | ${entries} |\n`;
	}

	// Winner breakdown
	if (sorted.length > 0) {
		const winner = sorted[0]!;
		md += `\n### 🥇 Winner: \`${winner.id}\`\n\n`;
		md += `- **Generated by**: ${winner.generator}\n`;
		md += `- **Reviewed by**: ${winner.reviewer}\n`;
		md += `- **Revised by**: ${winner.reviser}\n`;
		md += `- **Swiss Points**: ${winner.points}\n`;
		if (winner.playoffWins !== undefined) {
			md += `- **Playoff Record**: ${winner.playoffWins}W / ${winner.playoffDraws}D / ${winner.playoffLosses}L\n`;
		}
		md += "\n";
	}

	// Final Rankings Table
	md += "## 🏅 Final Rankings\n\n";
	md +=
		"| # | ID | Gen | Rev | Revi | Swiss | Playoff | Total | Swiss 1st/2nd/3rd |\n";
	md +=
		"|---|-----|-----|-----|------|-------|---------|-------|-------------------|\n";

	sorted.forEach((c) => {
		const medal = c.rank <= 3 ? ["🥇", "🥈", "🥉"][c.rank - 1] : "";
		const playoffStr = c.playoffPoints !== undefined
			? `${c.playoffWins}W/${c.playoffDraws}D/${c.playoffLosses}L`
			: "-";
		const placementStr = `${c.placements.first}/${c.placements.second}/${c.placements.third}`;
		md += `| ${medal}${c.rank} | ${c.id} | ${c.generator} | ${c.reviewer} | ${c.reviser} | ${c.points} | ${playoffStr} | ${c.totalScore.toFixed(1)} | ${placementStr} |\n`;
	});

	// Top 8 Playoff Details
	md += "\n## 🎯 Playoff Details (Top 8)\n\n";
	if (playoffResults) {
		const playoffEntries = sorted.filter(c => c.playoffPoints !== undefined);
		// Sort specifically for this table (rank in playoff)
		playoffEntries.sort((a, b) => (b.playoffPoints!) - (a.playoffPoints!) || (a.playoffLosses!) - (b.playoffLosses!));

		md += "| # | ID | W | D | L | Pts | Win Rate |\n";
		md += "|---|-----|---|---|---|-----|----------|\n";

		playoffEntries.forEach((c, index) => {
			const medal = index < 3 ? ["🥇", "🥈", "🥉"][index] : "";
			// Use original values
			const wins = c.playoffWins!;
			const draws = c.playoffDraws!;
			const losses = c.playoffLosses!;
			const points = c.playoffPoints!;

			const totalGames = wins + draws + losses;
			const winRate =
				totalGames > 0
					? (((wins + draws * 0.5) / totalGames) * 100).toFixed(0)
					: "0";
			md += `| ${medal}${index + 1} | ${c.id} | ${wins} | ${draws} | ${losses} | ${points} | ${winRate}% |\n`;
		});
	}

	// Swiss Match History (condensed)
	md += "\n## 📜 Swiss Match History\n\n";
	md += "<details>\n<summary>Click to expand all rounds</summary>\n\n";

	for (let r = 1; r <= SWISS_ROUNDS; r++) {
		const roundMatches = swissMatches.filter((m) => m.round === r);
		md += `### Round ${r}\n\n`;
		for (const m of roundMatches) {
			md += `- **${m.first}** > ${m.second} > ${m.third}\n`;
		}
		md += "\n";
	}
	md += "</details>\n";

	return md;
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * Converts stored Swiss contestants to runtime format.
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
	}));
}

/**
 * Converts runtime Swiss contestants to stored format.
 */
export function runtimeToStoredContestants(
	contestants: SwissContestant[],
): StoredSwissContestant[] {
	return contestants.map((c) => ({
		id: c.id,
		points: c.points,
		opponents: Array.from(c.opponents),
		placements: c.placements,
	}));
}
