import {
  generateStatblock,
  reviewStatblock,
  reviseStatblock,
  pairwiseJudge,
  threeWayJudge,
  MODELS,
  type ModelName,
  type GenerateResult,
  type ReviewResult,
  type ReviseResult,
  type ThreeWayResult,
} from "./aiClient";
import { mkdir, writeFile, appendFile } from "fs/promises";
import { join } from "path";

const RUNS_DIR = "runs";
const MODEL_NAMES: ModelName[] = ["claude", "gpt", "gemini"];
const SWISS_ROUNDS = 7;
const TOP_N_PLAYOFF = 8;

/**
 * Ensures the runs directory exists.
 */
async function ensureRunsDirectory(subdir?: string): Promise<string> {
  const dir = subdir ? join(RUNS_DIR, subdir) : RUNS_DIR;
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Generates a timestamp string for filenames.
 */
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
}

/**
 * Fisher-Yates shuffle for randomizing array order.
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

// ============================================================================
// Swiss System Types & Logic (1v1v1)
// ============================================================================

interface SwissContestant {
  id: string;
  text: string;
  points: number; // Using 2/1/0 scoring for 1st/2nd/3rd
  opponents: Set<string>; // Track who they've faced
  placements: { first: number; second: number; third: number }; // Track finishes
}

interface SwissMatch {
  round: number;
  ids: [string, string, string];
  first: string;
  second: string;
  third: string;
  reasoning: string;
}

/**
 * Generates Swiss pairings for 1v1v1 (groups of 3).
 * Sorts by points (descending), then forms groups of 3.
 * Avoids grouping contestants who have already faced each other when possible.
 */
function generateSwissTriples(
  contestants: SwissContestant[],
  round: number
): { triples: [string, string, string][] } {
  // Sort by points descending
  const sorted = [...contestants].sort((a, b) => b.points - a.points);
  const triples: [string, string, string][] = [];
  const used = new Set<string>();

  // Form groups of 3 from similar point brackets
  while (used.size < sorted.length) {
    const available = sorted.filter((c) => !used.has(c.id));
    if (available.length < 3) break; // Should not happen with 27 contestants

    // Take the top available contestant
    const first = available[0]!;
    used.add(first.id);

    // Find best 2nd: closest in points, hasn't faced first
    let secondIdx = -1;
    for (let i = 1; i < available.length; i++) {
      if (!first.opponents.has(available[i]!.id)) {
        secondIdx = i;
        break;
      }
    }
    if (secondIdx === -1) secondIdx = 1; // Fallback if all faced
    const second = available[secondIdx]!;
    used.add(second.id);

    // Find best 3rd: closest in points, hasn't faced first or second
    let thirdIdx = -1;
    for (let i = 1; i < available.length; i++) {
      if (available[i]!.id === second.id) continue;
      if (!first.opponents.has(available[i]!.id) && !second.opponents.has(available[i]!.id)) {
        thirdIdx = i;
        break;
      }
    }
    if (thirdIdx === -1) {
      // Fallback: find anyone not yet used
      for (let i = 1; i < available.length; i++) {
        if (available[i]!.id !== second.id) {
          thirdIdx = i;
          break;
        }
      }
    }
    const third = available[thirdIdx]!;
    used.add(third.id);

    triples.push([first.id, second.id, third.id]);
  }

  return { triples };
}

/**
 * Computes leaderboard from Swiss + Round Robin results.
 * Ranked by points, then by placements (most 1sts, then most 2nds).
 */
