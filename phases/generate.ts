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

	// Resume from state if available
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

	if (dryRun) {
		// Mock data for dry run
		for (const generator of generators) {
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
		// Real API calls with immediate writes
		const generatePromises = generators.map(async (generator) => {
			const drafts: GenerateResult[] = [];
			const shortName = getShortModelName(generator.model);
			for (let i = 0; i < INITIAL_GENERATIONS; i++) {
				const result = await generateStatblock(
					generator.model,
					generator.effort ?? "high",
					generator.temperature,
				);
				drafts.push(result);
				generateCount++;
				console.log(
					`  ✓ ${shortName} draft ${i + 1} generated (${generateCount}/${totalGenerations})`,
				);
				// Write immediately
				const safeFileName = shortName.replace(/[^a-zA-Z0-9-_]/g, "_");
				const path = join(runDir, `${safeFileName}_original_${i + 1}.md`);
				await writeFile(
					path,
					`# Original Statblock (${shortName} draft ${i + 1})\n\n${result.text}`,
					"utf-8",
				);
			}
			draftsByModel.set(generator.model, drafts);
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
