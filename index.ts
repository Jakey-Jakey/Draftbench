import { generateEssay, reviewEssay, reviseEssay } from "./aiClient";
import { writePipelineOutputs } from "./fileUtils";

/**
 * Prompts the user for an essay topic via stdin.
 */
async function promptForTopic(): Promise<string> {
  const prompt = "Enter your essay topic: ";
  process.stdout.write(prompt);

  return new Promise((resolve) => {
    process.stdin.once("data", (data) => {
      const topic = data.toString().trim();
      if (!topic) {
        console.error("Topic cannot be empty. Please try again.");
        process.exit(1);
      }
      resolve(topic);
    });
  });
}

/**
 * Runs the complete essay pipeline: generation → review → revision.
 */
async function runEssayPipeline(): Promise<void> {
  console.log("🎓 Auto-Draftify: Essay Generation Pipeline\n");

  // Step 1: Get topic from user
  const topic = await promptForTopic();
  console.log(`\n📝 Topic: ${topic}\n`);

  // Step 2: Generate initial essay
  console.log("Step 1/3: Generating initial essay...");
  const essayResult = await generateEssay(topic);
  console.log("✓ Essay generated\n");

  // Step 3: Review the essay
  console.log("Step 2/3: Reviewing essay...");
  const reviewResult = await reviewEssay(essayResult.text);
  console.log("✓ Review completed\n");

  // Step 4: Revise the essay
  console.log("Step 3/3: Revising essay based on feedback...");
  const revisionResult = await reviseEssay(
    topic,
    essayResult.text,
    reviewResult.text
  );
  console.log("✓ Revision completed\n");

  // Step 5: Write outputs to files
  await writePipelineOutputs({
    essay: essayResult.text,
    review: reviewResult.text,
    revision: revisionResult.text,
  });

  console.log("\n✨ Pipeline complete!");
}

// Run the pipeline
runEssayPipeline().catch((error) => {
  console.error("Error running pipeline:", error);
  process.exit(1);
});
