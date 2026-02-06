import { getConfig, getFinaleJudges, getSwissJudges } from "./config";
import type { StoredInitialLeaderboardResult } from "./state";
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

export interface LeaderboardEntry extends SwissContestant {
	rank: number;
	generator?: string;
	reviewer?: string;
	reviser?: string;
}

export interface FinaleSummary {
	matches: number;
	judgments: number;
	iterations: number;
	converged: boolean;
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

function capitalizeFirst(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function getShortNickname(modelPart: string): string {
	// If it looks like a full slug, use getShortModelName.
	if (modelPart.includes("/") || modelPart.includes("-")) {
		return capitalizeFirst(getShortModelName(modelPart));
	}
	return capitalizeFirst(modelPart);
}

/**
 * Creates a short, readable nickname from a revision ID.
 * Example: "claude-opus-4.5_gpt-5.2_gemini-3-pro-preview" -> "Claude → GPT → Gemini"
 */
function formatRevisionNickname(id: string): string {
	const parts = id.split("_");
	return parts.map((p) => getShortNickname(p)).join(" → ");
}

function formatRecord(wins: number, draws: number, losses: number): string {
	const any = wins > 0 || draws > 0 || losses > 0;
	return any ? `${wins}W/${draws}D/${losses}L` : "-";
}

// ============================================================================
// Leaderboard Computation
// ============================================================================

export function getLeaderboard(
	contestants: SwissContestant[],
	_swissMatches: SwissMatch[],
	revisionsById?: Map<string, RevisionMetadata>,
): LeaderboardEntry[] {
	const config = getConfig();
	const ratingEnabled = config.tournament.rating.enabled;
	const useRating =
		ratingEnabled &&
		contestants.length > 0 &&
		contestants.every((c) => typeof c.rating === "number");

	const sorted = [...contestants].sort((a, b) => {
		if (useRating) {
			const ratingA = a.rating ?? 0;
			const ratingB = b.rating ?? 0;
			if (ratingB !== ratingA) return ratingB - ratingA;
		} else {
			if (b.points !== a.points) return b.points - a.points;
		}

		// Tiebreaker: Win/Loss record (1v1 format specific)
		const winsA = a.wins ?? 0;
		const winsB = b.wins ?? 0;
		if (winsB !== winsA) return winsB - winsA;

		// Tiebreaker: Swiss placements (most 1sts, then most 2nds - multi-player format)
		if (b.placements.first !== a.placements.first)
			return b.placements.first - a.placements.first;
		if (b.placements.second !== a.placements.second)
			return b.placements.second - a.placements.second;

		return a.id.localeCompare(b.id);
	});

	return sorted.map((c, index) => {
		const [gen, rev, revi] = c.id.split("_");
		const revMeta = revisionsById?.get(c.id);

		return {
			...c,
			rank: index + 1,
			generator: revMeta?.task?.generator ?? gen,
			reviewer: revMeta?.task?.reviewer ?? rev,
			reviser: revMeta?.task?.reviser ?? revi,
		};
	});
}

export function computeLeaderboard(
	contestants: SwissContestant[],
	swissMatches: SwissMatch[],
	revisionsById?: Map<string, RevisionMetadata>,
	initialLeaderboardResults?: StoredInitialLeaderboardResult[] | null,
	finaleSummary?: FinaleSummary,
): string {
	const config = getConfig();
	const SWISS_JUDGES = getSwissJudges();
	const FINALE_JUDGES = getFinaleJudges();
	const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
	const is1v1 = SWISS_FORMAT === "1v1";

	const entries = getLeaderboard(contestants, swissMatches, revisionsById);
	const showRating =
		config.tournament.rating.enabled &&
		entries.some((c) => typeof c.rating === "number");

	const TOP_K = Math.max(
		1,
		Math.min(config.tournament.stopRules.topK, entries.length || 1),
	);

	// Calculate model-level stats (using short nicknames)
	const modelStats = {
		generator: new Map<
			string,
			{ count: number; avgRank: number; topK: number }
		>(),
		reviewer: new Map<
			string,
			{ count: number; avgRank: number; topK: number }
		>(),
		reviser: new Map<
			string,
			{ count: number; avgRank: number; topK: number }
		>(),
	};

	for (const e of entries) {
		const inTopK = e.rank <= TOP_K ? 1 : 0;
		for (const [role, model] of [
			["generator", e.generator],
			["reviewer", e.reviewer],
			["reviser", e.reviser],
		] as const) {
			if (!model) continue;
			const nickname = getShortNickname(model);
			const stats = modelStats[role].get(nickname) ?? {
				count: 0,
				avgRank: 0,
				topK: 0,
			};
			stats.avgRank =
				(stats.avgRank * stats.count + e.rank) / (stats.count + 1);
			stats.count++;
			stats.topK += inTopK;
			modelStats[role].set(nickname, stats);
		}
	}

	let md = "# 🏆 Tournament Leaderboard\n\n";

	md += `> **${config.tournament.swissRounds} Swiss rounds (${SWISS_FORMAT})** → **Top-${TOP_K} Active Learning Finale**\n>\n`;
	md += `> Swiss: ${SWISS_JUDGES.map((j) => `${getShortNickname(getShortModelName(j.model))} (${j.effort ?? "low"})`).join(" + ")}`;
	md += ` | Finale: ${FINALE_JUDGES.map((j) => `${getShortNickname(getShortModelName(j.model))} (${j.effort ?? "low"})`).join(" + ")}\n\n`;

	md += "---\n\n";

	// Winner showcase (card format)
	if (entries.length > 0) {
		const winner = entries[0];
		if (winner) {
			md += "## 🥇 Winner\n\n";
			md += `**${formatRevisionNickname(winner.id)}**\n\n`;
			md += `- **Swiss:** ${winner.points} pts`;
			if (!is1v1) {
				md += ` (${winner.placements.first} firsts, ${winner.placements.second} seconds)`;
			}
			md += "\n";
			if (showRating && typeof winner.rating === "number") {
				const ciLow =
					typeof winner.ratingCiLow === "number"
						? winner.ratingCiLow
						: winner.rating - (winner.ratingUncertainty ?? 0);
				const ciHigh =
					typeof winner.ratingCiHigh === "number"
						? winner.ratingCiHigh
						: winner.rating + (winner.ratingUncertainty ?? 0);
				md += `- **Rating:** ${winner.rating.toFixed(1)} (CI ${ciLow.toFixed(
					1,
				)}–${ciHigh.toFixed(1)})\n`;
			}
			md += "\n---\n\n";
		}
	}

	// Finale summary
	md += "## 🧠 Finale Summary\n\n";
	if (!config.tournament.finale.enabled) {
		md += "- Finale is disabled.\n\n";
	} else {
		const matches =
			typeof finaleSummary?.matches === "number"
				? `${finaleSummary.matches}`
				: "?";
		const judgments =
			typeof finaleSummary?.judgments === "number"
				? `${finaleSummary.judgments}`
				: "?";
		const iterations =
			typeof finaleSummary?.iterations === "number"
				? `${finaleSummary.iterations}`
				: "?";
		const converged =
			typeof finaleSummary?.converged === "boolean"
				? finaleSummary.converged
					? "yes"
					: "no"
				: "?";

		md += `- Matches run: ${matches} (judgments: ${judgments})\n`;
		md += `- Iterations: ${iterations}\n`;
		md += `- Converged: ${converged}\n\n`;
	}

	md += "---\n\n";

	// Model Performance Summary - separate tables per role
	md += "## 📊 Model Performance\n\n";

	// Generator stats (with seed info if available)
	md += "### As Generator\n\n";
	md += "| Model | Avg Rank | Top K |";
	const hasSeeds = !!initialLeaderboardResults?.length;
	if (hasSeeds) md += " Seed Selected |";
	md += "\n";
	md += "|-------|----------|-------|";
	if (hasSeeds) md += "---------------|";
	md += "\n";

	const genStats = Array.from(modelStats.generator.entries()).sort(
		(a, b) => a[1].avgRank - b[1].avgRank,
	);
	for (const [model, stats] of genStats) {
		md += `| ${model} | #${stats.avgRank.toFixed(1)} | ${stats.topK} |`;
		if (hasSeeds && initialLeaderboardResults) {
			const seedResult = initialLeaderboardResults.find(
				(r) => getShortNickname(getShortModelName(r.model)) === model,
			);
			if (seedResult) {
				const selected = `${seedResult.selectedDraftIndex + 1}/${
					seedResult.totalDrafts
				}`;
				const record = formatRecord(
					seedResult.wins,
					seedResult.draws,
					seedResult.losses,
				);
				md += ` Draft ${selected}`;
				if (record !== "-") md += ` (${record})`;
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
	md += "| Model | Avg Rank | Top K |\n";
	md += "|-------|----------|-------|\n";
	const revStats = Array.from(modelStats.reviewer.entries()).sort(
		(a, b) => a[1].avgRank - b[1].avgRank,
	);
	for (const [model, stats] of revStats) {
		md += `| ${model} | #${stats.avgRank.toFixed(1)} | ${stats.topK} |\n`;
	}
	md += "\n";

	// Reviser stats
	md += "### As Reviser\n\n";
	md += "| Model | Avg Rank | Top K |\n";
	md += "|-------|----------|-------|\n";
	const reviStats = Array.from(modelStats.reviser.entries()).sort(
		(a, b) => a[1].avgRank - b[1].avgRank,
	);
	for (const [model, stats] of reviStats) {
		md += `| ${model} | #${stats.avgRank.toFixed(1)} | ${stats.topK} |\n`;
	}

	md += "\n---\n\n";

	// Final Rankings Table
	md += "## 🏅 Final Rankings\n\n";
	md += "| # | Revision | Swiss | Rating | 95% CI |\n";
	md += "|---|----------|-------|--------|--------|\n";
	for (const e of entries) {
		const medal = e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : "";
		const nickname = formatRevisionNickname(e.id);
		const ratingStr =
			showRating && typeof e.rating === "number" ? e.rating.toFixed(1) : "-";
		const ciStr =
			showRating &&
			typeof e.ratingCiLow === "number" &&
			typeof e.ratingCiHigh === "number"
				? `[${e.ratingCiLow.toFixed(1)}, ${e.ratingCiHigh.toFixed(1)}]`
				: "-";
		md += `| ${medal}${e.rank} | ${nickname} | ${e.points} | ${ratingStr} | ${ciStr} |\n`;
	}

	md += "\n---\n\n";

	// Seed Selection section
	md += "## 🌱 Seed Selection\n\n";
	if (initialLeaderboardResults && initialLeaderboardResults.length > 0) {
		md +=
			"Each model's initial drafts were ranked to select the best seed for the tournament.\n\n";
		md += "| Model | Selected | Record | Margin |\n";
		md += "|-------|----------|--------|--------|\n";
		for (const result of initialLeaderboardResults) {
			const nickname = getShortNickname(getShortModelName(result.model));
			const selected = `Draft ${result.selectedDraftIndex + 1}/${
				result.totalDrafts
			}`;
			const record = formatRecord(result.wins, result.draws, result.losses);
			const margin =
				record !== "-"
					? `${result.wins - result.losses >= 0 ? "+" : ""}${
							result.wins - result.losses
						}`
					: "-";
			md += `| ${nickname} | ${selected} | ${record} | ${margin} |\n`;
		}
	} else {
		md +=
			"*Initial leaderboard was not enabled or only 1 draft per model was generated.*\n";
	}

	return md;
}
