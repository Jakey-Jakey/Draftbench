import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type GenerateResult,
	type ModelSlug,
	type ReviewResult,
	reviewStatblock,
} from "../aiClient";
import { getConfig, getRoleEntries } from "../config";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredReviewResult,
	saveState,
} from "../state";
import { createMockReview, getShortModelName } from "../utils";

// ============================================================================
// Review Phase
// ============================================================================

export interface ReviewPhaseResult {
	reviews: ReviewResult[];
}

/**
 * Phase 3: Cross-review statblocks.
 * Each reviewer reviews ALL generator models' selected drafts (including self-review if same model).
 */
export async function runReviewPhase(
	runDir: string,
	reviewsDir: string,
	state: PipelineState,
	selectedByModel: Map<ModelSlug, GenerateResult>,
	dryRun: boolean,
	isResuming: boolean,
): Promise<ReviewPhaseResult> {
	const reviewers = getRoleEntries("reviewers");
	const draftModels = Array.from(selectedByModel.keys());

	console.log(
		"Phase 3/6: Cross-reviewing statblocks (including self-review)...",
	);

	const reviews: ReviewResult[] = [];
	let reviewCount = 0;
	const totalReviews = reviewers.length * draftModels.length;

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
		for (const reviewer of reviewers) {
			const reviewerShort = getShortModelName(reviewer.model);
			for (const reviewedSlug of draftModels) {
				const reviewedShort = getShortModelName(reviewedSlug);
				const review: ReviewResult = {
					text: createMockReview(),
					reviewer: reviewer.model,
					reviewed: reviewedSlug,
				};
				reviews.push(review);
				reviewCount++;
				const selfTag = reviewer.model === reviewedSlug ? " (self)" : "";
				console.log(
					`  ✓ ${reviewerShort} reviewed ${reviewedShort}'s statblock${selfTag} (mock) (${reviewCount}/${totalReviews})`,
				);
			}
		}
	} else {
		// Real API calls
		const reviewPromises: Promise<void>[] = [];
		for (const reviewer of reviewers) {
			const reviewerShort = getShortModelName(reviewer.model);
			for (const reviewedSlug of draftModels) {
				const reviewedShort = getShortModelName(reviewedSlug);
				const statblock = selectedByModel.get(reviewedSlug)!.text;
				reviewPromises.push(
					(async () => {
						const review = await reviewStatblock(
							reviewer.model,
							reviewedSlug,
							statblock,
							reviewer.effort ?? "medium",
							reviewer.temperature,
						);
						reviews.push(review);
						reviewCount++;
						const selfTag =
							review.reviewer === review.reviewed ? " (self)" : "";
						console.log(
							`  ✓ ${reviewerShort} reviewed ${reviewedShort}'s statblock${selfTag} (${reviewCount}/${totalReviews})`,
						);
						// Write immediately
						const safeReviewer = reviewerShort.replace(/[^a-zA-Z0-9-_]/g, "_");
						const safeReviewed = reviewedShort.replace(/[^a-zA-Z0-9-_]/g, "_");
						const path = join(
							reviewsDir,
							`${safeReviewer}_reviews_${safeReviewed}.md`,
						);
						await writeFile(
							path,
							`# ${reviewerShort} reviews ${reviewedShort}\n\n${review.text}`,
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
