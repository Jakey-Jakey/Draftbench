import { writeFile } from "fs/promises";
import { join } from "path";
import {
	type GenerateResult,
	type ModelName,
	type ReviewResult,
	type ReviseResult,
	reviseStatblock,
} from "../aiClient";
import { getConfig, getModelsForRole } from "../config";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredRevisionResult,
	saveState,
} from "../state";
import { createMockStatblock } from "../utils";

// ============================================================================
// Revise Phase Types
// ============================================================================

interface RevisionTask {
	generator: ModelName;
	reviewer: ModelName;
	reviser: ModelName;
	id: string;
}

export interface RevisionEntry {
	result: ReviseResult;
	task: RevisionTask;
}

export interface RevisePhaseResult {
	/** Map of revision ID to result */
	revisionsById: Map<string, RevisionEntry>;
}

// ============================================================================
// Revise Phase
// ============================================================================

/**
 * Phase 4: Revise statblocks based on reviews.
 * ALL models revise each original based on each review (27 revisions for 3 models).
 */
export async function runRevisePhase(
	runDir: string,
	revisionsDir: string,
	state: PipelineState,
	selectedByModel: Map<ModelName, GenerateResult>,
	reviews: ReviewResult[],
	dryRun: boolean,
	isResuming: boolean,
): Promise<RevisePhaseResult> {
	const config = getConfig();
	const REVISER_MODELS = getModelsForRole("revisers") as ModelName[];

	console.log("Phase 4/6: Revising statblocks...");

	// Build revision tasks
	const revisionTasks: RevisionTask[] = [];
	for (const review of reviews) {
		for (const reviser of REVISER_MODELS) {
			revisionTasks.push({
				generator: review.reviewed,
				reviewer: review.reviewer,
				reviser: reviser,
				id: `${review.reviewed}_${review.reviewer}_${reviser}`,
			});
		}
	}

	const revisionsById = new Map<string, RevisionEntry>();
	let reviseCount = 0;
	const totalRevisions = revisionTasks.length;

	// Resume from state if available
	const resumeRevisions =
		isResuming && isPhaseCompleted(state, "revise") && state.revisions;

	if (resumeRevisions) {
		for (const [id, stored] of state.revisions as Map<
			string,
			StoredRevisionResult
		>) {
			revisionsById.set(id, {
				result: { text: stored.text, model: stored.reviser },
				task: {
					id: stored.id,
					generator: stored.generator as ModelName,
					reviewer: stored.reviewer as ModelName,
					reviser: stored.reviser as ModelName,
				},
			});
		}
		reviseCount = revisionsById.size;
		console.log(
			`  ↩︎ Loaded ${reviseCount} revisions from state (skipping revision calls)\n`,
		);
		return { revisionsById };
	}

	if (dryRun) {
		// Mock revisions
		for (const task of revisionTasks) {
			const result: ReviseResult = {
				text: createMockStatblock(task.reviser),
				model: task.reviser,
			};
			revisionsById.set(task.id, { result, task });
			reviseCount++;
			console.log(`  ✓ ${task.id} (mock) (${reviseCount}/${totalRevisions})`);
		}
	} else {
		// Real API calls
		const revisePromises = revisionTasks.map(async (task) => {
			const originalStatblock = selectedByModel.get(task.generator)!.text;
			const review = reviews.find(
				(r) => r.reviewed === task.generator && r.reviewer === task.reviewer,
			)!;
			const feedback = `## Feedback:\n${review.text}`;
			const result = await reviseStatblock(
				task.reviser,
				originalStatblock,
				feedback,
			);
			revisionsById.set(task.id, { result, task });
			reviseCount++;
			console.log(`  ✓ ${task.id} (${reviseCount}/${totalRevisions})`);
			// Write immediately
			const path = join(revisionsDir, `${task.id}.md`);
			await writeFile(
				path,
				`# ${task.generator}'s Statblock\n\n**Reviewed by:** ${task.reviewer}\n**Revised by:** ${task.reviser}\n\n${result.text}`,
				"utf-8",
			);
			return { task, result };
		});
		await Promise.all(revisePromises);
	}

	console.log(
		`  ✓ ${dryRun ? "Mock revisions generated" : `Wrote ${totalRevisions} revisions to ${revisionsDir}`}\n`,
	);

	// Save state
	if (!dryRun && !resumeRevisions) {
		state.revisions = new Map(
			Array.from(revisionsById.entries()).map(([id, entry]) => [
				id,
				{
					id,
					text: entry.result.text,
					generator: entry.task.generator,
					reviewer: entry.task.reviewer,
					reviser: entry.task.reviser,
				},
			]),
		) as Map<string, StoredRevisionResult>;
		markPhaseCompleted(state, "revise");
		saveState(runDir, state);
	}

	return { revisionsById };
}
