import { writeFile } from "fs/promises";
import { join } from "path";
import {
	type GenerateResult,
	generateStatblock,
	type ModelName,
} from "../aiClient";
import { getConfig } from "../config";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredGenerateResult,
	saveState,
} from "../state";
import { createMockStatblock } from "../utils";

// ============================================================================
// Generate Phase
// ============================================================================

export interface GeneratePhaseResult {
	/** All drafts by model (multiple if initialGenerations > 1) */
	draftsByModel: Map<ModelName, GenerateResult[]>;
}

/**
 * Phase 1: Generate initial statblocks from all models.
 * Each model generates `initialGenerations` drafts in parallel.
 */
export async function runGeneratePhase(
	runDir: string,
	state: PipelineState,
	dryRun: boolean,
	isResuming: boolean,
): Promise<GeneratePhaseResult> {
	const config = getConfig();
	const MODEL_NAMES = Object.keys(config.models) as ModelName[];
	const INITIAL_GENERATIONS = config.tournament.initialGenerations;

	console.log("Phase 1/6: Generating statblocks from all models...");

	const draftsByModel = new Map<ModelName, GenerateResult[]>();
	let generateCount = 0;
	const totalGenerations = MODEL_NAMES.length * INITIAL_GENERATIONS;

	// Resume from state if available
	if (
		isResuming &&
		isPhaseCompleted(state, "generate") &&
		state.generatedDrafts
	) {
		for (const [model, drafts] of state.generatedDrafts as Map<
			ModelName,
			StoredGenerateResult[]
		>) {
			draftsByModel.set(model, drafts as GenerateResult[]);
		}
		console.log(
			`  ↩︎ Loaded ${draftsByModel.size} generated draft sets from state (skipping generation)\n`,
		);
		return { draftsByModel };
	}

	if (dryRun) {
		// Mock data for dry run
		for (const model of MODEL_NAMES) {
			const drafts: GenerateResult[] = [];
			for (let i = 0; i < INITIAL_GENERATIONS; i++) {
				const result: GenerateResult = {
					text: createMockStatblock(`${model}-${i + 1}`),
					model,
				};
				drafts.push(result);
				generateCount++;
				console.log(
					`  ✓ ${model} draft ${i + 1} generated (mock) (${generateCount}/${totalGenerations})`,
				);
			}
			draftsByModel.set(model, drafts);
		}
	} else {
		// Real API calls with immediate writes
		const generatePromises = MODEL_NAMES.map(async (model) => {
			const drafts: GenerateResult[] = [];
			for (let i = 0; i < INITIAL_GENERATIONS; i++) {
				const result = await generateStatblock(model);
				drafts.push(result);
				generateCount++;
				console.log(
					`  ✓ ${result.model} draft ${i + 1} generated (${generateCount}/${totalGenerations})`,
				);
				// Write immediately
				const path = join(runDir, `${result.model}_original_${i + 1}.md`);
				await writeFile(
					path,
					`# Original Statblock (${result.model} draft ${i + 1})\n\n${result.text}`,
					"utf-8",
				);
			}
			draftsByModel.set(model, drafts);
			return drafts;
		});
		await Promise.all(generatePromises);
		console.log(`  ✓ Wrote originals to ${runDir}\n`);
	}

	if (!isResuming) {
		console.log(
			`  ✓ ${dryRun ? "Mock data generated" : `Wrote originals to ${runDir}`}\n`,
		);
	}

	// Save state
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
