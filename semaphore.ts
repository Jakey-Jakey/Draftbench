/**
 * Simple async semaphore for limiting concurrent operations.
 */
export class Semaphore {
	private permits: number;
	private waiting: Array<() => void> = [];

	constructor(permits: number) {
		this.permits = permits;
	}

	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--;
			return;
		}

		return new Promise<void>((resolve) => {
			this.waiting.push(resolve);
		});
	}

	release(): void {
		const next = this.waiting.shift();
		if (next) {
			next();
		} else {
			this.permits++;
		}
	}
}

// Global semaphore instance, initialized lazily
let globalSemaphore: Semaphore | null = null;

/**
 * Initializes the global concurrency limiter.
 * @param maxParallel - Max concurrent operations. Null/undefined = unlimited.
 */
export function initConcurrencyLimiter(
	maxParallel: number | null | undefined,
): void {
	if (maxParallel && maxParallel > 0) {
		globalSemaphore = new Semaphore(maxParallel);
		console.log(`⚡ Concurrency limit set to ${maxParallel} parallel calls`);
	} else {
		globalSemaphore = null;
	}
}

/**
 * Wraps an async function with concurrency limiting.
 * If no limiter is configured, runs immediately.
 */
export async function withConcurrencyLimit<T>(
	fn: () => Promise<T>,
): Promise<T> {
	if (!globalSemaphore) {
		return fn();
	}

	await globalSemaphore.acquire();
	try {
		return await fn();
	} finally {
		globalSemaphore.release();
	}
}

/**
 * Resets the global semaphore (useful for testing).
 */
export function resetConcurrencyLimiter(): void {
	globalSemaphore = null;
}