function computeLeaderboard(
  contestants: SwissContestant[],
  swissMatches: SwissMatch[],
  playoffResults: Map<string, { points: number; wins: number; losses: number; draws: number }> | null
): string {
  // Combine Swiss and Playoff scores for top-8
  const finalScores = new Map<string, number>();
  const playoffOnly = new Map<string, { points: number; wins: number; losses: number; draws: number }>();

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
      if (playoffB.points !== playoffA.points) return playoffB.points - playoffA.points;
      // Then by fewer losses (undefeated > 1 loss)
      if (playoffA.losses !== playoffB.losses) return playoffA.losses - playoffB.losses;
    } else if (playoffA && !playoffB) {
      return -1; // A was in playoff, B wasn't
    } else if (!playoffA && playoffB) {
      return 1; // B was in playoff, A wasn't
    }

    // Tiebreaker 2: Swiss placements (most 1sts, then most 2nds)
    if (b.placements.first !== a.placements.first) return b.placements.first - a.placements.first;
    return b.placements.second - a.placements.second;
  });

  // Calculate model-level stats
  const modelStats = {
    generator: new Map<string, { count: number; avgRank: number; top8: number }>(),
    reviewer: new Map<string, { count: number; avgRank: number; top8: number }>(),
    reviser: new Map<string, { count: number; avgRank: number; top8: number }>(),
  };

  sorted.forEach((c, index) => {
    const [gen, rev, revi] = c.id.split("_");
    const rank = index + 1;
    const inTop8 = playoffOnly.has(c.id) ? 1 : 0;

    for (const [role, model] of [["generator", gen], ["reviewer", rev], ["reviser", revi]] as const) {
      const stats = modelStats[role].get(model!) ?? { count: 0, avgRank: 0, top8: 0 };
      stats.avgRank = (stats.avgRank * stats.count + rank) / (stats.count + 1);
      stats.count++;
      stats.top8 += inTop8;
      modelStats[role].set(model!, stats);
    }
  });

  // Build markdown
  let md = "# 🏆 Tournament Leaderboard\n\n";
  md += `> **${SWISS_ROUNDS} Swiss rounds (1v1v1)** + **Top-${TOP_N_PLAYOFF} Round Robin playoff**\n>\n`;
  md += "> Swiss Judge: Claude (low) | Playoff Judges: Claude (low) + GPT (high)\n>\n";
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
  md += "| # | ID | Gen | Rev | Revi | Swiss | Playoff | Total | Swiss 1st/2nd/3rd |\n";
  md += "|---|-----|-----|-----|------|-------|---------|-------|-------------------|\n";

  sorted.forEach((c, index) => {
    const position = index + 1;
    const medal = position <= 3 ? ["🥇", "🥈", "🥉"][position - 1] : "";
    const [generator, reviewer, reviser] = c.id.split("_");
    const playoff = playoffOnly.get(c.id);
    const playoffStr = playoff ? `${playoff.wins}W/${playoff.draws}D/${playoff.losses}L` : "-";
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
    const winRate = totalGames > 0 ? ((result.wins + result.draws * 0.5) / totalGames * 100).toFixed(0) : "0";
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
// Main Pipeline
// ============================================================================

/**
 * Runs the cross-review pipeline with optimized Swiss System:
 * 1. Each model generates its own statblock (3 parallel calls)
 * 2. Each model reviews ALL 3 models' outputs (9 parallel calls)
 * 3. ALL 3 models revise each original based on each review (27 parallel calls)
 * 4. Swiss tournament: 7 rounds of 1v1v1 judging (9 matches/round = 63 total)
 * 5. Top-8 Round Robin playoff with dual-judge voting (56 API calls)
 * 6. Compute final leaderboard
 */
async function runCrossReviewPipeline(): Promise<void> {
  console.log("🎲 Auto-Draftify: D&D 5e Cross-Review Pipeline (Optimized Swiss)\n");
  console.log("📝 Creating: Doctor Doom (Marvel Comics) Monster Statblock\n");
  console.log("Models:", Object.entries(MODELS).map(([k, v]) => `${k}: ${v}`).join("\n        "));
  console.log(`\nSwiss Rounds: ${SWISS_ROUNDS} (1v1v1 format)`);
  console.log(`Playoff: Top-${TOP_N_PLAYOFF} Round Robin (dual-judge: Claude + GPT)`);
  console.log("Swiss Judge: Claude (low) | Playoff Judges: Claude (low) + GPT (high)\n");

  // Create run directory early for incremental writes
  const timestamp = getTimestamp();
  const runDir = await ensureRunsDirectory(timestamp);
  const revisionsDir = await ensureRunsDirectory(join(timestamp, "revisions"));
  const reviewsDir = await ensureRunsDirectory(join(timestamp, "reviews"));
  const swissJudgmentsDir = await ensureRunsDirectory(join(timestamp, "swiss_judgments"));
  const playoffJudgmentsDir = await ensureRunsDirectory(join(timestamp, "playoff_judgments"));
  const swissLogPath = join(runDir, "swiss_rounds.md");
  const playoffLogPath = join(runDir, "playoff_rounds.md");

  // Initialize logs
  await writeFile(swissLogPath, "# Swiss Tournament Log (1v1v1)\n\n", "utf-8");
  await writeFile(playoffLogPath, "# Top-8 Round Robin Playoff\n\n", "utf-8");

  // === PHASE 1: Generate (3 parallel calls) ===
  console.log("Phase 1/5: Generating statblocks from all models...");
  const statblocksByModel = new Map<ModelName, GenerateResult>();
  let generateCount = 0;

  // Immediate writes as each completes
  const generatePromises = MODEL_NAMES.map(async (model) => {
    const result = await generateStatblock(model);
    statblocksByModel.set(result.model, result);
    generateCount++;
    console.log(`  ✓ ${result.model} generated (${generateCount}/${MODEL_NAMES.length})`);
    // Write immediately
    const path = join(runDir, `${result.model}_original.md`);
    await writeFile(path, `# Original Statblock (${result.model})\n\n${result.text}`, "utf-8");
    return result;
  });
  await Promise.all(generatePromises);
  console.log(`  ✓ Wrote originals to ${runDir}\n`);

  // === PHASE 2: Review (9 parallel calls) ===
  console.log("Phase 2/5: Cross-reviewing statblocks (including self-review)...");
  const reviews: ReviewResult[] = [];
  let reviewCount = 0;
  const totalReviews = MODEL_NAMES.length * MODEL_NAMES.length;

  const reviewPromises: Promise<void>[] = [];
  for (const reviewer of MODEL_NAMES) {
    for (const reviewed of MODEL_NAMES) {
      const statblock = statblocksByModel.get(reviewed)!.text;
      reviewPromises.push(
        (async () => {
          const review = await reviewStatblock(reviewer, reviewed, statblock);
          reviews.push(review);
          reviewCount++;
          const selfTag = review.reviewer === review.reviewed ? " (self)" : "";
          console.log(`  ✓ ${review.reviewer} reviewed ${review.reviewed}'s statblock${selfTag} (${reviewCount}/${totalReviews})`);
          // Write immediately
          const path = join(reviewsDir, `${review.reviewer}_reviews_${review.reviewed}.md`);
          await writeFile(path, `# ${review.reviewer} reviews ${review.reviewed}\n\n${review.text}`, "utf-8");
        })()
      );
    }
  }
  await Promise.all(reviewPromises);
  console.log(`  ✓ Wrote reviews to ${reviewsDir}\n`);

  // === PHASE 3: Revise (27 parallel calls) ===
  console.log("Phase 3/5: Revising statblocks (27 revisions)...");

  interface RevisionTask {
    generator: ModelName;
    reviewer: ModelName;
    reviser: ModelName;
    id: string;
  }

  const revisionTasks: RevisionTask[] = [];
  for (const review of reviews) {
    for (const reviser of MODEL_NAMES) {
      revisionTasks.push({
        generator: review.reviewed,
        reviewer: review.reviewer,
        reviser: reviser,
        id: `${review.reviewed}_${review.reviewer}_${reviser}`,
      });
    }
  }

  const revisedById = new Map<string, { result: ReviseResult; task: RevisionTask }>();
  let reviseCount = 0;
  const totalRevisions = revisionTasks.length;

  const revisePromises = revisionTasks.map(async (task) => {
    const originalStatblock = statblocksByModel.get(task.generator)!.text;
    const review = reviews.find((r) => r.reviewed === task.generator && r.reviewer === task.reviewer)!;
    const feedback = `## Feedback:\n${review.text}`;
    const result = await reviseStatblock(task.reviser, originalStatblock, feedback);
    revisedById.set(task.id, { result, task });
    reviseCount++;
    console.log(`  ✓ ${task.id} (${reviseCount}/${totalRevisions})`);
    // Write immediately
    const path = join(revisionsDir, `${task.id}.md`);
    await writeFile(
      path,
      `# ${task.generator}'s Statblock\n\n**Reviewed by:** ${task.reviewer}\n**Revised by:** ${task.reviser}\n\n${result.text}`,
      "utf-8"
    );
    return { task, result };
  });
  await Promise.all(revisePromises);
  console.log(`  ✓ Wrote ${totalRevisions} revisions to ${revisionsDir}\n`);

  // === PHASE 4: Swiss Tournament (7 rounds, 1v1v1) ===
  console.log(`Phase 4/5: Swiss Tournament (${SWISS_ROUNDS} rounds, 1v1v1 format)...`);

  // Initialize contestants
  const contestants: SwissContestant[] = Array.from(revisedById.entries()).map(([id, data]) => ({
    id,
    text: data.result.text,
    points: 0,
    opponents: new Set<string>(),
    placements: { first: 0, second: 0, third: 0 },
  }));

  const allSwissMatches: SwissMatch[] = [];

  for (let round = 1; round <= SWISS_ROUNDS; round++) {
    console.log(`  Round ${round}/${SWISS_ROUNDS}...`);
    await appendFile(swissLogPath, `## Round ${round}\n\n`, "utf-8");

    const { triples } = generateSwissTriples(contestants, round);

    // Run all triples in parallel with randomized, anonymized IDs
    const triplePromises = triples.map(async ([idA, idB, idC]): Promise<SwissMatch> => {
      // Randomize order to eliminate position bias
      const entries: [string, string][] = [
        [idA, revisedById.get(idA)!.result.text],
        [idB, revisedById.get(idB)!.result.text],
        [idC, revisedById.get(idC)!.result.text],
      ];
      const shuffled = shuffleArray(entries);
      const [e1, e2, e3] = [shuffled[0]!, shuffled[1]!, shuffled[2]!];

      // Anonymize IDs to prevent judge bias
      const result = await threeWayJudge("S1", e1[1], "S2", e2[1], "S3", e3[1]);

      // Map anonymous winners back to real IDs
      const anonToReal = new Map<string, string>([
        ["S1", e1[0]],
        ["S2", e2[0]],
        ["S3", e3[0]],
      ]);

      const match: SwissMatch = {
        round,
        ids: [idA, idB, idC],
        first: anonToReal.get(result.first) ?? idA,
        second: anonToReal.get(result.second) ?? idB,
        third: anonToReal.get(result.third) ?? idC,
        reasoning: result.reasoning,
      };

      // Write match result immediately
      await appendFile(
        swissLogPath,
        `- **1st: ${match.first}** | 2nd: ${match.second} | 3rd: ${match.third}\n  - *${match.reasoning}*\n`,
        "utf-8"
      );

      // Write detailed judgment file
      const judgmentFile = join(swissJudgmentsDir, `round${round}_${match.first}_vs_${match.second}_vs_${match.third}.md`);
      let judgmentMd = `# Swiss Round ${round} Judgment\n\n`;
      judgmentMd += `**Judge**: Claude (low thinking)\n\n`;
      judgmentMd += `## Contestants\n\n`;
      judgmentMd += `- S1 (${e1[0]}): ${e1[0]}\n`;
      judgmentMd += `- S2 (${e2[0]}): ${e2[0]}\n`;
      judgmentMd += `- S3 (${e3[0]}): ${e3[0]}\n\n`;
      judgmentMd += `## Result\n\n`;
      judgmentMd += `1. **${match.first}** (2 pts)\n`;
      judgmentMd += `2. ${match.second} (1 pt)\n`;
      judgmentMd += `3. ${match.third} (0 pts)\n\n`;
      judgmentMd += `## Reasoning\n\n${result.reasoning}\n`;
      await writeFile(judgmentFile, judgmentMd, "utf-8");

      return match;
    });

    const roundResults = await Promise.all(triplePromises);

    // Update contestants
    for (const match of roundResults) {
      const first = contestants.find((c) => c.id === match.first);
      const second = contestants.find((c) => c.id === match.second);
      const third = contestants.find((c) => c.id === match.third);

      if (first && second && third) {
        // Award points: 2/1/0
        first.points += 2;
        first.placements.first++;
        second.points += 1;
        second.placements.second++;
        third.placements.third++;

        // Track opponents
        first.opponents.add(second.id);
        first.opponents.add(third.id);
        second.opponents.add(first.id);
        second.opponents.add(third.id);
        third.opponents.add(first.id);
        third.opponents.add(second.id);
      }

      allSwissMatches.push(match);
      console.log(`    ✓ 1st: ${match.first} | 2nd: ${match.second} | 3rd: ${match.third}`);
    }

    await appendFile(swissLogPath, "\n", "utf-8");
    console.log(`    ✓ Round ${round} complete (${triples.length} matches)`);
  }

  console.log("");

  // === PHASE 5: Top-8 Round Robin Playoff (Dual-Judge) ===
  console.log(`Phase 5/5: Top-${TOP_N_PLAYOFF} Round Robin Playoff (dual-judge: Claude + GPT)...`);

  // Get top 8 by Swiss points
  const sortedBySwiss = [...contestants].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.placements.first !== a.placements.first) return b.placements.first - a.placements.first;
    return b.placements.second - a.placements.second;
  });
  const top8 = sortedBySwiss.slice(0, TOP_N_PLAYOFF);
  const top8Ids = new Set(top8.map((c) => c.id));

  console.log(`  Top 8 qualifiers: ${top8.map((c) => c.id).join(", ")}`);
  await appendFile(playoffLogPath, `## Qualifiers\n\n${top8.map((c, i) => `${i + 1}. ${c.id} (${c.points} pts)`).join("\n")}\n\n`, "utf-8");

  // Track playoff results
  const playoffResults = new Map<string, { points: number; wins: number; losses: number; draws: number }>();
  for (const c of top8) {
    playoffResults.set(c.id, { points: 0, wins: 0, losses: 0, draws: 0 });
  }

  // Generate all pairings for round robin
  const playoffPairs: [string, string][] = [];
  for (let i = 0; i < top8.length; i++) {
    for (let j = i + 1; j < top8.length; j++) {
      playoffPairs.push([top8[i]!.id, top8[j]!.id]);
    }
  }

  console.log(`  Running ${playoffPairs.length} matchups (×2 judges = ${playoffPairs.length * 2} total)...`);
  await appendFile(playoffLogPath, `## Matches\n\n`, "utf-8");

  // Run all pairs with dual-judge (Claude low + GPT high) and randomized positions
  const playoffPromises = playoffPairs.map(async ([idA, idB]) => {
    const textA = revisedById.get(idA)!.result.text;
    const textB = revisedById.get(idB)!.result.text;

    // Randomize positions for this match
    const swapped = Math.random() > 0.5;
    const [firstId, secondId] = swapped ? [idB, idA] : [idA, idB];
    const [firstText, secondText] = swapped ? [textB, textA] : [textA, textB];

    // Run both judges in parallel with same randomized positions
    const [claudeResult, gptResult] = await Promise.all([
      pairwiseJudge("S1", firstText, "S2", secondText, "claude", "low"),
      pairwiseJudge("S1", firstText, "S2", secondText, "gpt", "high"),
    ]);

    // Map back to real IDs
    const claudeWinner = claudeResult.winner === "S1" ? firstId : secondId;
    const gptWinner = gptResult.winner === "S1" ? firstId : secondId;

    let matchResult: { winner: string | null; loser: string | null; isDraw: boolean };
    let logEntry: string;

    if (claudeWinner === gptWinner) {
      // Both judges agree - clear winner
      matchResult = { winner: claudeWinner, loser: claudeWinner === idA ? idB : idA, isDraw: false };
      logEntry = `- **${matchResult.winner}** beat ${matchResult.loser} (2-0)\n`;
      logEntry += `  - Claude: *${claudeResult.reasoning}*\n`;
      logEntry += `  - GPT: *${gptResult.reasoning}*\n`;
    } else {
      // Judges disagree - draw
      matchResult = { winner: null, loser: null, isDraw: true };
      logEntry = `- ${idA} vs ${idB}: **DRAW** (1-1)\n`;
      logEntry += `  - Claude picked ${claudeWinner}: *${claudeResult.reasoning}*\n`;
      logEntry += `  - GPT picked ${gptWinner}: *${gptResult.reasoning}*\n`;
    }

    // Write detailed judgment file for playoff
    const judgmentFile = join(playoffJudgmentsDir, `${idA}_vs_${idB}.md`);
    let judgmentMd = `# Playoff Judgment: ${idA} vs ${idB}\n\n`;
    judgmentMd += `**Position Order**: S1=${firstId}, S2=${secondId}\n\n`;
    judgmentMd += `## Claude (low thinking)\n\n`;
    judgmentMd += `- **Winner**: ${claudeWinner}\n`;
    judgmentMd += `- **Reasoning**: ${claudeResult.reasoning}\n\n`;
    judgmentMd += `## GPT (high thinking)\n\n`;
    judgmentMd += `- **Winner**: ${gptWinner}\n`;
    judgmentMd += `- **Reasoning**: ${gptResult.reasoning}\n\n`;
    judgmentMd += `## Final Result\n\n`;
    if (matchResult.isDraw) {
      judgmentMd += `**DRAW** - Judges disagreed (0.5 pts each)\n`;
    } else {
      judgmentMd += `**${matchResult.winner}** wins (1 pt)\n`;
    }
    await writeFile(judgmentFile, judgmentMd, "utf-8");

    // Update scores
    const resultA = playoffResults.get(idA)!;
    const resultB = playoffResults.get(idB)!;

    if (matchResult.isDraw) {
      resultA.points += 0.5;
      resultA.draws++;
      resultB.points += 0.5;
      resultB.draws++;
      console.log(`    = ${idA} drew ${idB}`);
    } else if (matchResult.winner === idA) {
      resultA.points += 1;
      resultA.wins++;
      resultB.losses++;
      console.log(`    ✓ ${idA} beat ${idB}`);
    } else {
      resultB.points += 1;
      resultB.wins++;
      resultA.losses++;
      console.log(`    ✓ ${idB} beat ${idA}`);
    }

    // Write immediately
    await appendFile(playoffLogPath, logEntry, "utf-8");

    return matchResult;
  });

  await Promise.all(playoffPromises);

  // Add playoff summary to log
  await appendFile(playoffLogPath, "\n## Playoff Standings\n\n", "utf-8");
  await appendFile(playoffLogPath, "| Rank | ID | Points | W | D | L |\n", "utf-8");
  await appendFile(playoffLogPath, "|------|----|--------|---|---|---|\n", "utf-8");

  const playoffSorted = [...playoffResults.entries()].sort((a, b) => b[1].points - a[1].points);
  for (let i = 0; i < playoffSorted.length; i++) {
    const [id, result] = playoffSorted[i]!;
    const medal = i < 3 ? ["🥇", "🥈", "🥉"][i] : "  ";
    await appendFile(playoffLogPath, `| ${medal} ${i + 1} | ${id} | ${result.points} | ${result.wins} | ${result.draws} | ${result.losses} |\n`, "utf-8");
  }

  console.log("");

  // === Finalize: Write leaderboard ===
  const leaderboard = computeLeaderboard(contestants, allSwissMatches, playoffResults);
  const leaderboardPath = join(runDir, "leaderboard.md");
  await writeFile(leaderboardPath, leaderboard, "utf-8");
  console.log(`  ✓ Wrote ${leaderboardPath}`);

  // Print summary stats
  console.log("\n" + "=".repeat(60));
  console.log("📊 TOURNAMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Swiss Rounds: ${SWISS_ROUNDS} (1v1v1 format)`);
  console.log(`Swiss Matches: ${allSwissMatches.length}`);
  console.log(`Playoff Matches: ${playoffPairs.length * 2} (${playoffPairs.length} pairs × 2 positions)`);
  console.log(`Total Judge Calls: ${allSwissMatches.length + playoffPairs.length * 2}`);
  console.log("");
  console.log("🏆 TOP 3 (Final Rankings):");
  const finalSorted = [...contestants].sort((a, b) => {
    const playoffA = playoffResults.get(a.id);
    const playoffB = playoffResults.get(b.id);
    const scoreA = a.points + (playoffA?.points ?? 0) * 2;
    const scoreB = b.points + (playoffB?.points ?? 0) * 2;
    return scoreB - scoreA;
  });
  for (let i = 0; i < 3; i++) {
    const c = finalSorted[i]!;
    const playoff = playoffResults.get(c.id);
    const playoffStr = playoff ? ` + ${playoff.points} playoff` : "";
    console.log(`  ${["🥇", "🥈", "🥉"][i]} ${c.id} (${c.points} Swiss${playoffStr})`);
  }
  console.log("=".repeat(60));
  console.log(`\n✨ Pipeline complete! Output in: ${runDir}`);
}

// Run the pipeline
runCrossReviewPipeline().catch((error) => {
  console.error("Error running pipeline:", error);
  process.exit(1);
});