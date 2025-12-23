import {
  generateStatblock,
  reviewStatblock,
  reviseStatblock,
  judgeStatblocks,
  MODELS,
  type ModelName,
  type GenerateResult,
  type ReviewResult,
  type ReviseResult,
  type JudgeResult,
} from "./aiClient";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const RUNS_DIR = "runs";
const MODEL_NAMES: ModelName[] = ["claude", "gpt", "gemini"];

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
 * Computes leaderboard from judge results.
 * Winner determined by average rank (lower = better), scores are tiebreaker.
 */
function computeLeaderboard(judgeResults: JudgeResult[], allIds: string[]): string {
  // Aggregate ranks and scores by statblock ID
  const dataById = new Map<string, { ranks: number[]; scores: number[] }>();
  for (const id of allIds) {
    dataById.set(id, { ranks: [], scores: [] });
  }

  for (const result of judgeResults) {
    for (const ranking of result.rankings) {
      if (dataById.has(ranking.id)) {
        dataById.get(ranking.id)!.ranks.push(ranking.rank);
        dataById.get(ranking.id)!.scores.push(ranking.score);
      }
    }
  }

  // Calculate averages and sort
  const leaderboard = allIds.map((id) => {
    const data = dataById.get(id)!;
    const avgRank = data.ranks.length > 0 ? data.ranks.reduce((a, b) => a + b, 0) / data.ranks.length : 99;
    const avgScore = data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0;
    const [generator, reviewer] = id.split("_");
    return {
      id,
      generator,
      reviewer,
      avgRank: Math.round(avgRank * 100) / 100,
      avgScore: Math.round(avgScore * 10) / 10
    };
  }).sort((a, b) => {
    if (a.avgRank !== b.avgRank) return a.avgRank - b.avgRank;
    return b.avgScore - a.avgScore;
  });

  // Build markdown
  let md = "# 🏆 Leaderboard\n\n";
  md += "> Winner determined by **average rank** (lower = better). Scores are tiebreaker.\n\n";
  md += "| Rank | Generator | Reviewer | Avg Rank | Avg Score | Claude | GPT | Gemini |\n";
  md += "|------|-----------|----------|----------|-----------|--------|-----|--------|\n";

  leaderboard.forEach((entry, index) => {
    const position = index + 1;
    const medal = position <= 3 ? ["🥇", "🥈", "🥉"][position - 1] : "  ";

    // Get individual judge rankings
    const claudeRank = judgeResults.find(r => r.judge === "claude")?.rankings.find(r => r.id === entry.id)?.rank ?? "-";
    const gptRank = judgeResults.find(r => r.judge === "gpt")?.rankings.find(r => r.id === entry.id)?.rank ?? "-";
    const geminiRank = judgeResults.find(r => r.judge === "gemini")?.rankings.find(r => r.id === entry.id)?.rank ?? "-";

    md += `| ${medal} ${position} | **${entry.generator}** | ${entry.reviewer} | ${entry.avgRank} | ${entry.avgScore} | #${claudeRank} | #${gptRank} | #${geminiRank} |\n`;
  });

  md += "\n## Judge Reasoning\n\n";
  for (const result of judgeResults) {
    md += `### ${result.judge}'s Assessment\n${result.reasoning}\n\n`;
  }

  return md;
}

/**
 * Runs the cross-review pipeline:
 * 1. Each model generates its own statblock (3 parallel calls)
 * 2. Each model reviews ALL 3 models' outputs including self (9 parallel calls)
 * 3. Each model revises based on EACH review separately (9 parallel calls)
 * 4. Each model judges all 9 final outputs (3 parallel calls)
 * 5. Compute leaderboard from aggregated rankings
 * 
 * Total: 24 API calls
 */
