import type { PipelineConfig, RoleEntry } from "./config";
import { DEFAULT_CONFIG } from "./config/defaults";
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

export interface RunSummaryEntryV1 {
	rank: number;
	revisionId: string;
	generator: { token: string; slug: string };
	reviewer: { token: string; slug: string };
	reviser: { token: string; slug: string };
	swissPoints: number;
	rating: number | null;
	ratingCi95: { low: number; high: number } | null;
}

export interface AttributionRowV1 {
	key: string;
	n: number;
	avgRank: number;
	medianRank: number;
	bestRank: number;
	topKCount: number;
	topKPercent: number;
	avgSwissPoints: number;
	avgRating: number | null;
}

export interface RunSummaryV1 {
	version: 1;
	runDir: string;
	tournament: {
		swissRoundsConfigured: number;
		swissFormat: "1v1" | "1v1v1";
		topK: number;
		ratingEnabled: boolean;
		schedulingMode: string;
		swissEarlyStop: { enabled: boolean; reason: string | null };
	};
	fineRanking: {
		enabled: boolean;
		matches: number | null;
		judgments: number | null;
		iterations: number | null;
		converged: boolean | null;
	};
	leaderboard: { entries: RunSummaryEntryV1[] };
	attribution: {
		roles: {
			generator: AttributionRowV1[];
			reviewer: AttributionRowV1[];
			reviser: AttributionRowV1[];
		};
		pairs: {
			gen_reviewer: AttributionRowV1[];
			gen_reviser: AttributionRowV1[];
			reviewer_reviser: AttributionRowV1[];
		};
	};
}

interface RevisionMetadata {
	task?: {
		generator?: string;
		reviewer?: string;
		reviser?: string;
	};
}

export interface LeaderboardConfigContext {
	tournament: PipelineConfig["tournament"];
	swissJudges: RoleEntry[];
	finaleJudges: RoleEntry[];
}

const DEFAULT_LEADERBOARD_CONTEXT: LeaderboardConfigContext = {
	tournament: DEFAULT_CONFIG.tournament,
	swissJudges: DEFAULT_CONFIG.roles.swissJudges,
	finaleJudges: DEFAULT_CONFIG.roles.finaleJudges,
};

// ============================================================================
// Nickname Helper
/**
 * Capitalizes the first character of a string.
 *
 * @param str - The input string to transform
 * @returns The input with its first character converted to upper case; returns the original string if it is empty
 */

function capitalizeFirst(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Produce a short, capitalized nickname for a model identifier.
 *
 * If `modelPart` looks like a slug (contains `/` or `-`), a shortened form is derived before capitalizing; otherwise the input is capitalized as-is.
 *
 * @param modelPart - A model identifier or fragment (may be a slug or a simple name)
 * @returns The short nickname with the first letter capitalized
 */
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

/**
 * Formats a win/draw/loss record as "W/D/L" or "-" when no results exist.
 *
 * @returns The string "<wins>W/<draws>D/<losses>L" if at least one count is greater than zero, otherwise "-".
 */
function formatRecord(wins: number, draws: number, losses: number): string {
	const any = wins > 0 || draws > 0 || losses > 0;
	return any ? `${wins}W/${draws}D/${losses}L` : "-";
}

function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
	const left = sorted[mid - 1] ?? 0;
	const right = sorted[mid] ?? 0;
	return (left + right) / 2;
}

function topKPercent(topKCount: number, n: number): number {
	if (n <= 0) return 0;
	return (topKCount / n) * 100;
}

type Accumulator = {
	ranks: number[];
	topKCount: number;
	points: number[];
	ratings: number[];
};

