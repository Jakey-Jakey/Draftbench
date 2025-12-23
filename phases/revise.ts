import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type GenerateResult,
	type ModelSlug,
	type ReviewResult,
	type ReviseResult,
	reviseStatblock,
} from "../aiClient";
import { getConfig, getRoleEntries } from "../config";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredRevisionResult,
	saveState,
} from "../state";
import { createMockStatblock, getShortModelName } from "../utils";

// ============================================================================
// Revise Phase Types
// ============================================================================

interface RevisionTask {
	generator: ModelSlug;
	reviewer: ModelSlug;
	reviser: ModelSlug;
	reviserEffort: string;
	reviserTemperature?: number;
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
 * ALL reviser models revise each original based on each review.
 */
export async function runRevisePhase(
	runDir: string,
	revisionsDir: string,
	state: PipelineState,
	selectedByModel: Map<ModelSlug, GenerateResult>,
	reviews: ReviewResult[],
	dryRun: boolean,
	isResuming: boolean,
): Promise<RevisePhaseResult> {
	const revisers = getRoleEntries("revisers");

	console.log("Phase 4/6: Revising statblocks...");

	// Build revision tasks
	const revisionTasks: RevisionTask[] = [];
	for (const review of reviews) {
		for (const reviser of revisers) {
			const genShort = getShortModelName(review.reviewed);
			const revShort = getShortModelName(review.reviewer);
			const reviserShort = getShortModelName(reviser.model);
			revisionTasks.push({
				generator: review.reviewed,
				reviewer: review.reviewer,
				reviser: reviser.model,
				reviserEffort: reviser.effort ?? "high",
				reviserTemperature: reviser.temperature,
				id: `${genShort}_${revShort}_${reviserShort}`,
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
					generator: stored.generator as ModelSlug,
					reviewer: stored.reviewer as ModelSlug,
					reviser: stored.reviser as ModelSlug,
					reviserEffort: "high",
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
				text: createMockStatblock(task.id),
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
				task.reviserEffort as
					| "high"
					| "medium"
					| "low"
					| "xhigh"
					| "minimal"
					| "none",
				task.reviserTemperature,
			);
			revisionsById.set(task.id, { result, task });
			reviseCount++;
			console.log(`  ✓ ${task.id} (${reviseCount}/${totalRevisions})`);
			// Write immediately
			const path = join(revisionsDir, `${task.id}.md`);
			const genShort = getShortModelName(task.generator);
			const revShort = getShortModelName(task.reviewer);
			const reviserShort = getShortModelName(task.reviser);
			await writeFile(
				path,
				`# ${genShort}'s Statblock\n\n**Reviewed by:** ${revShort}\n**Revised by:** ${reviserShort}\n\n${result.text}`,
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