async function runCrossReviewPipeline(): Promise<void> {
  console.log("🎲 Auto-Draftify: D&D 5e Cross-Review Pipeline\n");
  console.log("📝 Creating: Doctor Doom (Marvel Comics) Monster Statblock\n");
  console.log("Models:", Object.entries(MODELS).map(([k, v]) => `${k}: ${v}`).join("\n        "));
  console.log("\n");

  // === PHASE 1: Generate (3 parallel calls) ===
  console.log("Phase 1/5: Generating statblocks from all models...");
  const generatePromises = MODEL_NAMES.map((model) => generateStatblock(model));
  const generated = await Promise.all(generatePromises);

  const statblocksByModel = new Map<ModelName, GenerateResult>();
  for (const result of generated) {
    statblocksByModel.set(result.model, result);
    console.log(`  ✓ ${result.model} generated`);
  }
  console.log("");

  // === PHASE 2: Review (9 parallel calls - including self-reviews) ===
  console.log("Phase 2/5: Cross-reviewing statblocks (including self-review)...");
  const reviewPromises: Promise<ReviewResult>[] = [];

  for (const reviewer of MODEL_NAMES) {
    for (const reviewed of MODEL_NAMES) {
      const statblock = statblocksByModel.get(reviewed)!.text;
      reviewPromises.push(reviewStatblock(reviewer, reviewed, statblock));
    }
  }

  const reviews = await Promise.all(reviewPromises);

  for (const review of reviews) {
    const selfTag = review.reviewer === review.reviewed ? " (self)" : "";
    console.log(`  ✓ ${review.reviewer} reviewed ${review.reviewed}'s statblock${selfTag}`);
  }
  console.log("");

  // === PHASE 3: Revise (9 parallel calls - one per review) ===
  console.log("Phase 3/5: Revising statblocks (9 separate revisions)...");

  interface RevisionTask {
    generator: ModelName;
    reviewer: ModelName;
    id: string;
  }

  const revisionTasks: RevisionTask[] = [];
  for (const review of reviews) {
    revisionTasks.push({
      generator: review.reviewed,  // The model whose statblock is being revised
      reviewer: review.reviewer,   // The model who provided the feedback
      id: `${review.reviewed}_${review.reviewer}`,
    });
  }

  const revisePromises = revisionTasks.map((task) => {
    const originalStatblock = statblocksByModel.get(task.generator)!.text;
    const review = reviews.find(r => r.reviewed === task.generator && r.reviewer === task.reviewer)!;
    const feedback = `## Feedback from ${task.reviewer}:\n${review.text}`;
    return reviseStatblock(task.generator, originalStatblock, feedback);
  });

  const revised = await Promise.all(revisePromises);

  // Map revisions by ID (generator_reviewer)
  const revisedById = new Map<string, { result: ReviseResult; task: RevisionTask }>();
  for (let i = 0; i < revised.length; i++) {
    const task = revisionTasks[i];
    revisedById.set(task.id, { result: revised[i], task });
    const selfTag = task.generator === task.reviewer ? " (self-reviewed)" : "";
    console.log(`  ✓ ${task.generator}_${task.reviewer}${selfTag}`);
  }
  console.log("");

  // === PHASE 4: Judge (3 parallel calls) ===
  console.log("Phase 4/5: Judging all 9 final statblocks...");

  // Build map for judging
  const statblocksForJudging = new Map<string, string>();
  for (const [id, data] of revisedById) {
    statblocksForJudging.set(id, data.result.text);
  }

  const judgePromises = MODEL_NAMES.map((judge) => judgeStatblocks(judge, statblocksForJudging));
  const judgeResults = await Promise.all(judgePromises);

  for (const result of judgeResults) {
    const top3 = result.rankings.slice(0, 3).map(r => `${r.id}:#${r.rank}`).join(", ");
    console.log(`  ✓ ${result.judge} judged (top 3: ${top3})`);
  }
  console.log("");

  // === PHASE 5: Write outputs ===
  console.log("Phase 5/5: Writing outputs...");
  const timestamp = getTimestamp();
  const runDir = await ensureRunsDirectory(timestamp);
  const revisionsDir = await ensureRunsDirectory(join(timestamp, "revisions"));
  const reviewsDir = await ensureRunsDirectory(join(timestamp, "reviews"));
  const judgesDir = await ensureRunsDirectory(join(timestamp, "judges"));

  // Write original generations
  for (const result of generated) {
    const path = join(runDir, `${result.model}_original.md`);
    await writeFile(path, `# Original Statblock (${result.model})\n\n${result.text}`, "utf-8");
  }

  // Write all 9 revised statblocks
  for (const [id, data] of revisedById) {
    const path = join(revisionsDir, `${id}.md`);
    await writeFile(path, `# ${data.task.generator}'s Statblock (revised by ${data.task.reviewer})\n\n${data.result.text}`, "utf-8");
  }
  console.log(`  ✓ Wrote 9 revised statblocks to ${revisionsDir}`);

  // Write reviews
  for (const review of reviews) {
    const path = join(reviewsDir, `${review.reviewer}_reviews_${review.reviewed}.md`);
    await writeFile(path, `# ${review.reviewer} reviews ${review.reviewed}\n\n${review.text}`, "utf-8");
  }

  // Write judge outputs
  for (const result of judgeResults) {
    const path = join(judgesDir, `${result.judge}_judgment.md`);
    await writeFile(path, `# ${result.judge}'s Judgment\n\n${result.raw}`, "utf-8");
  }

  // Write leaderboard
  const allIds = Array.from(revisedById.keys());
  const leaderboard = computeLeaderboard(judgeResults, allIds);
  const leaderboardPath = join(runDir, "leaderboard.md");
  await writeFile(leaderboardPath, leaderboard, "utf-8");
  console.log(`  ✓ Wrote ${leaderboardPath}`);

  // Print leaderboard to console
  console.log("\n" + "=".repeat(60));
  console.log(leaderboard);
  console.log("=".repeat(60));

  console.log(`\n✨ Pipeline complete! Output in: ${runDir}`);
}

// Run the pipeline
runCrossReviewPipeline().catch((error) => {
  console.error("Error running pipeline:", error);
  process.exit(1);
});
