import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type GenerateResult,
	type ModelSlug,
	type ReviewResult,
	type ReviseResult,
	reviseStatblock,
} from "../aiClient";
import type { PipelineConfig, ReasoningEffort, RoleEntry } from "../config";
import { Semaphore } from "../semaphore";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredRevisionResult,
	saveState,
} from "../state";
import {
	createMockStatblock,
	getModelToken,
	getShortModelName,
} from "../utils";

// ============================================================================
// Revise Phase Types
// ============================================================================

interface RevisionTask {
	generator: ModelSlug;
	reviewer: ModelSlug;
	reviser: ModelSlug;
	reviserEffort: ReasoningEffort;
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
 * Run the revise phase where each reviser model revises every original statblock using each available review.
 *
 * Writes per-task Markdown files to `revisionsDir` and persists revision entries into `state` when not a dry run.
 *
 * @returns An object containing `revisionsById`: a map from revision id to `RevisionEntry` for all gathered revisions
 */
export async function runRevisePhase(
	runDir: string,
	revisionsDir: string,
	state: PipelineState,
	reviserConfig: {
		revisers: RoleEntry[];
		prompts: PipelineConfig["prompts"];
	},
	selectedByModel: Map<ModelSlug, GenerateResult>,
	reviews: ReviewResult[],
	dryRun: boolean,
	isResuming: boolean,
): Promise<RevisePhaseResult> {
	const revisers = reviserConfig.revisers;

	console.log("Phase 4/6: Revising statblocks...");

	// Build revision tasks
	const revisionTasks: RevisionTask[] = [];
	for (const review of reviews) {
		for (const reviser of revisers) {
			const genToken = getModelToken(review.reviewed);
			const revToken = getModelToken(review.reviewer);
			const reviserToken = getModelToken(reviser.model);
			revisionTasks.push({
				generator: review.reviewed,
				reviewer: review.reviewer,
				reviser: reviser.model,
				reviserEffort: reviser.effort ?? "high",
				reviserTemperature: reviser.temperature,
				id: `${genToken}_${revToken}_${reviserToken}`,
			});
		}
	}

	const revisionsById = new Map<string, RevisionEntry>();
	const completedRevisionIds = new Set<string>();
	let reviseCount = 0;
	const totalRevisions = revisionTasks.length;
	const revisionTaskIds = new Set(revisionTasks.map((task) => task.id));
	const reviewMap = new Map(
		reviews.map(
			(review) => [`${review.reviewed}::${review.reviewer}`, review] as const,
		),
	);

	// Load already completed revisions from state for partial resume.
	if (isResuming && state.revisions) {
		for (const [id, stored] of state.revisions as Map<
			string,
			StoredRevisionResult
		>) {
			if (!revisionTaskIds.has(id)) continue;

			const reviserFromConfig = revisers.find(
				(r) => r.model === stored.reviser,
			);
			const reviserEffort =
				(stored.reviserEffort as ReasoningEffort | undefined) ??
				reviserFromConfig?.effort ??
				"high";
			const reviserTemperature =
				stored.reviserTemperature ?? reviserFromConfig?.temperature;

			revisionsById.set(id, {
				result: { text: stored.text, model: stored.reviser },
				task: {
					id: stored.id,
					generator: stored.generator as ModelSlug,
					reviewer: stored.reviewer as ModelSlug,
					reviser: stored.reviser as ModelSlug,
					reviserEffort,
					reviserTemperature,
				},
			});
			completedRevisionIds.add(id);
		}
		reviseCount = revisionsById.size;
		console.log(
			`  ↩︎ Loaded ${reviseCount} revisions from state (${totalRevisions - reviseCount} pending)`,
		);
	}

	if (isPhaseCompleted(state, "revise") && reviseCount === totalRevisions) {
		console.log("  ↩︎ Revise phase already complete, skipping calls\n");
		return { revisionsById };
	}

	if (!state.revisions) {
		state.revisions = new Map<string, StoredRevisionResult>();
	}

	if (dryRun) {
		// Mock revisions
		for (const task of revisionTasks) {
			if (completedRevisionIds.has(task.id)) continue;

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
		const stateLock = new Semaphore(1);
		const revisePromises = revisionTasks
			.filter((task) => !completedRevisionIds.has(task.id))
			.map(async (task) => {
				const selected = selectedByModel.get(task.generator);
				if (!selected) {
					throw new Error(
						`Missing original statblock for generator ${task.generator} during revise phase`,
					);
				}
				const originalStatblock = selected.text;
				const review = reviewMap.get(`${task.generator}::${task.reviewer}`);
				if (!review) {
					throw new Error(
						`Missing review for revision task: generator=${task.generator}, reviewer=${task.reviewer}`,
					);
				}
				const feedback = `## Feedback:\n${review.text}`;
				const result = await reviseStatblock(
					task.reviser,
					originalStatblock,
					feedback,
					task.reviserEffort,
					task.reviserTemperature,
					reviserConfig.prompts,
				);

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

				await stateLock.acquire();
				try {
					if (completedRevisionIds.has(task.id)) return;
					revisionsById.set(task.id, { result, task });
					completedRevisionIds.add(task.id);
					reviseCount++;
					state.revisions?.set(task.id, {
						id: task.id,
						text: result.text,
						generator: task.generator,
						reviewer: task.reviewer,
						reviser: task.reviser,
						reviserEffort: task.reviserEffort,
						reviserTemperature: task.reviserTemperature,
					});
					saveState(runDir, state);
				} finally {
					stateLock.release();
				}

				console.log(`  ✓ ${task.id} (${reviseCount}/${totalRevisions})`);
				return { task, result };
			});
		await Promise.all(revisePromises);
	}

	console.log(
		`  ✓ ${dryRun ? "Mock revisions generated" : `Wrote ${totalRevisions} revisions to ${revisionsDir}`}\n`,
	);

	// Save state
	if (!dryRun) {
		state.revisions = new Map(
			Array.from(revisionsById.entries()).map(([id, entry]) => [
				id,
				{
					id,
					text: entry.result.text,
					generator: entry.task.generator,
					reviewer: entry.task.reviewer,
					reviser: entry.task.reviser,
					reviserEffort: entry.task.reviserEffort,
					reviserTemperature: entry.task.reviserTemperature,
				},
			]),
		) as Map<string, StoredRevisionResult>;
		markPhaseCompleted(state, "revise");
		saveState(runDir, state);
	}

	return { revisionsById };
}
