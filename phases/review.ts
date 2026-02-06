import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type GenerateResult,
	type ModelSlug,
	type ReviewResult,
	reviewStatblock,
} from "../aiClient";
import { getRoleEntries } from "../config";
import { Semaphore } from "../semaphore";
import {
	isPhaseCompleted,
	markPhaseCompleted,
	type PipelineState,
	type StoredReviewResult,
	saveState,
} from "../state";
import { createMockReview, getModelToken, getShortModelName } from "../utils";

// ============================================================================
// Review Phase
// ============================================================================

export interface ReviewPhaseResult {
	reviews: ReviewResult[];
}

function getReviewKey(reviewer: ModelSlug, reviewed: ModelSlug): string {
	return `${reviewer}::${reviewed}`;
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
	const completedReviewKeys = new Set<string>();

	// Load previously completed review tasks from state for partial resume.
	if (isResuming && state.reviews) {
		for (const stored of state.reviews as StoredReviewResult[]) {
			reviews.push(stored);
			completedReviewKeys.add(getReviewKey(stored.reviewer, stored.reviewed));
		}
		reviewCount = reviews.length;
		console.log(
			`  ↩︎ Loaded ${reviewCount} cached reviews from state (${totalReviews - reviewCount} pending)`,
		);
	}

	if (isPhaseCompleted(state, "review") && reviewCount === totalReviews) {
		console.log("  ↩︎ Review phase already complete, skipping calls\n");
		return { reviews };
	}

	if (!state.reviews) {
		state.reviews = [];
	}

	if (dryRun) {
		// Mock reviews
		for (const reviewer of reviewers) {
			const reviewerShort = getShortModelName(reviewer.model);
			for (const reviewedSlug of draftModels) {
				const taskKey = getReviewKey(reviewer.model, reviewedSlug);
				if (completedReviewKeys.has(taskKey)) continue;

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
		const stateLock = new Semaphore(1);
		const reviewPromises: Promise<void>[] = [];
		for (const reviewer of reviewers) {
			const reviewerShort = getShortModelName(reviewer.model);
			for (const reviewedSlug of draftModels) {
				const taskKey = getReviewKey(reviewer.model, reviewedSlug);
				if (completedReviewKeys.has(taskKey)) continue;

				const reviewedShort = getShortModelName(reviewedSlug);
				const selected = selectedByModel.get(reviewedSlug);
				if (!selected) {
					throw new Error(
						`Missing draft for model ${reviewedSlug} during review phase`,
					);
				}
				const statblock = selected.text;
				reviewPromises.push(
					(async () => {
						const review = await reviewStatblock(
							reviewer.model,
							reviewedSlug,
							statblock,
							reviewer.effort ?? "medium",
							reviewer.temperature,
						);

						// Write immediately
						const safeReviewer = getModelToken(reviewer.model);
						const safeReviewed = getModelToken(reviewedSlug);
						const path = join(
							reviewsDir,
							`${safeReviewer}_reviews_${safeReviewed}.md`,
						);
						await writeFile(
							path,
							`# ${reviewerShort} reviews ${reviewedShort}\n\n${review.text}`,
							"utf-8",
						);

						await stateLock.acquire();
						try {
							if (completedReviewKeys.has(taskKey)) {
								return;
							}
							reviews.push(review);
							completedReviewKeys.add(taskKey);
							reviewCount++;
							state.reviews?.push(review as StoredReviewResult);
							saveState(runDir, state);
						} finally {
							stateLock.release();
						}

						const selfTag =
							review.reviewer === review.reviewed ? " (self)" : "";
						console.log(
							`  ✓ ${reviewerShort} reviewed ${reviewedShort}'s statblock${selfTag} (${reviewCount}/${totalReviews})`,
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
	if (!dryRun) {
		state.reviews = reviews as StoredReviewResult[];
		markPhaseCompleted(state, "review");
		saveState(runDir, state);
	}

	return { reviews };
}