function toAttributionRows(
	acc: Map<string, Accumulator>,
): AttributionRowV1[] {
	const rows: AttributionRowV1[] = [];
	for (const [key, a] of acc.entries()) {
		const n = a.ranks.length;
		const avgRank = mean(a.ranks);
		rows.push({
			key,
			n,
			avgRank,
			medianRank: median(a.ranks),
			bestRank: n > 0 ? Math.min(...a.ranks) : 0,
			topKCount: a.topKCount,
			topKPercent: topKPercent(a.topKCount, n),
			avgSwissPoints: mean(a.points),
			avgRating: a.ratings.length > 0 ? mean(a.ratings) : null,
		});
	}

	rows.sort((a, b) => a.avgRank - b.avgRank || a.key.localeCompare(b.key));
	return rows;
}

// ============================================================================
// Leaderboard Computation
/**
 * Produce a ranked leaderboard from Swiss-format contestants, populating per-revision role metadata.
 *
 * The ranking prefers configured ratings when enabled and available for all contestants; otherwise it orders by Swiss points and applies deterministic tiebreakers. Role fields (generator, reviewer, reviser) are taken from `revisionsById` when present and fall back to parts parsed from the contestant `id`.
 *
 * @param contestants - The contestants to rank.
 * @param revisionsById - Optional map from revision id to metadata used to populate `generator`, `reviewer`, and `reviser` on each entry.
 * @returns An array of `LeaderboardEntry` objects ordered by rank (1 = top); each entry includes a `rank` and populated role metadata.
 */

export function getLeaderboard(
	contestants: SwissContestant[],
	_swissMatches: SwissMatch[],
	revisionsById?: Map<string, RevisionMetadata>,
	configContext: LeaderboardConfigContext = DEFAULT_LEADERBOARD_CONTEXT,
): LeaderboardEntry[] {
	const ratingEnabled = configContext.tournament.rating.enabled;
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
		const parts = c.id.split("_");
		const safeGen = parts[0] ?? c.id;
		const safeRev = parts[1] ?? "";
		const safeRevi = parts[2] ?? "";
		const revMeta = revisionsById?.get(c.id);

		return {
			...c,
			rank: index + 1,
			generator: revMeta?.task?.generator ?? safeGen,
			reviewer: revMeta?.task?.reviewer ?? safeRev,
			reviser: revMeta?.task?.reviser ?? safeRevi,
		};
	});
}

/**
 * Builds a complete tournament leaderboard and performance report as a Markdown string.
 *
 * Generates a Markdown document that includes: tournament header, winner showcase, fine ranking summary,
 * per-role model performance tables (generator/reviewer/reviser), final rankings with optional
 * ratings and confidence intervals, and a first-draft selection table when results are provided.
 *
 * @param contestants - Array of Swiss-format contestants to rank and summarize.
 * @param swissMatches - Swiss-format match records (used for context; ordering is computed from contestants).
 * @param revisionsById - Optional map of revision metadata (generator/reviewer/reviser) keyed by revision id.
 * @param initialLeaderboardResults - Optional initial leaderboard results used to populate the First Draft Selection section.
 * @param finaleSummary - Optional fine ranking summary used to populate the Fine Ranking Summary section (matches, judgments, iterations, converged).
 * @returns The assembled leaderboard and report as a Markdown-formatted string.
 */
