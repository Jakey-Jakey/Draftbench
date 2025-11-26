import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const RUNS_DIR = "runs";

export interface PipelineOutput {
  essay: string;
  review: string;
  revision: string;
}

/**
 * Ensures the runs directory exists, creating it if necessary.
 */
async function ensureRunsDirectory(): Promise<void> {
  try {
    await mkdir(RUNS_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, which is fine
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Generates a timestamp string for filenames.
 */
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
}

/**
 * Writes the pipeline outputs to markdown files in the runs directory.
 */
export async function writePipelineOutputs(
  outputs: PipelineOutput
): Promise<void> {
  await ensureRunsDirectory();
  const timestamp = getTimestamp();

  const files = [
    {
      path: join(RUNS_DIR, `${timestamp}-essay.md`),
      content: `# Original Essay\n\n${outputs.essay}`,
    },
    {
      path: join(RUNS_DIR, `${timestamp}-review.md`),
      content: `# Review Feedback\n\n${outputs.review}`,
    },
    {
      path: join(RUNS_DIR, `${timestamp}-revision.md`),
      content: `# Revised Essay\n\n${outputs.revision}`,
    },
  ];

  for (const file of files) {
    await writeFile(file.path, file.content, "utf-8");
  }

  console.log(`\n✓ Files written:`);
  files.forEach((file) => {
    console.log(`  - ${file.path}`);
  });
}
