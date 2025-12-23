import { getConfig } from "./config";
import type { StoredSwissContestant, StoredSwissMatch } from "./state";

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

// ============================================================================
// Leaderboard Computation
// ============================================================================

/**
 * Computes leaderboard from Swiss + Round Robin results.
 * Ranked by points, then by placements (most 1sts, then most 2nds).
 */
export function computeLeaderboard(
	contestants: SwissContestant[],
	swissMatches: SwissMatch[],
	playoffResults: Map<string, PlayoffResult> | null,
): string {
	const config = getConfig();
	const SWISS_ROUNDS = config.tournament.swissRounds;
	const TOP_N_PLAYOFF = config.tournament.playoffSize;
	const SWISS_JUDGE = config.tournament.swissJudge;
	const PLAYOFF_JUDGES = config.tournament.playoffJudges;

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

	sorted.forEach((c, index) => {
		const [gen, rev, revi] = c.id.split("_");
		const rank = index + 1;
		const inTop8 = playoffOnly.has(c.id) ? 1 : 0;

		for (const [role, model] of [
			["generator", gen],
			["reviewer", rev],
			["reviser", revi],
		] as const) {
			const stats = modelStats[role].get(model!) ?? {
				count: 0,
				avgRank: 0,
				top8: 0,
			};
			stats.avgRank = (stats.avgRank * stats.count + rank) / (stats.count + 1);
			stats.count++;
			stats.top8 += inTop8;
			modelStats[role].set(model!, stats);
		}
	});

	// Build markdown
	let md = "# 🏆 Tournament Leaderboard\n\n";
	md += `> **${SWISS_ROUNDS} Swiss rounds (1v1v1)** + **Top-${TOP_N_PLAYOFF} Round Robin playoff**\n>\n`;
	md += `> Swiss Judge: ${SWISS_JUDGE.model} (${SWISS_JUDGE.effort}) | Playoff Judges: ${PLAYOFF_JUDGES.map((j) => `${j.model} (${j.effort})`).join(" + ")}\n>\n`;
	md += `> Tiebreaker: Playoff performance → Swiss placements\n\n`;

	// Model Performance Summary
	md += "## 📊 Model Performance Summary\n\n";
	md += "### By Role\n\n";
	md += "| Role | Claude | GPT | Gemini |\n";
	md += "|------|--------|-----|--------|\n";

	for (const role of ["generator", "reviewer", "reviser"] as const) {
		const stats = modelStats[role];
		const claudeStats = stats.get("claude");
		const gptStats = stats.get("gpt");
		const geminiStats = stats.get("gemini");
		md += `| **${role.charAt(0).toUpperCase() + role.slice(1)}** | `;
		md += `Avg: #${claudeStats?.avgRank.toFixed(1) ?? "-"} (${claudeStats?.top8 ?? 0} in T8) | `;
		md += `Avg: #${gptStats?.avgRank.toFixed(1) ?? "-"} (${gptStats?.top8 ?? 0} in T8) | `;
		md += `Avg: #${geminiStats?.avgRank.toFixed(1) ?? "-"} (${geminiStats?.top8 ?? 0} in T8) |\n`;
	}

	// Winner breakdown
	const winner = sorted[0]!;
	const [winGen, winRev, winRevi] = winner.id.split("_");
	md += `\n### 🥇 Winner: \`${winner.id}\`\n\n`;
	md += `- **Generated by**: ${winGen}\n`;
	md += `- **Reviewed by**: ${winRev}\n`;
	md += `- **Revised by**: ${winRevi}\n`;
	md += `- **Swiss Points**: ${winner.points}\n`;
	const winPlayoff = playoffOnly.get(winner.id);
	if (winPlayoff) {
		md += `- **Playoff Record**: ${winPlayoff.wins}W / ${winPlayoff.draws}D / ${winPlayoff.losses}L\n`;
	}
	md += "\n";

	// Final Rankings Table
	md += "## 🏅 Final Rankings\n\n";
	md +=
		"| # | ID | Gen | Rev | Revi | Swiss | Playoff | Total | Swiss 1st/2nd/3rd |\n";
	md +=
		"|---|-----|-----|-----|------|-------|---------|-------|-------------------|\n";

	sorted.forEach((c, index) => {
		const position = index + 1;
		const medal = position <= 3 ? ["🥇", "🥈", "🥉"][position - 1] : "";
		const [generator, reviewer, reviser] = c.id.split("_");
		const playoff = playoffOnly.get(c.id);
		const playoffStr = playoff
			? `${playoff.wins}W/${playoff.draws}D/${playoff.losses}L`
			: "-";
		const totalScore = finalScores.get(c.id) ?? 0;
		const placementStr = `${c.placements.first}/${c.placements.second}/${c.placements.third}`;
		md += `| ${medal}${position} | ${c.id} | ${generator} | ${reviewer} | ${reviser} | ${c.points} | ${playoffStr} | ${totalScore.toFixed(1)} | ${placementStr} |\n`;
	});

	// Top 8 Playoff Details
	md += "\n## 🎯 Playoff Details (Top 8)\n\n";
	const playoffSorted = [...playoffOnly.entries()].sort((a, b) => {
		if (b[1].points !== a[1].points) return b[1].points - a[1].points;
		return a[1].losses - b[1].losses;
	});

	md += "| # | ID | W | D | L | Pts | Win Rate |\n";
	md += "|---|-----|---|---|---|-----|----------|\n";

	playoffSorted.forEach(([id, result], index) => {
		const medal = index < 3 ? ["🥇", "🥈", "🥉"][index] : "";
		const totalGames = result.wins + result.draws + result.losses;
		const winRate =
			totalGames > 0
				? (((result.wins + result.draws * 0.5) / totalGames) * 100).toFixed(0)
				: "0";
		md += `| ${medal}${index + 1} | ${id} | ${result.wins} | ${result.draws} | ${result.losses} | ${result.points} | ${winRate}% |\n`;
	});

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