export function computeLeaderboard(
	contestants: SwissContestant[],
	swissMatches: SwissMatch[],
	revisionsById?: Map<string, RevisionMetadata>,
	initialLeaderboardResults?: StoredInitialLeaderboardResult[] | null,
	finaleSummary?: FinaleSummary,
	configContext: LeaderboardConfigContext = DEFAULT_LEADERBOARD_CONTEXT,
): string {
	const config = configContext;
	const SWISS_JUDGES = config.swissJudges;
	const FINALE_JUDGES = config.finaleJudges;
	const SWISS_FORMAT = config.tournament.swissFormat ?? "1v1v1";
	const is1v1 = SWISS_FORMAT === "1v1";

	const entries = getLeaderboard(
		contestants,
		swissMatches,
		revisionsById,
		configContext,
	);
	const showRating =
		config.tournament.rating.enabled &&
		entries.some((c) => typeof c.rating === "number");

	const TOP_K = Math.max(
		1,
		Math.min(config.tournament.stopRules.topK, entries.length || 1),
	);

	const roleAcc = {
		generator: new Map<string, Accumulator>(),
		reviewer: new Map<string, Accumulator>(),
		reviser: new Map<string, Accumulator>(),
	};
	const pairAcc = {
		genReviewer: new Map<string, Accumulator>(),
		genReviser: new Map<string, Accumulator>(),
		reviewerReviser: new Map<string, Accumulator>(),
	};

	const record = (m: Map<string, Accumulator>, key: string, e: LeaderboardEntry) => {
		const a = m.get(key) ?? { ranks: [], topKCount: 0, points: [], ratings: [] };
		a.ranks.push(e.rank);
		if (e.rank <= TOP_K) a.topKCount += 1;
		a.points.push(e.points);
		if (typeof e.rating === "number") a.ratings.push(e.rating);
		m.set(key, a);
	};

	for (const e of entries) {
		const gen = e.generator ? getShortNickname(e.generator) : null;
		const rev = e.reviewer ? getShortNickname(e.reviewer) : null;
		const rvr = e.reviser ? getShortNickname(e.reviser) : null;

		if (gen) record(roleAcc.generator, gen, e);
		if (rev) record(roleAcc.reviewer, rev, e);
		if (rvr) record(roleAcc.reviser, rvr, e);

		if (gen && rev) record(pairAcc.genReviewer, `${gen} (gen) + ${rev} (rev)`, e);
		if (gen && rvr) record(pairAcc.genReviser, `${gen} (gen) + ${rvr} (reviser)`, e);
		if (rev && rvr)
			record(pairAcc.reviewerReviser, `${rev} (rev) + ${rvr} (reviser)`, e);
	}

	const roleRows = {
		generator: toAttributionRows(roleAcc.generator),
		reviewer: toAttributionRows(roleAcc.reviewer),
		reviser: toAttributionRows(roleAcc.reviser),
	};
	const pairRows = {
		genReviewer: toAttributionRows(pairAcc.genReviewer),
		genReviser: toAttributionRows(pairAcc.genReviser),
		reviewerReviser: toAttributionRows(pairAcc.reviewerReviser),
	};

	let md = "# 🏆 Tournament Leaderboard\n\n";

	md += `> **Coarse Ranking (Swiss rounds): ${config.tournament.swissRounds} (${SWISS_FORMAT})** → **Fine Ranking (Top-${TOP_K} refinement; active learning)**\n>\n`;
	md += `> Coarse: ${SWISS_JUDGES.map((j) => `${getShortNickname(getShortModelName(j.model))} (${j.effort ?? "low"})`).join(" + ")}`;
	md += ` | Fine: ${FINALE_JUDGES.map((j) => `${getShortNickname(getShortModelName(j.model))} (${j.effort ?? "high"})`).join(" + ")}\n\n`;

	md += "---\n\n";

	// Winner showcase (card format)
	if (entries.length > 0) {
		const winner = entries[0];
			if (winner) {
				md += "## 🥇 Winner\n\n";
				md += `**${formatRevisionNickname(winner.id)}**\n\n`;
					md += `- **Coarse:** ${winner.points} pts`;
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

	// Fine ranking summary
	md += "## Fine Ranking Summary\n\n";
	if (!config.tournament.finale.enabled) {
		md += "- Fine ranking is disabled.\n\n";
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

	// Attribution Summary
	md += "## 🧭 Attribution Summary\n\n";
	md +=
		"These tables explain which models (and model pairings) tended to produce higher-ranked *revision artifacts* in this run. They are associations, not causal proof.\n\n";

	const fmtTopK = (row: AttributionRowV1) =>
		`${row.topKCount} (${row.topKPercent.toFixed(0)}%)`;
	const fmtAvgRating = (row: AttributionRowV1) =>
		row.avgRating === null ? "-" : row.avgRating.toFixed(1);

	const renderRoleTable = (title: string, rows: AttributionRowV1[]) => {
		md += `### ${title}\n\n`;
		md +=
			"| Model | N | Avg Rank | Median | Best | Top K | Avg Swiss Pts | Avg Rating |\n";
		md +=
			"|-------|---|----------|--------|------|-------|--------------|------------|\n";
		for (const r of rows) {
			md += `| ${r.key} | ${r.n} | #${r.avgRank.toFixed(1)} | #${r.medianRank.toFixed(
				1,
			)} | #${r.bestRank} | ${fmtTopK(r)} | ${r.avgSwissPoints.toFixed(
				1,
			)} | ${fmtAvgRating(r)} |\n`;
		}
		md += "\n";
	};

	renderRoleTable("By Generator", roleRows.generator);
	renderRoleTable("By Reviewer", roleRows.reviewer);
	renderRoleTable("By Reviser", roleRows.reviser);

	const MAX_PAIR_ROWS = 20;
	const renderPairTable = (title: string, rows: AttributionRowV1[]) => {
		md += `### ${title}\n\n`;
		md +=
			"| Pair | N | Avg Rank | Top K | Avg Swiss Pts | Avg Rating |\n";
		md +=
			"|------|---|----------|-------|--------------|------------|\n";
		const sliced = rows.slice(0, MAX_PAIR_ROWS);
		for (const r of sliced) {
			md += `| ${r.key} | ${r.n} | #${r.avgRank.toFixed(1)} | ${fmtTopK(
				r,
			)} | ${r.avgSwissPoints.toFixed(1)} | ${fmtAvgRating(r)} |\n`;
		}
		if (rows.length > MAX_PAIR_ROWS) {
			md += `\nShowing top ${MAX_PAIR_ROWS} pairs by Avg Rank.\n\n`;
		} else {
			md += "\n";
		}
	};

	renderPairTable("Pair Synergy: Generator + Reviewer", pairRows.genReviewer);
	renderPairTable("Pair Synergy: Generator + Reviser", pairRows.genReviser);
	renderPairTable(
		"Pair Synergy: Reviewer + Reviser",
		pairRows.reviewerReviser,
	);

	md += "---\n\n";

	// Final Rankings Table
	md += "## 🏅 Final Rankings\n\n";
	md += "| # | Revision | Coarse | Rating | 95% CI |\n";
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

	// First Draft Selection section
	md += "## 🌱 First Draft Selection\n\n";
	if (initialLeaderboardResults && initialLeaderboardResults.length > 0) {
		md +=
				"Each model's initial drafts were compared to select the best draft per model.\n\n";
		md += "| Model | Selected | Record | Margin |\n";
		md += "|-------|----------|--------|--------|\n";
		for (const result of initialLeaderboardResults) {
			const nickname = getShortNickname(getShortModelName(result.model));
			const selected = `Draft ${result.selectedDraftIndex}/${result.totalDrafts}`;
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
			"*First Draft Selection was not enabled or only 1 draft per model was generated.*\n";
	}

	return md;
}

export function computeRunSummary(args: {
	runDir: string;
	contestants: SwissContestant[];
	swissMatches: SwissMatch[];
	revisionsById?: Map<string, RevisionMetadata>;
	finaleSummary?: FinaleSummary;
	swissEarlyStopReason?: string | null;
	configContext?: LeaderboardConfigContext;
}): RunSummaryV1 {
	const config = args.configContext ?? DEFAULT_LEADERBOARD_CONTEXT;
	const swissFormat = config.tournament.swissFormat ?? "1v1v1";

	const entries = getLeaderboard(
		args.contestants,
		args.swissMatches,
		args.revisionsById,
		config,
	);
	const topK = Math.max(
		1,
		Math.min(config.tournament.stopRules.topK, entries.length || 1),
	);

	const roleAcc = {
		generator: new Map<string, Accumulator>(),
		reviewer: new Map<string, Accumulator>(),
		reviser: new Map<string, Accumulator>(),
	};
	const pairAcc = {
		genReviewer: new Map<string, Accumulator>(),
		genReviser: new Map<string, Accumulator>(),
		reviewerReviser: new Map<string, Accumulator>(),
	};

	const record = (m: Map<string, Accumulator>, key: string, e: LeaderboardEntry) => {
		const a = m.get(key) ?? { ranks: [], topKCount: 0, points: [], ratings: [] };
		a.ranks.push(e.rank);
		if (e.rank <= topK) a.topKCount += 1;
		a.points.push(e.points);
		if (typeof e.rating === "number") a.ratings.push(e.rating);
		m.set(key, a);
	};

	for (const e of entries) {
		const gen = e.generator ? getShortNickname(e.generator) : null;
		const rev = e.reviewer ? getShortNickname(e.reviewer) : null;
		const rvr = e.reviser ? getShortNickname(e.reviser) : null;

		if (gen) record(roleAcc.generator, gen, e);
		if (rev) record(roleAcc.reviewer, rev, e);
		if (rvr) record(roleAcc.reviser, rvr, e);

		if (gen && rev) record(pairAcc.genReviewer, `${gen} (gen) + ${rev} (rev)`, e);
		if (gen && rvr) record(pairAcc.genReviser, `${gen} (gen) + ${rvr} (reviser)`, e);
		if (rev && rvr)
			record(pairAcc.reviewerReviser, `${rev} (rev) + ${rvr} (reviser)`, e);
	}

	const summaryEntries: RunSummaryEntryV1[] = entries.map((e) => {
		const [genTok = "", revTok = "", reviserTok = ""] = e.id.split("_");
		const genSlug = e.generator ?? genTok;
		const revSlug = e.reviewer ?? revTok;
		const reviserSlug = e.reviser ?? reviserTok;

		const rating =
			typeof e.rating === "number" && Number.isFinite(e.rating) ? e.rating : null;
		const ratingCi95 =
			typeof e.ratingCiLow === "number" && typeof e.ratingCiHigh === "number"
				? { low: e.ratingCiLow, high: e.ratingCiHigh }
				: null;

		return {
			rank: e.rank,
			revisionId: e.id,
			generator: { token: genTok, slug: genSlug },
			reviewer: { token: revTok, slug: revSlug },
			reviser: { token: reviserTok, slug: reviserSlug },
			swissPoints: e.points,
			rating,
			ratingCi95,
		};
	});

	return {
		version: 1,
		runDir: args.runDir,
		tournament: {
			swissRoundsConfigured: config.tournament.swissRounds,
			swissFormat,
			topK: topK,
			ratingEnabled: config.tournament.rating.enabled,
			schedulingMode: config.tournament.scheduling.mode,
			swissEarlyStop: {
				enabled: config.tournament.stopRules.enabled,
				reason: args.swissEarlyStopReason ?? null,
			},
		},
		fineRanking: {
			enabled: config.tournament.finale.enabled,
			matches:
				typeof args.finaleSummary?.matches === "number"
					? args.finaleSummary.matches
					: null,
			judgments:
				typeof args.finaleSummary?.judgments === "number"
					? args.finaleSummary.judgments
					: null,
			iterations:
				typeof args.finaleSummary?.iterations === "number"
					? args.finaleSummary.iterations
					: null,
			converged:
				typeof args.finaleSummary?.converged === "boolean"
					? args.finaleSummary.converged
					: null,
		},
		leaderboard: { entries: summaryEntries },
		attribution: {
			roles: {
				generator: toAttributionRows(roleAcc.generator),
				reviewer: toAttributionRows(roleAcc.reviewer),
				reviser: toAttributionRows(roleAcc.reviser),
			},
			pairs: {
				gen_reviewer: toAttributionRows(pairAcc.genReviewer),
				gen_reviser: toAttributionRows(pairAcc.genReviser),
				reviewer_reviser: toAttributionRows(pairAcc.reviewerReviser),
			},
		},
	};
}
