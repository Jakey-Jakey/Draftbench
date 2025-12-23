import {
  generateStatblock,
  reviewStatblock,
  reviseStatblock,
  pairwiseJudge,
  threeWayJudge,
  getModels,
  type ModelName,
  type GenerateResult,
  type ReviewResult,
  type ReviseResult,
  type ThreeWayResult,
} from "./aiClient";
import { loadConfig, getConfig, parseArgs, type CLIArgs } from "./config";
import { mkdir, writeFile, appendFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  createInitialState,
  loadState,
  saveState,
  isPhaseCompleted,
  markPhaseCompleted,
  type PipelineState,
  type StoredGenerateResult,
  type StoredReviewResult,
  type StoredRevisionResult,
  type StoredSwissMatch,
  type StoredSwissContestant,
} from "./state";

// Parse CLI arguments and load config
const cliArgs = parseArgs();
const config = loadConfig(cliArgs.configPath);

// Derive constants from config
const RUNS_DIR = config.output.runsDirectory;
const MODEL_NAMES = Object.keys(config.models) as ModelName[];
const SWISS_ROUNDS = config.tournament.swissRounds;
const TOP_N_PLAYOFF = config.tournament.playoffSize;
const INITIAL_GENERATIONS = config.tournament.initialGenerations;
const INITIAL_LEADERBOARD = config.tournament.initialLeaderboard;
const SWISS_JUDGE = config.tournament.swissJudge;
const PLAYOFF_JUDGES = config.tournament.playoffJudges;

// Dry run mode flag
const DRY_RUN = cliArgs.dryRun;

/**
 * Ensures the runs directory exists.
 */
