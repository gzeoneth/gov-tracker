/**
 * Tests for the concurrency limiter utility
 *
 * Verifies that the pLimit implementation correctly limits concurrent operations.
 */

import { describe, it, expect } from "vitest";
import { pLimit, Limiter } from "../src/cli/lib/concurrency";

describe("pLimit", () => {
  it("should execute a single function and return its result", async () => {
    // #given
    const limit = pLimit(1);

    // #when
    const result = await limit(() => 42);

    // #then
    expect(result).toBe(42);
  });

  it("should execute async functions and return their results", async () => {
    // #given
    const limit = pLimit(1);

    // #when
    const result = await limit(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "async result";
    });

    // #then
    expect(result).toBe("async result");
  });

  it("should limit concurrency to specified value", async () => {
    // #given
    const limit = pLimit(2);
    const running: number[] = [];
    const maxConcurrent = { value: 0 };

    const task = (id: number) => async () => {
      running.push(id);
      maxConcurrent.value = Math.max(maxConcurrent.value, running.length);
      await new Promise((r) => setTimeout(r, 50));
      running.splice(running.indexOf(id), 1);
      return id;
    };

    // #when
    const results = await Promise.all([
      limit(task(1)),
      limit(task(2)),
      limit(task(3)),
      limit(task(4)),
    ]);

    // #then
    expect(maxConcurrent.value).toBe(2);
    expect(results).toEqual([1, 2, 3, 4]);
  });

  it("should process all items even with concurrency of 1", async () => {
    // #given
    const limit = pLimit(1);
    const order: number[] = [];

    // #when
    const results = await Promise.all([
      limit(async () => {
        order.push(1);
        return "a";
      }),
      limit(async () => {
        order.push(2);
        return "b";
      }),
      limit(async () => {
        order.push(3);
        return "c";
      }),
    ]);

    // #then
    expect(results).toEqual(["a", "b", "c"]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("should handle rejected promises correctly", async () => {
    // #given
    const limit = pLimit(2);

    // #when/then
    await expect(limit(() => Promise.reject(new Error("test error")))).rejects.toThrow(
      "test error"
    );
  });

  it("should continue processing after a rejection", async () => {
    // #given
    const limit = pLimit(1);

    // #when
    const results = await Promise.allSettled([
      limit(() => Promise.resolve("success1")),
      limit(() => Promise.reject(new Error("failure"))),
      limit(() => Promise.resolve("success2")),
    ]);

    // #then
    expect(results[0]).toEqual({ status: "fulfilled", value: "success1" });
    expect(results[1]).toEqual({
      status: "rejected",
      reason: expect.any(Error),
    });
    expect(results[2]).toEqual({ status: "fulfilled", value: "success2" });
  });

  it("should handle synchronous return values", async () => {
    // #given
    const limit = pLimit(1);

    // #when
    const result = await limit(() => "sync value");

    // #then
    expect(result).toBe("sync value");
  });

  it("should handle high concurrency correctly", async () => {
    // #given
    const limit = pLimit(10);
    const tasks = Array.from({ length: 20 }, (_, i) => i);

    // #when
    const results = await Promise.all(tasks.map((i) => limit(() => i * 2)));

    // #then
    expect(results).toEqual(tasks.map((i) => i * 2));
  });

  it("should preserve order of completion", async () => {
    // #given
    const limit = pLimit(3);
    const completionOrder: number[] = [];

    // Tasks with different durations
    const task = (id: number, delay: number) => async () => {
      await new Promise((r) => setTimeout(r, delay));
      completionOrder.push(id);
      return id;
    };

    // #when
    const results = await Promise.all([
      limit(task(1, 50)), // Slow
      limit(task(2, 10)), // Fast
      limit(task(3, 30)), // Medium
    ]);

    // #then
    // Promise.all preserves input order, not completion order
    expect(results).toEqual([1, 2, 3]);
    // But completion order is based on duration
    expect(completionOrder).toEqual([2, 3, 1]);
  });

  it("should immediately run tasks when under limit", async () => {
    // #given
    const limit = pLimit(5);
    const startTimes: number[] = [];
    const start = Date.now();

    // #when
    await Promise.all(
      [0, 1, 2].map(() =>
        limit(async () => {
          startTimes.push(Date.now() - start);
          await new Promise((r) => setTimeout(r, 10));
        })
      )
    );

    // #then - all should start nearly immediately (within 10ms of each other)
    const maxDiff = Math.max(...startTimes) - Math.min(...startTimes);
    expect(maxDiff).toBeLessThan(10);
  });

  it("should export Limiter type", () => {
    // #given
    const limit: Limiter = pLimit(1);

    // #when/then - type check passes if this compiles
    expect(typeof limit).toBe("function");
  });
});
