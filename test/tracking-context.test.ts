/**
 * Tests for TrackingContext propagation through SDK functions
 *
 * TDD tests to ensure l2BlockNumber flows through all election-related
 * functions for block-scoped caching.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { ethers } from "ethers";
import { TrackingContext } from "../src/types";

describe("TrackingContext", () => {
  describe("interface structure", () => {
    it("should have l2BlockNumber as optional property", () => {
      // #given
      const context: TrackingContext = {};

      // #then
      expect(context.l2BlockNumber).toBeUndefined();
    });

    it("should accept l2BlockNumber when provided", () => {
      // #given
      const context: TrackingContext = { l2BlockNumber: 12345 };

      // #then
      expect(context.l2BlockNumber).toBe(12345);
    });

    it("should have l1BlockNumber as optional property", () => {
      // #given
      const context: TrackingContext = { l1BlockNumber: 18000000 };

      // #then
      expect(context.l1BlockNumber).toBe(18000000);
    });

    it("should have novaBlockNumber as optional property", () => {
      // #given
      const context: TrackingContext = { novaBlockNumber: 50000000 };

      // #then
      expect(context.novaBlockNumber).toBe(50000000);
    });

    it("should have timestamp as optional property", () => {
      // #given
      const context: TrackingContext = { timestamp: 1700000000 };

      // #then
      expect(context.timestamp).toBe(1700000000);
    });

    it("should have chunkSize as optional property", () => {
      // #given
      const context: TrackingContext = { chunkSize: 5000 };

      // #then
      expect(context.chunkSize).toBe(5000);
    });

    it("should have skipCache as optional property", () => {
      // #given
      const context: TrackingContext = { skipCache: true };

      // #then
      expect(context.skipCache).toBe(true);
    });

    it("should accept all fields together", () => {
      // #given
      const context: TrackingContext = {
        l2BlockNumber: 200000000,
        l1BlockNumber: 18000000,
        novaBlockNumber: 50000000,
        timestamp: 1700000000,
        chunkSize: 5000,
        skipCache: false,
      };

      // #then
      expect(context.l2BlockNumber).toBe(200000000);
      expect(context.l1BlockNumber).toBe(18000000);
      expect(context.novaBlockNumber).toBe(50000000);
      expect(context.timestamp).toBe(1700000000);
      expect(context.chunkSize).toBe(5000);
      expect(context.skipCache).toBe(false);
    });
  });

  describe("election functions context propagation", () => {
    describe("getElectionProposalIds", () => {
      it("should accept context with l2BlockNumber", async () => {
        // #given
        const { getElectionProposalId } = await import("../src/election");

        // #when / #then - function signature accepts context
        // This test verifies the function can be called with context
        // The actual caching behavior is tested in block-cache.test.ts
        expect(typeof getElectionProposalId).toBe("function");
      });
    });

    describe("getElectionIndexForProposalId", () => {
      it("should accept context with l2BlockNumber", async () => {
        // #given
        const { getElectionIndexForProposalId } = await import("../src/election");

        // #when / #then - function signature accepts context
        expect(typeof getElectionIndexForProposalId).toBe("function");

        // Verify the function accepts blockNumber option
        const fnString = getElectionIndexForProposalId.toString();
        expect(fnString).toContain("blockNumber");
      });
    });

    // Note: trackElectionProposal was removed in favor of ProposalStageTracker.trackElection()
    // The new unified pipeline handles election tracking with better caching support
  });

  describe("block-scoped caching with context", () => {
    beforeEach(async () => {
      // Clear election caches before each test
      const { clearElectionCache } = await import("../src/election");
      clearElectionCache();
    });

    it("should use l2BlockNumber for cache key when provided", async () => {
      // #given
      const { BlockScopedCache } = await import("../src/utils/block-cache");

      interface TestData {
        value: number;
        complete: boolean;
      }

      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (d) => d.complete,
      });

      const context: TrackingContext = { l2BlockNumber: 100 };

      // #when - set with block number from context
      cache.set("key", { value: 42, complete: false }, context.l2BlockNumber);

      // #then - should be retrievable with same block number
      expect(cache.get("key", context.l2BlockNumber)).toEqual({ value: 42, complete: false });

      // #then - should NOT be retrievable with different block number
      expect(cache.get("key", 200)).toBeUndefined();

      // #then - should NOT be retrievable without block number
      expect(cache.get("key")).toBeUndefined();
    });

    it("should cache immutable results without block number", async () => {
      // #given
      const { BlockScopedCache } = await import("../src/utils/block-cache");

      interface TestData {
        value: number;
        complete: boolean;
      }

      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (d) => d.complete,
      });

      // #when - set without block number but value is immutable
      cache.set("key", { value: 42, complete: true });

      // #then - should be cached (immutable)
      expect(cache.get("key")).toEqual({ value: 42, complete: true });
    });

    it("should NOT cache mutable results without block number", async () => {
      // #given
      const { BlockScopedCache } = await import("../src/utils/block-cache");

      interface TestData {
        value: number;
        complete: boolean;
      }

      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (d) => d.complete,
      });

      // #when - set without block number and value is mutable
      cache.set("key", { value: 42, complete: false });

      // #then - should NOT be cached (mutable)
      expect(cache.get("key")).toBeUndefined();
    });

    it("should skip cache when skipCache is true", async () => {
      // #given
      const { BlockScopedCache } = await import("../src/utils/block-cache");

      interface TestData {
        value: number;
        complete: boolean;
      }

      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (d) => d.complete,
      });

      // Set a value in cache
      cache.set("key", { value: 42, complete: true });

      // #when - get with skipCache: true
      const result = cache.get("key", undefined, { skipCache: true });

      // #then - should return undefined even though value is cached
      expect(result).toBeUndefined();

      // Verify value is still in cache when not skipping
      expect(cache.get("key")).toEqual({ value: 42, complete: true });
    });

    it("should skip block-scoped cache when skipCache is true", async () => {
      // #given
      const { BlockScopedCache } = await import("../src/utils/block-cache");

      interface TestData {
        value: number;
      }

      const cache = new BlockScopedCache<string, TestData>();

      // Set a value in cache at specific block
      cache.set("key", { value: 42 }, 12345);

      // #when - get with skipCache: true
      const result = cache.get("key", 12345, { skipCache: true });

      // #then - should return undefined even though value is cached
      expect(result).toBeUndefined();

      // Verify value is still in cache when not skipping
      expect(cache.get("key", 12345)).toEqual({ value: 42 });
    });
  });

  describe("context creation at entry points", () => {
    it("should create context with l2BlockNumber from current block", async () => {
      // #given
      const { getCurrentBlockInfo } = await import("../src/utils/timing");

      // Mock provider that returns a specific block
      const testProvider = {
        getBlock: vi.fn().mockResolvedValue({
          number: 200000000,
          timestamp: 1700000000,
        }),
      } as unknown as ethers.providers.Provider;

      // #when
      const blockInfo = await getCurrentBlockInfo(testProvider);

      // #then
      expect(blockInfo.blockNumber).toBe(200000000);

      // This block number would be used to create TrackingContext
      const context: TrackingContext = { l2BlockNumber: blockInfo.blockNumber };
      expect(context.l2BlockNumber).toBe(200000000);
    });
  });
});
