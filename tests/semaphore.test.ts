import { beforeEach, describe, expect, test } from "bun:test";
import {
	initConcurrencyLimiter,
	Semaphore,
	withConcurrencyLimit,
} from "../semaphore";

describe("Semaphore", () => {
	describe("basic acquire/release", () => {
		test("acquires permit immediately when available", async () => {
			const sem = new Semaphore(2);
			const start = Date.now();
			await sem.acquire();
			const elapsed = Date.now() - start;
			expect(elapsed).toBeLessThan(10); // Should be immediate
			sem.release();
		});

		test("blocks when no permits available", async () => {
			const sem = new Semaphore(1);
			await sem.acquire(); // Takes the only permit

			let acquired = false;
			const promise = sem.acquire().then(() => {
				acquired = true;
			});

			// Wait a bit - should not have acquired
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(acquired).toBe(false);

			// Release and it should acquire
			sem.release();
			await promise;
			expect(acquired).toBe(true);
		});

		test("handles multiple waiting acquires in order", async () => {
			const sem = new Semaphore(1);
			const order: number[] = [];

			await sem.acquire(); // Take the permit

			// Queue up 3 acquires
			const p1 = sem.acquire().then(() => {
				order.push(1);
				sem.release();
			});
			const p2 = sem.acquire().then(() => {
				order.push(2);
				sem.release();
			});
			const p3 = sem.acquire().then(() => {
				order.push(3);
				sem.release();
			});

			// Release the initial permit
			sem.release();

			// Wait for all to complete
			await Promise.all([p1, p2, p3]);

			// Should execute in order
			expect(order).toEqual([1, 2, 3]);
		});
	});

	describe("multiple permits", () => {
		test("allows concurrent access up to permit limit", async () => {
			const sem = new Semaphore(3);
			const active: number[] = [];

			const task = async (id: number) => {
				await sem.acquire();
				active.push(id);
				await new Promise((resolve) => setTimeout(resolve, 50));
				active.splice(active.indexOf(id), 1);
				sem.release();
			};

			const promises = [task(1), task(2), task(3), task(4), task(5)];

			// Check after a brief delay that we have 3 active
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(active.length).toBe(3);

			await Promise.all(promises);
			expect(active.length).toBe(0); // All done
		});

		test("zero permits blocks all acquires", async () => {
			const sem = new Semaphore(0);
			let acquired = false;

			const promise = sem.acquire().then(() => {
				acquired = true;
			});

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(acquired).toBe(false);

			sem.release(); // Add a permit
			await promise;
			expect(acquired).toBe(true);
		});

		test("large number of permits", async () => {
			const sem = new Semaphore(100);
			const promises: Promise<void>[] = [];

			for (let i = 0; i < 100; i++) {
				promises.push(
					sem.acquire().then(() => {
						sem.release();
					}),
				);
			}

			await Promise.all(promises);
			// All should complete without blocking
		});
	});

	describe("edge cases", () => {
		test("release without acquire increases permits", () => {
			const sem = new Semaphore(1);
			sem.release(); // Now has 2 permits

			// Should be able to acquire twice without blocking
			return Promise.all([sem.acquire(), sem.acquire()]);
		});

		test("multiple releases queue up", () => {
			const sem = new Semaphore(0);
			sem.release();
			sem.release();
			sem.release();

			// Should be able to acquire 3 times immediately
			return Promise.all([sem.acquire(), sem.acquire(), sem.acquire()]);
		});

		test("interleaved acquire/release", async () => {
			const sem = new Semaphore(1);
			const results: string[] = [];

			const task1 = async () => {
				await sem.acquire();
				results.push("task1-start");
				await new Promise((resolve) => setTimeout(resolve, 20));
				results.push("task1-end");
				sem.release();
			};

			const task2 = async () => {
				await sem.acquire();
				results.push("task2-start");
				await new Promise((resolve) => setTimeout(resolve, 20));
				results.push("task2-end");
				sem.release();
			};

			await Promise.all([task1(), task2()]);

			// Should see complete execution of one task before the other
			expect(results).toHaveLength(4);
			const task1Index = results.indexOf("task1-start");
			const task1EndIndex = results.indexOf("task1-end");
			const task2Index = results.indexOf("task2-start");
			const task2EndIndex = results.indexOf("task2-end");

			// One task should complete before the other starts
			if (task1Index < task2Index) {
				expect(task1EndIndex).toBeLessThan(task2Index);
			} else {
				expect(task2EndIndex).toBeLessThan(task1Index);
			}
		});
	});
});