async function ensureRunsDirectory(subdir?: string): Promise<string> {
  const dir = subdir ? join(RUNS_DIR, subdir) : RUNS_DIR;
  if (!DRY_RUN) {
    await mkdir(dir, { recursive: true });
  }
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
// Dry Run Helpers
// ============================================================================

/**
 * Creates mock data for dry run mode.
 */
function createMockStatblock(model: ModelName): string {
  return `# Mock Statblock (${model})
---
**Armor Class** 20
**Hit Points** 300
**Speed** 30 ft.

This is a mock statblock for dry-run testing purposes.`;
}

function createMockReview(): string {
  return "Mock review: The statblock is well-balanced but could use more legendary actions.";
}

/**
 * Logs configuration details for dry run.
 */
function printDryRunConfig(): void {
  console.log("\n📋 DRY RUN - Configuration Details:\n");
  console.log("Models:");
  for (const [name, model] of Object.entries(config.models)) {
    console.log(`  ${name}: ${model.slug} (reasoning: ${model.reasoningEffort})`);
  }
  console.log(`\nTournament:`);
  console.log(`  Swiss Rounds: ${SWISS_ROUNDS}`);
  console.log(`  Playoff Size: ${TOP_N_PLAYOFF}`);
  console.log(`  Initial Generations per Model: ${INITIAL_GENERATIONS}`);
  console.log(`  Initial Leaderboard Enabled: ${INITIAL_LEADERBOARD.enabled}`);
  console.log(`  Total Contestants: ${MODEL_NAMES.length ** 3}`);
  console.log(`\nOutput:`);
  console.log(`  Runs Directory: ${RUNS_DIR}`);
  console.log(`\nPrompts (first 100 chars):`);
  console.log(`  Generate: ${config.prompts.generate.user.slice(0, 100)}...`);
  console.log(`\n📋 END DRY RUN CONFIG\n`);
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Runs the cross-review pipeline with optimized Swiss System:
 * 1. Each model generates N drafts (parallel per model, configurable count)
 * 2. Optional initial round robin to pick the best draft per model
 * 3. Each model reviews ALL models' selected drafts (cross-review)
 * 4. ALL models revise each original based on each review (27 revisions for 3 models)
 * 5. Swiss tournament: 7 rounds of 1v1v1 judging (9 matches/round = 63 total)
 * 6. Top-8 Round Robin playoff with configurable judges
 * 7. Compute final leaderboard
 */
async function runCrossReviewPipeline(): Promise<void> {
  console.log("🎲 Auto-Draftify: D&D 5e Cross-Review Pipeline (Optimized Swiss)\n");

  if (DRY_RUN) {
    console.log("🧪 DRY RUN MODE - No API calls will be made\n");
    printDryRunConfig();
  }

  console.log("📝 Creating: Monster Statblock\n");
  console.log("Models:", Object.entries(getModels()).map(([k, v]) => `${k}: ${v}`).join("\n        "));
  console.log(`\nSwiss Rounds: ${SWISS_ROUNDS} (1v1v1 format)`);
  console.log(`Playoff: Top-${TOP_N_PLAYOFF} Round Robin (judges: ${PLAYOFF_JUDGES.map((j) => `${j.model} (${j.effort})`).join(", ")})`);
  console.log(
    `Swiss Judge: ${SWISS_JUDGE.model} (${SWISS_JUDGE.effort}) | Initial Leaderboard: ${INITIAL_LEADERBOARD.enabled
      ? (INITIAL_LEADERBOARD.judges.length ? INITIAL_LEADERBOARD.judges : PLAYOFF_JUDGES)
        .map((j) => `${j.model} (${j.effort})`)
        .join(", ")
      : "disabled"
    }\n`
  );

  // === RESUME / STATE INITIALIZATION ===
  let runDir: string;
  let state: PipelineState;
  let isResuming = false;

  if (cliArgs.resumeDir) {
    // Resume from existing run
    const resumePath = cliArgs.resumeDir.startsWith(RUNS_DIR)
      ? cliArgs.resumeDir
      : join(RUNS_DIR, cliArgs.resumeDir);

    if (!existsSync(resumePath)) {
      throw new Error(`Resume directory not found: ${resumePath}`);
    }

    const loadedState = loadState(resumePath);
    if (!loadedState) {
      throw new Error(`Could not load state from: ${resumePath}`);
    }

    runDir = resumePath;
    state = loadedState;
    isResuming = true;
    console.log(`\n🔄 RESUMING from: ${runDir}`);
    console.log(`   Phases completed: [${state.phasesCompleted.join(", ")}]\n`);
  } else {
    // Create new run directory
    const timestamp = getTimestamp();
    runDir = await ensureRunsDirectory(timestamp);
    state = createInitialState();
  }

  // Helper to get relative path for subdirectory creation
  const getRelativeRunPath = () => {
    if (runDir.includes(RUNS_DIR)) {
      return runDir.slice(runDir.indexOf(RUNS_DIR) + RUNS_DIR.length + 1);
    }
    return runDir;
  };
  const relRunPath = getRelativeRunPath();

  // Ensure subdirectories exist
  const revisionsDir = await ensureRunsDirectory(join(relRunPath, "revisions"));
  const reviewsDir = await ensureRunsDirectory(join(relRunPath, "reviews"));
  const initialLeaderboardDir = INITIAL_LEADERBOARD.enabled
    ? await ensureRunsDirectory(join(relRunPath, "initial_leaderboard"))
    : null;
  const swissJudgmentsDir = await ensureRunsDirectory(join(relRunPath, "swiss_judgments"));
  const playoffJudgmentsDir = await ensureRunsDirectory(join(relRunPath, "playoff_judgments"));
  const swissLogPath = join(runDir, "swiss_rounds.md");
  const initialLeaderboardLogPath = initialLeaderboardDir ? join(initialLeaderboardDir, "leaderboard.md") : null;
  const playoffLogPath = join(runDir, "playoff_rounds.md");

  // Initialize logs (only for new runs)
  if (!DRY_RUN && !isResuming) {
    await writeFile(swissLogPath, "# Swiss Tournament Log (1v1v1)\n\n", "utf-8");
    if (initialLeaderboardLogPath) {
      await writeFile(initialLeaderboardLogPath, "# Initial Draft Leaderboard\n\n", "utf-8");
    }
    await writeFile(playoffLogPath, "# Top-8 Round Robin Playoff\n\n", "utf-8");
  }

  // Save initial state for new runs
  if (!DRY_RUN && !isResuming) {
    saveState(runDir, state);
  }

  // === PHASE 1: Generate (3 parallel calls) ===
  console.log("Phase 1/6: Generating statblocks from all models...");
  const initialDraftsByModel = new Map<ModelName, GenerateResult[]>();
  const statblocksByModel = new Map<ModelName, GenerateResult>();
  let generateCount = 0;

  const totalGenerations = MODEL_NAMES.length * INITIAL_GENERATIONS;
  if (DRY_RUN) {
    // Mock data for dry run
    for (const model of MODEL_NAMES) {
      const drafts: GenerateResult[] = [];
      for (let i = 0; i < INITIAL_GENERATIONS; i++) {
        const result: GenerateResult = { text: createMockStatblock(`${model}-${i + 1}`), model };
        drafts.push(result);
        generateCount++;
        console.log(`  ✓ ${model} draft ${i + 1} generated (mock) (${generateCount}/${totalGenerations})`);
      }
      initialDraftsByModel.set(model, drafts);
    }
  } else {
    // Immediate writes as each completes
    const generatePromises = MODEL_NAMES.map(async (model) => {
      const drafts: GenerateResult[] = [];
      for (let i = 0; i < INITIAL_GENERATIONS; i++) {
        const result = await generateStatblock(model);
        drafts.push(result);
        generateCount++;
        console.log(`  ✓ ${result.model} draft ${i + 1} generated (${generateCount}/${totalGenerations})`);
        // Write immediately
        const path = join(runDir, `${result.model}_original_${i + 1}.md`);
        await writeFile(path, `# Original Statblock (${result.model} draft ${i + 1})\n\n${result.text}`, "utf-8");
      }
      initialDraftsByModel.set(model, drafts);
      return drafts;
    });
    await Promise.all(generatePromises);
  }
  console.log(`  ✓ ${DRY_RUN ? "Mock data generated" : `Wrote originals to ${runDir}`}\n`);

  // Save state after Phase 1
  if (!DRY_RUN) {
    state.generatedDrafts = initialDraftsByModel as Map<string, StoredGenerateResult[]>;
    markPhaseCompleted(state, "generate");
    saveState(runDir, state);
  }

  // === PHASE 2: Initial round robin (optional) ===
  console.log("Phase 2/6: Ranking initial drafts for seeding...");
  const leaderboardJudges = INITIAL_LEADERBOARD.judges.length ? INITIAL_LEADERBOARD.judges : PLAYOFF_JUDGES;

  interface DraftStanding {
    model: ModelName;
    draftIndex: number;
    text: string;
    result: GenerateResult;
    points: number;
    wins: number;
    draws: number;
    losses: number;
  }

  const draftStandings = new Map<string, DraftStanding>();
  for (const model of MODEL_NAMES) {
    const drafts = initialDraftsByModel.get(model) ?? [];
    drafts.forEach((draft, idx) => {
      draftStandings.set(`${model}_draft${idx + 1}`, {
        model,
        draftIndex: idx + 1,
        text: draft.text,
        result: draft,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      });
    });
  }

  if (!INITIAL_LEADERBOARD.enabled || leaderboardJudges.length === 0) {
    // No leaderboard: take first draft for each model
    for (const model of MODEL_NAMES) {
      const drafts = initialDraftsByModel.get(model) ?? [];
      if (drafts[0]) {
        statblocksByModel.set(model, drafts[0]!);
      }
    }
    console.log(
      `  ✓ ${INITIAL_LEADERBOARD.enabled && leaderboardJudges.length === 0
        ? "Initial leaderboard skipped (no judges configured)"
        : "Initial leaderboard disabled"
      }\n`
    );
  } else {
    const draftIds = Array.from(draftStandings.keys());
    const pairs: [string, string][] = [];
    for (let i = 0; i < draftIds.length; i++) {
      for (let j = i + 1; j < draftIds.length; j++) {
        pairs.push([draftIds[i]!, draftIds[j]!]);
      }
    }

    console.log(`  Running ${pairs.length} matchups with judges: ${leaderboardJudges.map((j) => `${j.model} (${j.effort})`).join(", ")}`);

    if (DRY_RUN) {
      for (const [idA, idB] of pairs) {
        const outcome = Math.random();
        if (outcome < 0.4) {
          draftStandings.get(idA)!.points += 1;
          draftStandings.get(idA)!.wins += 1;
          draftStandings.get(idB)!.losses += 1;
        } else if (outcome < 0.8) {
          draftStandings.get(idB)!.points += 1;
          draftStandings.get(idB)!.wins += 1;
          draftStandings.get(idA)!.losses += 1;
        } else {
          draftStandings.get(idA)!.points += 0.5;
          draftStandings.get(idB)!.points += 0.5;
          draftStandings.get(idA)!.draws += 1;
          draftStandings.get(idB)!.draws += 1;
        }
      }
    } else {
      const leaderboardPromises = pairs.map(async ([idA, idB]) => {
        const a = draftStandings.get(idA)!;
        const b = draftStandings.get(idB)!;
        const swapped = Math.random() > 0.5;
        const [firstId, secondId] = swapped ? [idB, idA] : [idA, idB];
        const [firstText, secondText] = swapped ? [b.text, a.text] : [a.text, b.text];

        const judgeResults = await Promise.all(
          leaderboardJudges.map((judge) =>
            pairwiseJudge("S1", firstText, "S2", secondText, judge.model, judge.effort)
          )
        );

        const voteCounts = new Map<string, number>([[firstId, 0], [secondId, 0]]);
        for (const result of judgeResults) {
          const winner = result.winner === "S1" ? firstId : secondId;
          voteCounts.set(winner, (voteCounts.get(winner) ?? 0) + 1);
        }

        const votes = Array.from(voteCounts.entries());
        votes.sort((a, b) => b[1]! - a[1]!);
        const topCount = votes[0]![1];
        const topWinners = votes.filter(([, count]) => count === topCount).map(([id]) => id);

        if (topWinners.length === 1) {
          const winner = topWinners[0]!;
          const loser = winner === firstId ? secondId : firstId;
          draftStandings.get(winner)!.points += 1;
          draftStandings.get(winner)!.wins += 1;
          draftStandings.get(loser)!.losses += 1;
        } else {
          draftStandings.get(firstId)!.points += 0.5;
          draftStandings.get(secondId)!.points += 0.5;
          draftStandings.get(firstId)!.draws += 1;
          draftStandings.get(secondId)!.draws += 1;
        }

        if (initialLeaderboardLogPath) {
          let logEntry = `- ${idA} vs ${idB}: `;
          if (topWinners.length === 1) {
            const winnerVotes = voteCounts.get(topWinners[0]!) ?? 0;
            const loserVotes = voteCounts.get(topWinners[0] === firstId ? secondId : firstId) ?? 0;
            logEntry += `**${topWinners[0]}** wins (${winnerVotes}-${loserVotes})`;
          } else {
            logEntry += `**DRAW** (${voteCounts.get(firstId)}-${voteCounts.get(secondId)})`;
          }
          logEntry += "\n";
          for (const result of judgeResults) {
            const resolvedWinner = result.winner === "S1" ? firstId : secondId;
            logEntry += `  - ${result.judge} picked ${resolvedWinner}: *${result.reasoning}*\n`;
          }
          await appendFile(initialLeaderboardLogPath, logEntry, "utf-8");
        }
      });

      await Promise.all(leaderboardPromises);
    }

    const sortedStandings = Array.from(draftStandings.entries()).sort((a, b) => {
      if (b[1].points !== a[1].points) return b[1].points - a[1].points;
      if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
      return a[1].draftIndex - b[1].draftIndex;
    });

    const winners = new Map<ModelName, DraftStanding>();
    for (const [, standing] of sortedStandings) {
      if (!winners.has(standing.model)) {
        winners.set(standing.model, standing);
        statblocksByModel.set(standing.model, standing.result);
      }
    }

    if (!DRY_RUN && initialLeaderboardLogPath) {
      await appendFile(initialLeaderboardLogPath, "\n## Standings\n\n", "utf-8");
      await appendFile(initialLeaderboardLogPath, "| Rank | Draft | Model | Points | W | D | L |\n", "utf-8");
      await appendFile(initialLeaderboardLogPath, "|------|-------|-------|--------|---|---|---|\n", "utf-8");
      for (let i = 0; i < sortedStandings.length; i++) {
        const [id, s] = sortedStandings[i]!;
        await appendFile(
          initialLeaderboardLogPath,
          `| ${i + 1} | ${id} | ${s.model} | ${s.points} | ${s.wins} | ${s.draws} | ${s.losses} |\n`,
          "utf-8"
        );
      }
    }

    console.log(
      `  ✓ Selected winners: ${MODEL_NAMES.map((m) => `${m} draft ${winners.get(m)?.draftIndex ?? 1}`).join(", ")
      }\n`
    );
  }

  // === PHASE 2: Review (9 parallel calls) ===
  console.log("Phase 3/6: Cross-reviewing statblocks (including self-review)...");
  const reviews: ReviewResult[] = [];
  let reviewCount = 0;
  const totalReviews = MODEL_NAMES.length * MODEL_NAMES.length;

  if (DRY_RUN) {
    // Mock reviews
    for (const reviewer of MODEL_NAMES) {
      for (const reviewed of MODEL_NAMES) {
        const review: ReviewResult = { text: createMockReview(), reviewer, reviewed };
        reviews.push(review);
        reviewCount++;
        const selfTag = reviewer === reviewed ? " (self)" : "";
        console.log(`  ✓ ${reviewer} reviewed ${reviewed}'s statblock${selfTag} (mock) (${reviewCount}/${totalReviews})`);
      }
    }
  } else {
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
  }
  console.log(`  ✓ ${DRY_RUN ? "Mock reviews generated" : `Wrote reviews to ${reviewsDir}`}\n`);

  // === PHASE 3: Revise (27 parallel calls) ===
  console.log("Phase 4/6: Revising statblocks...");

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

  if (DRY_RUN) {
    // Mock revisions
    for (const task of revisionTasks) {
      const result: ReviseResult = { text: createMockStatblock(task.reviser), model: task.reviser };
      revisedById.set(task.id, { result, task });
      reviseCount++;
      console.log(`  ✓ ${task.id} (mock) (${reviseCount}/${totalRevisions})`);
    }
  } else {
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
  }
  console.log(`  ✓ ${DRY_RUN ? "Mock revisions generated" : `Wrote ${totalRevisions} revisions to ${revisionsDir}`}\n`);

  // === PHASE 4: Swiss Tournament (7 rounds, 1v1v1) ===
  console.log(`Phase 5/6: Swiss Tournament (${SWISS_ROUNDS} rounds, 1v1v1 format)...`);

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
    if (!DRY_RUN) {
      await appendFile(swissLogPath, `## Round ${round}\n\n`, "utf-8");
    }

    const { triples } = generateSwissTriples(contestants, round);

    if (DRY_RUN) {
      // Mock judging - random results
      for (const [idA, idB, idC] of triples) {
        const ids = shuffleArray([idA, idB, idC]);
        const match: SwissMatch = {
          round,
          ids: [idA, idB, idC],
          first: ids[0]!,
          second: ids[1]!,
          third: ids[2]!,
          reasoning: "Mock judgment for dry run.",
        };

        // Update contestants
        const first = contestants.find((c) => c.id === match.first);
        const second = contestants.find((c) => c.id === match.second);
        const third = contestants.find((c) => c.id === match.third);

        if (first && second && third) {
          first.points += 2;
          first.placements.first++;
          second.points += 1;
          second.placements.second++;
          third.placements.third++;

          first.opponents.add(second.id);
          first.opponents.add(third.id);
          second.opponents.add(first.id);
          second.opponents.add(third.id);
          third.opponents.add(first.id);
          third.opponents.add(second.id);
        }

        allSwissMatches.push(match);
        console.log(`    ✓ 1st: ${match.first} | 2nd: ${match.second} | 3rd: ${match.third} (mock)`);
      }
    } else {
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
        const result = await threeWayJudge("S1", e1[1], "S2", e2[1], "S3", e3[1], SWISS_JUDGE.model, SWISS_JUDGE.effort);

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
        judgmentMd += `**Judge**: ${SWISS_JUDGE.model} (${SWISS_JUDGE.effort} thinking)\n\n`;
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
    }
    console.log(`    ✓ Round ${round} complete (${triples.length} matches)`);
  }

  console.log("");

  // === PHASE 5: Top-8 Round Robin Playoff (Dual-Judge) ===
  console.log(`Phase 6/6: Top-${TOP_N_PLAYOFF} Round Robin Playoff (judges: ${PLAYOFF_JUDGES.map((j) => `${j.model} (${j.effort})`).join(", ")})...`);

  // Get top 8 by Swiss points
  const sortedBySwiss = [...contestants].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.placements.first !== a.placements.first) return b.placements.first - a.placements.first;
    return b.placements.second - a.placements.second;
  });
  const top8 = sortedBySwiss.slice(0, TOP_N_PLAYOFF);
  const top8Ids = new Set(top8.map((c) => c.id));

  console.log(`  Top ${TOP_N_PLAYOFF} qualifiers: ${top8.map((c) => c.id).join(", ")}`);
  if (!DRY_RUN) {
    await appendFile(playoffLogPath, `## Qualifiers\n\n${top8.map((c, i) => `${i + 1}. ${c.id} (${c.points} pts)`).join("\n")}\n\n`, "utf-8");
  }

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

  console.log(
    `  Running ${playoffPairs.length} matchups (×${PLAYOFF_JUDGES.length} judges = ${playoffPairs.length * PLAYOFF_JUDGES.length} total)...`
  );
  if (!DRY_RUN) {
    await appendFile(playoffLogPath, `## Matches\n\n`, "utf-8");
  }

  if (DRY_RUN) {
    // Mock playoff results
    for (const [idA, idB] of playoffPairs) {
      const resultA = playoffResults.get(idA)!;
      const resultB = playoffResults.get(idB)!;

      // Random outcome
      const outcome = Math.random();
      if (outcome < 0.4) {
        // A wins
        resultA.points += 1;
        resultA.wins++;
        resultB.losses++;
        console.log(`    ✓ ${idA} beat ${idB} (mock)`);
      } else if (outcome < 0.8) {
        // B wins
        resultB.points += 1;
        resultB.wins++;
        resultA.losses++;
        console.log(`    ✓ ${idB} beat ${idA} (mock)`);
      } else {
        // Draw
        resultA.points += 0.5;
        resultA.draws++;
        resultB.points += 0.5;
        resultB.draws++;
        console.log(`    = ${idA} drew ${idB} (mock)`);
      }
    }
  } else {
    // Run all pairs with configurable judges and randomized positions
    const playoffPromises = playoffPairs.map(async ([idA, idB]) => {
      const textA = revisedById.get(idA)!.result.text;
      const textB = revisedById.get(idB)!.result.text;

      // Randomize positions for this match
      const swapped = Math.random() > 0.5;
      const [firstId, secondId] = swapped ? [idB, idA] : [idA, idB];
      const [firstText, secondText] = swapped ? [textB, textA] : [textA, textB];

      const judgeResults = await Promise.all(
        PLAYOFF_JUDGES.map((judge) => pairwiseJudge("S1", firstText, "S2", secondText, judge.model, judge.effort))
      );

      const voteCounts = new Map<string, number>([
        [firstId, 0],
        [secondId, 0],
      ]);

      for (const result of judgeResults) {
        const resolvedWinner = result.winner === "S1" ? firstId : secondId;
        voteCounts.set(resolvedWinner, (voteCounts.get(resolvedWinner) ?? 0) + 1);
      }

      const votes = Array.from(voteCounts.entries());
      votes.sort((a, b) => b[1]! - a[1]!);
      const topCount = votes[0]![1];
      const topWinners = votes.filter(([, count]) => count === topCount).map(([id]) => id);

      let matchResult: { winner: string | null; loser: string | null; isDraw: boolean };
      let logEntry: string;

      if (topWinners.length === 1) {
        const winner = topWinners[0]!;
        const loser = winner === idA ? idB : idA;
        const winnerVotes = voteCounts.get(winner) ?? 0;
        const loserVotes = voteCounts.get(loser) ?? 0;
        matchResult = { winner, loser, isDraw: false };
        logEntry = `- **${winner}** beat ${loser} (${winnerVotes}-${loserVotes})\n`;
      } else {
        const votesA = voteCounts.get(idA) ?? 0;
        const votesB = voteCounts.get(idB) ?? 0;
        matchResult = { winner: null, loser: null, isDraw: true };
        logEntry = `- ${idA} vs ${idB}: **DRAW** (${votesA}-${votesB})\n`;
      }

      for (const result of judgeResults) {
        const resolvedWinner = result.winner === "S1" ? firstId : secondId;
        logEntry += `  - ${result.judge} picked ${resolvedWinner}: *${result.reasoning}*\n`;
      }

      // Write detailed judgment file for playoff
      const judgmentFile = join(playoffJudgmentsDir, `${idA}_vs_${idB}.md`);
      let judgmentMd = `# Playoff Judgment: ${idA} vs ${idB}\n\n`;
      judgmentMd += `**Position Order**: S1=${firstId}, S2=${secondId}\n\n`;
      judgmentMd += `## Judges\n\n`;
      for (let i = 0; i < judgeResults.length; i++) {
        const judgeCfg = PLAYOFF_JUDGES[i]!;
        const result = judgeResults[i]!;
        const resolvedWinner = result.winner === "S1" ? firstId : secondId;
        judgmentMd += `### ${judgeCfg.model} (${judgeCfg.effort} thinking)\n\n`;
        judgmentMd += `- **Winner**: ${resolvedWinner}\n`;
        judgmentMd += `- **Reasoning**: ${result.reasoning}\n\n`;
      }
      judgmentMd += `## Final Result\n\n`;
      if (matchResult.isDraw) {
        judgmentMd += `**DRAW** - Judges tied (0.5 pts each)\n`;
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
  }

  // Add playoff summary to log
  if (!DRY_RUN) {
    await appendFile(playoffLogPath, "\n## Playoff Standings\n\n", "utf-8");
    await appendFile(playoffLogPath, "| Rank | ID | Points | W | D | L |\n", "utf-8");
    await appendFile(playoffLogPath, "|------|----|--------|---|---|---|\n", "utf-8");

    const playoffSorted = [...playoffResults.entries()].sort((a, b) => b[1].points - a[1].points);
    for (let i = 0; i < playoffSorted.length; i++) {
      const [id, result] = playoffSorted[i]!;
      const medal = i < 3 ? ["🥇", "🥈", "🥉"][i] : "  ";
      await appendFile(playoffLogPath, `| ${medal} ${i + 1} | ${id} | ${result.points} | ${result.wins} | ${result.draws} | ${result.losses} |\n`, "utf-8");
    }
  }

  console.log("");

  // === Finalize: Write leaderboard ===
  const leaderboard = computeLeaderboard(contestants, allSwissMatches, playoffResults);
  const leaderboardPath = join(runDir, "leaderboard.md");
  if (!DRY_RUN) {
    await writeFile(leaderboardPath, leaderboard, "utf-8");
    console.log(`  ✓ Wrote ${leaderboardPath}`);
  } else {
    console.log(`  ✓ Leaderboard computed (dry run - not written)`);
  }

  // Print summary stats
  console.log("\n" + "=".repeat(60));
  console.log("📊 TOURNAMENT SUMMARY");
  console.log("=".repeat(60));
  if (DRY_RUN) {
    console.log("🧪 DRY RUN - No API calls were made");
  }
  console.log(`Swiss Rounds: ${SWISS_ROUNDS} (1v1v1 format)`);
  console.log(`Swiss Matches: ${allSwissMatches.length}`);
  console.log(
    `Playoff Judgments: ${playoffPairs.length * PLAYOFF_JUDGES.length} (${playoffPairs.length} pairs × ${PLAYOFF_JUDGES.length} judges)`
  );
  const initialLeaderboardPairs =
    INITIAL_LEADERBOARD.enabled && leaderboardJudges.length > 0
      ? (MODEL_NAMES.length * INITIAL_GENERATIONS * (MODEL_NAMES.length * INITIAL_GENERATIONS - 1)) / 2
      : 0;
  console.log(
    `Total Judge Calls: ${allSwissMatches.length + playoffPairs.length * PLAYOFF_JUDGES.length + initialLeaderboardPairs * leaderboardJudges.length
    }`
  );
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
  console.log(`\n✨ Pipeline complete! ${DRY_RUN ? "(dry run)" : `Output in: ${runDir}`}`);
}

// Run the pipeline
runCrossReviewPipeline().catch((error) => {
  console.error("Error running pipeline:", error);
  process.exit(1);
});