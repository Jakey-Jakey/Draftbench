import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type GenerateResult,
	generateStatblock,
	type ModelSlug,
} from "../aiClient";
import { getConfig, getRoleEntries } from "../config";
import { Semaphore } from "../semaphore";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredGenerateResult,
	saveState,
} from "../state";
import {
	createMockStatblock,
	getModelToken,
	getShortModelName,
} from "../utils";

// ============================================================================
// Generate Phase
// ============================================================================

export interface GeneratePhaseResult {
	/** All drafts by model slug (multiple if initialGenerations > 1) */
	draftsByModel: Map<ModelSlug, GenerateResult[]>;
}

/**
 * Generate initial statblocks from all configured generator models and group the resulting drafts by model.
 *
 * Runs generation for each generator producing the configured number of drafts per model. When `dryRun` is true, produces mock drafts instead of calling the API. When `isResuming` and prior state indicates completion or partial progress, restores generated drafts from state and skips or resumes work accordingly. For non-dry runs, originals are written to `runDir` and state is saved after each model completes to enable granular resumability.
 *
 * @param runDir - Directory where original draft files and state snapshots will be written
 * @param state - Pipeline state object that will be read from and updated to record generated drafts and completed generators
 * @param dryRun - If true, generate mock drafts without making external API calls
 * @param isResuming - If true, attempt to restore progress from `state` and avoid re-generating already completed work
 * @returns A mapping of model slug to its array of generated drafts
 */
export async function runGeneratePhase(
	runDir: string,
	state: PipelineState,
	dryRun: boolean,
	isResuming: boolean,
): Promise<GeneratePhaseResult> {
	const config = getConfig();
	const generators = getRoleEntries("generators");
	const INITIAL_GENERATIONS = config.tournament.initialGenerations;

	console.log("Phase 1/6: Generating statblocks from all models...");

	const draftsByModel = new Map<ModelSlug, GenerateResult[]>();
	let generateCount = 0;
	const totalGenerations = generators.length * INITIAL_GENERATIONS;

	// Resume from state if phase fully completed
	if (
		isResuming &&
		isPhaseCompleted(state, "generate") &&
		state.generatedDrafts
	) {
		for (const [model, drafts] of state.generatedDrafts as Map<
			ModelSlug,
			StoredGenerateResult[]
		>) {
			draftsByModel.set(model, drafts as GenerateResult[]);
		}
		console.log(
			`  ↩︎ Loaded ${draftsByModel.size} generated draft sets from state (skipping generation)\n`,
		);
		return { draftsByModel };
	}

	// Load partially completed models from state (for granular resume)
	const completedGenerators = new Set(state.completedGenerators ?? []);
	if (isResuming && state.generatedDrafts) {
		for (const [model, drafts] of state.generatedDrafts as Map<
			ModelSlug,
			StoredGenerateResult[]
		>) {
			if (completedGenerators.has(model)) {
				draftsByModel.set(model, drafts as GenerateResult[]);
				generateCount += drafts.length;
				console.log(
					`  ↩︎ Loaded ${drafts.length} drafts for ${getShortModelName(model)} from state`,
				);
			}
		}
	}

	// Initialize generatedDrafts map if not already set
	if (!state.generatedDrafts) {
		state.generatedDrafts = new Map<string, StoredGenerateResult[]>();
	}

	// Initialize completedGenerators array if not already set
	if (!state.completedGenerators) {
		state.completedGenerators = [];
	}

	if (dryRun) {
		// Mock data for dry run
		for (const generator of generators) {
			if (completedGenerators.has(generator.model)) continue;

			const drafts: GenerateResult[] = [];
			const shortName = getShortModelName(generator.model);
			for (let i = 0; i < INITIAL_GENERATIONS; i++) {
				const result: GenerateResult = {
					text: createMockStatblock(`${shortName}-${i + 1}`),
					model: generator.model,
				};
				drafts.push(result);
				generateCount++;
				console.log(
					`  ✓ ${shortName} draft ${i + 1} generated (mock) (${generateCount}/${totalGenerations})`,
				);
			}
			draftsByModel.set(generator.model, drafts);
		}
	} else {
		// Real API calls - models run in parallel.
		// Save state after each model completes for granular resumability.
		const pendingGenerators = generators.filter(
			(g) => !completedGenerators.has(g.model),
		);

		const stateLock = new Semaphore(1);

		await Promise.all(
			pendingGenerators.map(async (generator) => {
				const shortName = getShortModelName(generator.model);
				const drafts = await Promise.all(
					Array.from({ length: INITIAL_GENERATIONS }, async (_, draftIndex) => {
						const result = await generateStatblock(
							generator.model,
							generator.effort ?? "high",
							generator.temperature,
						);

						// Write immediately
						const safeFileName = getModelToken(generator.model);
						const path = join(
							runDir,
							`${safeFileName}_original_${draftIndex + 1}.md`,
						);
						await writeFile(
							path,
							`# Original Statblock (${shortName} draft ${draftIndex + 1})\n\n${result.text}`,
							"utf-8",
						);

						await stateLock.acquire();
						try {
							generateCount++;
							console.log(
								`  ✓ ${shortName} draft ${draftIndex + 1} generated (${generateCount}/${totalGenerations})`,
							);
						} finally {
							stateLock.release();
						}

						return result;
					}),
				);

				await stateLock.acquire();
				try {
					if (!state.generatedDrafts) {
						state.generatedDrafts = new Map<string, StoredGenerateResult[]>();
					}
					if (!state.completedGenerators) {
						state.completedGenerators = [];
					}

					draftsByModel.set(generator.model, drafts);
					state.generatedDrafts.set(
						generator.model,
						drafts as StoredGenerateResult[],
					);
					if (!state.completedGenerators.includes(generator.model)) {
						state.completedGenerators.push(generator.model);
					}
					saveState(runDir, state);
					console.log(`  💾 State saved after ${shortName}`);
				} finally {
					stateLock.release();
				}
			}),
		);

		console.log(`  ✓ Wrote originals to ${runDir}\n`);
	}

	if (!isResuming) {
		console.log(
			`  ✓ ${dryRun ? "Mock data generated" : `Wrote originals to ${runDir}`}\n`,
		);
	}

	// Mark phase completed
	if (!dryRun) {
		state.generatedDrafts = draftsByModel as Map<
			string,
			StoredGenerateResult[]
		>;
		markPhaseCompleted(state, "generate");
		saveState(runDir, state);
	}

	return { draftsByModel };
}