describe("Global Concurrency Limiter", () => {
	describe("initConcurrencyLimiter", () => {
		test("sets up limiter with valid maxParallel", () => {
			// This function logs to console, so we can't easily assert on internal state
			// But we can test it doesn't throw
			expect(() => initConcurrencyLimiter(5)).not.toThrow();
		});

		test("disables limiter with null", () => {
			expect(() => initConcurrencyLimiter(null)).not.toThrow();
		});

		test("disables limiter with undefined", () => {
			expect(() => initConcurrencyLimiter(undefined)).not.toThrow();
		});

		test("disables limiter with 0", () => {
			expect(() => initConcurrencyLimiter(0)).not.toThrow();
		});

		test("disables limiter with negative", () => {
			expect(() => initConcurrencyLimiter(-1)).not.toThrow();
		});
	});

	describe("withConcurrencyLimit", () => {
		test("executes function when no limiter set", async () => {
			initConcurrencyLimiter(null);
			let executed = false;
			await withConcurrencyLimit(async () => {
				executed = true;
			});
			expect(executed).toBe(true);
		});

		test("executes function when limiter is set", async () => {
			initConcurrencyLimiter(2);
			let executed = false;
			await withConcurrencyLimit(async () => {
				executed = true;
			});
			expect(executed).toBe(true);
		});

		test("returns function result", async () => {
			initConcurrencyLimiter(null);
			const result = await withConcurrencyLimit(async () => {
				return 42;
			});
			expect(result).toBe(42);
		});

		test("propagates function errors", async () => {
			initConcurrencyLimiter(null);
			await expect(
				withConcurrencyLimit(async () => {
					throw new Error("test error");
				}),
			).rejects.toThrow("test error");
		});

		test("limits concurrent executions", async () => {
			initConcurrencyLimiter(2);
			let active = 0;
			let maxActive = 0;

			const task = async () => {
				return withConcurrencyLimit(async () => {
					active++;
					maxActive = Math.max(maxActive, active);
					await new Promise((resolve) => setTimeout(resolve, 50));
					active--;
				});
			};

			await Promise.all([task(), task(), task(), task(), task()]);

			expect(maxActive).toBeLessThanOrEqual(2);
		});

		test("handles many concurrent calls", async () => {
			initConcurrencyLimiter(5);
			const tasks = Array.from({ length: 20 }, (_, i) =>
				withConcurrencyLimit(async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					return i;
				}),
			);

			const results = await Promise.all(tasks);
			expect(results).toHaveLength(20);
			expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
		});

		test("releases permit even on error", async () => {
			initConcurrencyLimiter(1);

			// First call throws
			try {
				await withConcurrencyLimit(async () => {
					throw new Error("fail");
				});
			} catch (e) {
				// Expected
			}

			// Second call should still work (permit was released)
			let executed = false;
			await withConcurrencyLimit(async () => {
				executed = true;
			});
			expect(executed).toBe(true);
		});
	});

	describe("integration scenarios", () => {
		test("unlimited concurrency (null limiter)", async () => {
			initConcurrencyLimiter(null);
			const start = Date.now();
			const tasks = Array.from({ length: 10 }, () =>
				withConcurrencyLimit(
					async () => new Promise((resolve) => setTimeout(resolve, 50)),
				),
			);
			await Promise.all(tasks);
			const elapsed = Date.now() - start;
			// Should all run in parallel, so ~50ms not 500ms
			expect(elapsed).toBeLessThan(150);
		});

		test("limited concurrency enforces sequential batches", async () => {
			initConcurrencyLimiter(2);
			const start = Date.now();
			const tasks = Array.from({ length: 6 }, () =>
				withConcurrencyLimit(
					async () => new Promise((resolve) => setTimeout(resolve, 50)),
				),
			);
			await Promise.all(tasks);
			const elapsed = Date.now() - start;
			// 6 tasks, 2 at a time, 50ms each = ~150ms (3 batches)
			expect(elapsed).toBeGreaterThan(120);
			expect(elapsed).toBeLessThan(250);
		});
	});
});