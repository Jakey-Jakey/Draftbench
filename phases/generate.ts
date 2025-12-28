import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type GenerateResult,
	generateStatblock,
	type ModelSlug,
} from "../aiClient";
import { getConfig, getRoleEntries } from "../config";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredGenerateResult,
	saveState,
} from "../state";
import { createMockStatblock, getShortModelName } from "../utils";

// ============================================================================
// Generate Phase
// ============================================================================

export interface GeneratePhaseResult {
	/** All drafts by model slug (multiple if initialGenerations > 1) */
	draftsByModel: Map<ModelSlug, GenerateResult[]>;
}

/**
 * Phase 1: Generate initial statblocks from all generator models.
 * Each model generates `initialGenerations` drafts in parallel.
 * State is saved after each model completes for granular resumability.
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
		// Real API calls - ALL drafts run in parallel
		// Build flat list of all generation tasks
		const pendingGenerators = generators.filter(
			(g) => !completedGenerators.has(g.model),
		);

		interface GenerationTask {
			generator: (typeof generators)[0];
			draftIndex: number;
		}

		const tasks: GenerationTask[] = [];
		for (const generator of pendingGenerators) {
			for (let i = 0; i < INITIAL_GENERATIONS; i++) {
				tasks.push({ generator, draftIndex: i });
			}
		}

		// Track results by model
		const resultsByModel = new Map<string, GenerateResult[]>();
		for (const generator of pendingGenerators) {
			resultsByModel.set(generator.model, []);
		}

		// Run all tasks in parallel
		const generatePromises = tasks.map(async ({ generator, draftIndex }) => {
			const shortName = getShortModelName(generator.model);
			const result = await generateStatblock(
				generator.model,
				generator.effort ?? "high",
				generator.temperature,
			);

			// Store result
			const modelResults = resultsByModel.get(generator.model)!;
			modelResults[draftIndex] = result;

			generateCount++;
			console.log(
				`  ✓ ${shortName} draft ${draftIndex + 1} generated (${generateCount}/${totalGenerations})`,
			);

			// Write immediately
			const safeFileName = shortName.replace(/[^a-zA-Z0-9-_]/g, "_");
			const path = join(
				runDir,
				`${safeFileName}_original_${draftIndex + 1}.md`,
			);
			await writeFile(
				path,
				`# Original Statblock (${shortName} draft ${draftIndex + 1})\n\n${result.text}`,
				"utf-8",
			);

			return { generator, draftIndex, result };
		});

		await Promise.all(generatePromises);

		// Populate draftsByModel and save state
		for (const generator of pendingGenerators) {
			const drafts = resultsByModel.get(generator.model)!;
			draftsByModel.set(generator.model, drafts);

			// Save state for this model
			state.generatedDrafts?.set(
				generator.model,
				drafts as StoredGenerateResult[],
			);
			state.completedGenerators.push(generator.model);
		}
		saveState(runDir, state);
		console.log(`  💾 State saved`);
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
