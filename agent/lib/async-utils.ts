/**
 * Async Utils - Async/Promise utilities
 *
 * Provides utilities for debouncing, batching, and orchestrating
 * async operations.
 */

// ─── Debouncing ───────────────────────────────────────────────────────────────

/**
 * Debounce a function call.
 * The function is only called after it stops being invoked for delayMs.
 * @param fn - Function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  delayMs: number
): (...args: Args) => void {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  return (...args: Args) => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      fn(...args);
      timeoutHandle = null;
    }, delayMs);
  };
}

/**
 * Debounce an async function call.
 * Returns a promise that resolves after the debounce delay.
 * @param fn - Async function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced async function
 */
export function debounceAsync<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  delayMs: number
): (...args: Args) => Promise<R> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let pendingPromise: Promise<R> | null = null;
  let resolve: ((value: R) => void) | null = null;
  let reject: ((error: Error) => void) | null = null;

  return (...args: Args) => {
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (!pendingPromise) {
      pendingPromise = new Promise<R>((res, rej) => {
        resolve = res;
        reject = rej;
      });
    }

    timeoutHandle = setTimeout(async () => {
      try {
        const result = await fn(...args);
        resolve?.(result);
        pendingPromise = null;
        resolve = null;
        reject = null;
      } catch (error) {
        reject?.(error instanceof Error ? error : new Error(String(error)));
        pendingPromise = null;
        resolve = null;
        reject = null;
      }
    }, delayMs);

    return pendingPromise;
  };
}

// ─── Batching ─────────────────────────────────────────────────────────────────

/**
 * Run multiple async operations in parallel and wait for all.
 * Equivalent to Promise.all but with labeled results.
 * @param operations - Record of label → Promise
 * @returns Promise of record with same labels and results
 */
export async function batchAsync<T extends Record<string, Promise<unknown>>>(
  operations: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const keys = Object.keys(operations) as (keyof T)[];
  const promises = keys.map((key) => operations[key]);
  const results = await Promise.all(promises);

  const out: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    out[keys[i] as string] = results[i];
  }
  return out as { [K in keyof T]: Awaited<T[K]> };
}

// ─── Retry ────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Retry an async operation with exponential backoff.
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Promise with result or final error
 */
export async function retry<R>(
  fn: () => Promise<R>,
  options: RetryOptions = {}
): Promise<R> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.delayMs ?? 100;
  const backoffMultiplier = options.backoffMultiplier ?? 2;

  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= backoffMultiplier;
      }
    }
  }

  throw lastError ?? new Error("Retry failed");
}

// ─── Timeout ──────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout.
 * @param promise - Promise to race
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutMessage - Error message if timeout occurs
 * @returns Promise that resolves or rejects (timeout)
 */
export function withTimeout<R>(
  promise: Promise<R>,
  timeoutMs: number,
  timeoutMessage: string = "Operation timed out"
): Promise<R> {
  return Promise.race([
    promise,
    new Promise<R>((_resolve, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ]);
}

// ─── Sequencing ───────────────────────────────────────────────────────────────

/**
 * Run async operations sequentially, returning all results.
 * Useful when you need to maintain execution order.
 * @param operations - Array of async functions
 * @returns Promise of array of results
 */
export async function sequenceAsync<R>(
  operations: Array<() => Promise<R>>
): Promise<R[]> {
  const results: R[] = [];
  for (const op of operations) {
    results.push(await op());
  }
  return results;
}

/**
 * Run async operations with a concurrency limit.
 * @param operations - Array of async functions
 * @param concurrency - Max concurrent operations
 * @returns Promise of array of results (order preserved)
 */
export async function poolAsync<R>(
  operations: Array<() => Promise<R>>,
  concurrency: number = 3
): Promise<R[]> {
  const results: R[] = new Array(operations.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < operations.length) {
      const idx = nextIndex++;
      results[idx] = await operations[idx]!();
    }
  };

  const workers = Array(Math.min(concurrency, operations.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}
