/**
 * Simple concurrency limiter
 *
 * Limits the number of concurrent async operations. This is a minimal
 * implementation that replaces the p-limit dependency.
 *
 * @param concurrency - Maximum number of concurrent operations
 * @returns A limiter function that wraps async operations
 *
 * @example
 * const limit = pLimit(2);
 * await Promise.all([
 *   limit(() => fetch(url1)),
 *   limit(() => fetch(url2)),
 *   limit(() => fetch(url3)), // waits for one of above to complete
 * ]);
 */
export type Limiter = <T>(fn: () => T | PromiseLike<T>) => Promise<T>;

export function pLimit(concurrency: number): Limiter {
  const queue: (() => void)[] = [];
  let active = 0;

  const next = () => {
    active--;
    const nextTask = queue.shift();
    if (nextTask) nextTask();
  };

  return <T>(fn: () => T | PromiseLike<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}
