/**
 * Tests for BlockScopedCache utility
 */

import { describe, expect, it, beforeEach } from "vitest";
import { BlockScopedCache } from "../src/utils/block-cache";

describe("BlockScopedCache", () => {
  describe("basic operations", () => {
    it("should return undefined for missing keys", () => {
      // #given
      const cache = new BlockScopedCache<string, number>();

      // #when
      const result = cache.get("missing");

      // #then
      expect(result).toBeUndefined();
    });

    it("should not cache values without blockNumber by default", () => {
      // #given
      const cache = new BlockScopedCache<string, number>();

      // #when
      cache.set("key", 42);
      const result = cache.get("key");

      // #then
      expect(result).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("should cache values when blockNumber is provided", () => {
      // #given
      const cache = new BlockScopedCache<string, number>();

      // #when
      cache.set("key", 42, 12345);
      const result = cache.get("key", 12345);

      // #then
      expect(result).toBe(42);
      expect(cache.size).toBe(1);
    });

    it("should scope cache entries by blockNumber", () => {
      // #given
      const cache = new BlockScopedCache<string, number>();

      // #when
      cache.set("key", 42, 100);
      cache.set("key", 99, 200);

      // #then
      expect(cache.get("key", 100)).toBe(42);
      expect(cache.get("key", 200)).toBe(99);
      expect(cache.get("key", 300)).toBeUndefined();
      expect(cache.size).toBe(2);
    });

    it("should clear all entries", () => {
      // #given
      const cache = new BlockScopedCache<string, number>();
      cache.set("a", 1, 100);
      cache.set("b", 2, 200);

      // #when
      cache.clear();

      // #then
      expect(cache.get("a", 100)).toBeUndefined();
      expect(cache.get("b", 200)).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("should check existence with has()", () => {
      // #given
      const cache = new BlockScopedCache<string, number>();
      cache.set("key", 42, 100);

      // #then
      expect(cache.has("key", 100)).toBe(true);
      expect(cache.has("key", 200)).toBe(false);
      expect(cache.has("missing", 100)).toBe(false);
    });
  });

  describe("isImmutable predicate", () => {
    interface TestData {
      value: number;
      isComplete: boolean;
    }

    it("should cache without blockNumber when isImmutable returns true", () => {
      // #given
      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (data) => data.isComplete,
      });

      // #when - set complete data without blockNumber
      cache.set("key", { value: 42, isComplete: true });
      const result = cache.get("key");

      // #then
      expect(result).toEqual({ value: 42, isComplete: true });
      expect(cache.size).toBe(1);
    });

    it("should not cache without blockNumber when isImmutable returns false", () => {
      // #given
      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (data) => data.isComplete,
      });

      // #when - set incomplete data without blockNumber
      cache.set("key", { value: 42, isComplete: false });
      const result = cache.get("key");

      // #then
      expect(result).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("should always cache when blockNumber is provided regardless of isImmutable", () => {
      // #given
      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (data) => data.isComplete,
      });

      // #when - set incomplete data WITH blockNumber
      cache.set("key", { value: 42, isComplete: false }, 12345);
      const result = cache.get("key", 12345);

      // #then - should still be cached because blockNumber makes it immutable
      expect(result).toEqual({ value: 42, isComplete: false });
      expect(cache.size).toBe(1);
    });

    it("should update cache when incomplete value becomes complete", () => {
      // #given
      const cache = new BlockScopedCache<string, TestData>({
        isImmutable: (data) => data.isComplete,
      });

      // #when - first set incomplete (not cached), then set complete (cached)
      cache.set("key", { value: 42, isComplete: false });
      expect(cache.get("key")).toBeUndefined();

      cache.set("key", { value: 42, isComplete: true });

      // #then
      expect(cache.get("key")).toEqual({ value: 42, isComplete: true });
    });
  });

  describe("numeric keys", () => {
    it("should work with numeric keys", () => {
      // #given
      const cache = new BlockScopedCache<number, string>();

      // #when
      cache.set(1, "one", 100);
      cache.set(2, "two", 100);

      // #then
      expect(cache.get(1, 100)).toBe("one");
      expect(cache.get(2, 100)).toBe("two");
    });
  });

  describe("election proposal IDs use case", () => {
    interface ElectionProposalIds {
      nomineeProposalId: string | null;
      memberProposalId: string | null;
    }

    let cache: BlockScopedCache<number, ElectionProposalIds>;

    beforeEach(() => {
      cache = new BlockScopedCache<number, ElectionProposalIds>({
        isImmutable: (result) => {
          // Immutable if: election doesn't exist, OR member election has been created
          return result.nomineeProposalId === null || result.memberProposalId !== null;
        },
      });
    });

    it("should cache when election does not exist", () => {
      // #given
      const noElection: ElectionProposalIds = {
        nomineeProposalId: null,
        memberProposalId: null,
      };

      // #when
      cache.set(5, noElection);

      // #then - should be cached (immutable: election doesn't exist)
      expect(cache.get(5)).toEqual(noElection);
    });

    it("should cache when member election exists", () => {
      // #given
      const completeElection: ElectionProposalIds = {
        nomineeProposalId: "123",
        memberProposalId: "456",
      };

      // #when
      cache.set(1, completeElection);

      // #then - should be cached (immutable: member election exists)
      expect(cache.get(1)).toEqual(completeElection);
    });

    it("should NOT cache when only nominee exists (member might be created)", () => {
      // #given
      const incompleteElection: ElectionProposalIds = {
        nomineeProposalId: "123",
        memberProposalId: null,
      };

      // #when
      cache.set(2, incompleteElection);

      // #then - should NOT be cached (mutable: member election might be created)
      expect(cache.get(2)).toBeUndefined();
    });

    it("should cache incomplete election at specific block", () => {
      // #given
      const incompleteElection: ElectionProposalIds = {
        nomineeProposalId: "123",
        memberProposalId: null,
      };

      // #when - with blockNumber, it's immutable historical state
      cache.set(2, incompleteElection, 12345);

      // #then
      expect(cache.get(2, 12345)).toEqual(incompleteElection);
      expect(cache.get(2)).toBeUndefined(); // but "latest" query returns nothing
    });

    it("should isolate cache entries by blockNumber", () => {
      // #given - same election at different blocks could have different states
      const atBlock100: ElectionProposalIds = {
        nomineeProposalId: "123",
        memberProposalId: null, // member not created yet
      };
      const atBlock200: ElectionProposalIds = {
        nomineeProposalId: "123",
        memberProposalId: "456", // member now exists
      };

      // #when
      cache.set(1, atBlock100, 100);
      cache.set(1, atBlock200, 200);

      // #then - each block has its own cached state
      expect(cache.get(1, 100)).toEqual(atBlock100);
      expect(cache.get(1, 200)).toEqual(atBlock200);
      expect(cache.size).toBe(2);
    });

    it("should use isImmutable for queries without blockNumber", () => {
      // #given
      const completeElection: ElectionProposalIds = {
        nomineeProposalId: "123",
        memberProposalId: "456",
      };

      // #when - set without blockNumber but value is immutable
      cache.set(3, completeElection);

      // #then - should be cached because isImmutable returns true
      expect(cache.get(3)).toEqual(completeElection);
      expect(cache.get(3, 999)).toBeUndefined(); // no block-scoped entry exists
    });
  });
});
