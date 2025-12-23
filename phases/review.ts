import { writeFile } from "fs/promises";
import { join } from "path";
import {
	type GenerateResult,
	type ModelName,
	type ReviewResult,
	reviewStatblock,
} from "../aiClient";
import { getConfig } from "../config";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredReviewResult,
	saveState,
} from "../state";
import { createMockReview } from "../utils";

// ============================================================================
// Review Phase
// ============================================================================

export interface ReviewPhaseResult {
	reviews: ReviewResult[];
}

/**
 * Phase 3: Cross-review statblocks.
 * Each model reviews ALL models' selected drafts (including self-review).
 */
export async function runReviewPhase(
	runDir: string,
	reviewsDir: string,
	state: PipelineState,
	selectedByModel: Map<ModelName, GenerateResult>,
	dryRun: boolean,
	isResuming: boolean,
): Promise<ReviewPhaseResult> {
	const config = getConfig();
	const MODEL_NAMES = Object.keys(config.models) as ModelName[];

	console.log(
		"Phase 3/6: Cross-reviewing statblocks (including self-review)...",
	);

	const reviews: ReviewResult[] = [];
	let reviewCount = 0;
	const totalReviews = MODEL_NAMES.length * MODEL_NAMES.length;

	// Resume from state if available
	const resumeReviews =
		isResuming && isPhaseCompleted(state, "review") && state.reviews;

	if (resumeReviews) {
		reviews.push(...(state.reviews as StoredReviewResult[]));
		console.log(
			`  ↩︎ Loaded ${reviews.length} cached reviews from state (skipping review calls)\n`,
		);
		return { reviews };
	}

	if (dryRun) {
		// Mock reviews
		for (const reviewer of MODEL_NAMES) {
			for (const reviewed of MODEL_NAMES) {
				const review: ReviewResult = {
					text: createMockReview(),
					reviewer,
					reviewed,
				};
				reviews.push(review);
				reviewCount++;
				const selfTag = reviewer === reviewed ? " (self)" : "";
				console.log(
					`  ✓ ${reviewer} reviewed ${reviewed}'s statblock${selfTag} (mock) (${reviewCount}/${totalReviews})`,
				);
			}
		}
	} else {
		// Real API calls
		const reviewPromises: Promise<void>[] = [];
		for (const reviewer of MODEL_NAMES) {
			for (const reviewed of MODEL_NAMES) {
				const statblock = selectedByModel.get(reviewed)!.text;
				reviewPromises.push(
					(async () => {
						const review = await reviewStatblock(reviewer, reviewed, statblock);
						reviews.push(review);
						reviewCount++;
						const selfTag =
							review.reviewer === review.reviewed ? " (self)" : "";
						console.log(
							`  ✓ ${review.reviewer} reviewed ${review.reviewed}'s statblock${selfTag} (${reviewCount}/${totalReviews})`,
						);
						// Write immediately
						const path = join(
							reviewsDir,
							`${review.reviewer}_reviews_${review.reviewed}.md`,
						);
						await writeFile(
							path,
							`# ${review.reviewer} reviews ${review.reviewed}\n\n${review.text}`,
							"utf-8",
						);
					})(),
				);
			}
		}
		await Promise.all(reviewPromises);
	}

	console.log(
		`  ✓ ${dryRun ? "Mock reviews generated" : `Wrote reviews to ${reviewsDir}`}\n`,
	);

	// Save state
	if (!dryRun && !resumeReviews) {
		state.reviews = reviews as StoredReviewResult[];
		markPhaseCompleted(state, "review");
		saveState(runDir, state);
	}

	return { reviews };
}
