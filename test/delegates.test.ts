/**
 * Delegate Cache Module Tests
 *
 * Tests for cache helpers, validation, and query functions.
 * No RPC calls required.
 */

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  extractDelegates,
  getDelegateCacheStats,
  getTopDelegates,
  getDelegateRankInfo,
  filterDelegatesByMinPower,
  filterDelegatesByAddress,
  validateDelegateCache,
  getBundledDelegateCachePath,
  loadBundledDelegateCache,
} from "../src/delegates/cache";
import type { DelegateCache, DelegateInfo } from "../src/types/delegates";

function makeDelegate(address: string, votingPower: string, lastChangeBlock = 100): DelegateInfo {
  return {
    address: address.toLowerCase() as `0x${string}`,
    votingPower,
    lastChangeBlock,
  };
}

function makeCache(delegates: DelegateInfo[], overrides?: Partial<DelegateCache>): DelegateCache {
  let totalVotingPower = ethers.BigNumber.from(0);
  for (const d of delegates) {
    totalVotingPower = totalVotingPower.add(d.votingPower);
  }

  return {
    version: 1,
    generatedAt: "2026-03-17T00:00:00.000Z",
    snapshotBlock: 400000000,
    startBlock: 70398215,
    chainId: 42161,
    totalVotingPower: totalVotingPower.toString(),
    totalSupply: "10000000000000000000000000000",
    delegates,
    stats: { totalDelegates: delegates.length },
    ...overrides,
  };
}

const DELEGATES = [
  makeDelegate("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1000000000000000000000"), // 1000 ARB
  makeDelegate("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "500000000000000000000"), // 500 ARB
  makeDelegate("0xcccccccccccccccccccccccccccccccccccccccc", "100000000000000000000"), // 100 ARB
  makeDelegate("0xdddddddddddddddddddddddddddddddddddddddd", "10000000000000000000"), // 10 ARB
];

const CACHE = makeCache(DELEGATES);

describe("Delegate Cache Module", () => {
  describe("extractDelegates", () => {
    it("should return delegates array from cache", () => {
      // #given - a cache with delegates

      // #when
      const result = extractDelegates(CACHE);

      // #then
      expect(result).toBe(CACHE.delegates);
      expect(result).toHaveLength(4);
    });
  });

  describe("getDelegateCacheStats", () => {
    it("should extract display stats", () => {
      // #given - a cache

      // #when
      const stats = getDelegateCacheStats(CACHE);

      // #then
      expect(stats.totalDelegates).toBe(4);
      expect(stats.snapshotBlock).toBe(400000000);
      expect(stats.generatedAt).toBe("2026-03-17T00:00:00.000Z");
      expect(stats.totalVotingPower).toBe(CACHE.totalVotingPower);
      expect(stats.totalSupply).toBe(CACHE.totalSupply);
    });
  });

  describe("getTopDelegates", () => {
    it("should return all delegates when no limit", () => {
      // #given

      // #when
      const result = getTopDelegates(CACHE);

      // #then
      expect(result).toHaveLength(4);
    });

    it("should slice to limit", () => {
      // #given

      // #when
      const result = getTopDelegates(CACHE, 2);

      // #then
      expect(result).toHaveLength(2);
      expect(result[0].address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(result[1].address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    });

    it("should return all if limit exceeds length", () => {
      // #given

      // #when
      const result = getTopDelegates(CACHE, 100);

      // #then
      expect(result).toHaveLength(4);
    });
  });

  describe("getDelegateRankInfo", () => {
    it("should return rank and voting power for known address", () => {
      // #given

      // #when
      const info = getDelegateRankInfo(CACHE, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

      // #then
      expect(info).toBeDefined();
      expect(info!.rank).toBe(2);
      expect(info!.votingPower).toBe("500000000000000000000");
    });

    it("should be case-insensitive", () => {
      // #given

      // #when
      const info = getDelegateRankInfo(CACHE, "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

      // #then
      expect(info).toBeDefined();
      expect(info!.rank).toBe(1);
    });

    it("should return undefined for unknown address", () => {
      // #given

      // #when
      const info = getDelegateRankInfo(CACHE, "0x1111111111111111111111111111111111111111");

      // #then
      expect(info).toBeUndefined();
    });
  });

  describe("filterDelegatesByMinPower", () => {
    it("should filter delegates below threshold", () => {
      // #given - threshold of 200 ARB
      const threshold = "200000000000000000000";

      // #when
      const result = filterDelegatesByMinPower(DELEGATES, threshold);

      // #then
      expect(result).toHaveLength(2);
      expect(result[0].address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(result[1].address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    });

    it("should include delegates at exactly the threshold", () => {
      // #given - threshold exactly matching a delegate
      const threshold = "500000000000000000000";

      // #when
      const result = filterDelegatesByMinPower(DELEGATES, threshold);

      // #then
      expect(result).toHaveLength(2);
    });

    it("should return all with zero threshold", () => {
      // #given

      // #when
      const result = filterDelegatesByMinPower(DELEGATES, "0");

      // #then
      expect(result).toHaveLength(4);
    });
  });

  describe("filterDelegatesByAddress", () => {
    it("should filter by address substring", () => {
      // #given

      // #when
      const result = filterDelegatesByAddress(DELEGATES, "aaaa");

      // #then
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    });

    it("should be case-insensitive", () => {
      // #given

      // #when
      const result = filterDelegatesByAddress(DELEGATES, "BBBB");

      // #then
      expect(result).toHaveLength(1);
    });

    it("should match 0x prefix", () => {
      // #given

      // #when
      const result = filterDelegatesByAddress(DELEGATES, "0x");

      // #then - all addresses start with 0x
      expect(result).toHaveLength(4);
    });
  });

  describe("validateDelegateCache", () => {
    it("should accept a valid cache", () => {
      // #given

      // #when / #then
      expect(validateDelegateCache(CACHE)).toBe(true);
    });

    it("should reject null", () => {
      expect(validateDelegateCache(null)).toBe(false);
    });

    it("should reject non-object", () => {
      expect(validateDelegateCache("string")).toBe(false);
    });

    it("should reject missing version", () => {
      // #given
      const invalid = { ...CACHE } as Record<string, unknown>;
      delete invalid.version;

      // #when / #then
      expect(validateDelegateCache(invalid)).toBe(false);
    });

    it("should reject missing delegates array", () => {
      // #given
      const invalid = { ...CACHE, delegates: "not-array" };

      // #when / #then
      expect(validateDelegateCache(invalid)).toBe(false);
    });

    it("should reject invalid stats", () => {
      // #given
      const invalid = { ...CACHE, stats: null };

      // #when / #then
      expect(validateDelegateCache(invalid)).toBe(false);
    });

    it("should accept empty delegates array", () => {
      // #given
      const empty = makeCache([]);

      // #when / #then
      expect(validateDelegateCache(empty)).toBe(true);
    });

    it("should reject delegates with invalid first entry", () => {
      // #given
      const invalid = {
        ...CACHE,
        delegates: [{ address: 123, votingPower: "100", lastChangeBlock: 1 }],
      };

      // #when / #then
      expect(validateDelegateCache(invalid)).toBe(false);
    });
  });

  describe("getBundledDelegateCachePath", () => {
    it("should return a path when delegate-cache.json exists", () => {
      // #given - the file was generated during setup

      // #when
      const cachePath = getBundledDelegateCachePath();

      // #then
      expect(cachePath).toBeDefined();
      expect(cachePath).toContain("delegate-cache.json");
    });
  });

  describe("loadBundledDelegateCache", () => {
    it("should load and validate the bundled cache", () => {
      // #given - data/delegate-cache.json exists

      // #when
      const cache = loadBundledDelegateCache();

      // #then
      expect(cache.version).toBe(1);
      expect(cache.chainId).toBe(42161);
      expect(cache.delegates.length).toBeGreaterThan(0);
      expect(cache.stats.totalDelegates).toBe(cache.delegates.length);
      expect(typeof cache.snapshotBlock).toBe("number");
      expect(typeof cache.totalVotingPower).toBe("string");
      expect(typeof cache.totalSupply).toBe("string");
    });

    it("should return delegates sorted by voting power descending", () => {
      // #given
      const cache = loadBundledDelegateCache();

      // #when - check first few delegates
      for (let i = 1; i < Math.min(cache.delegates.length, 10); i++) {
        const prev = ethers.BigNumber.from(cache.delegates[i - 1].votingPower);
        const curr = ethers.BigNumber.from(cache.delegates[i].votingPower);

        // #then
        expect(prev.gte(curr)).toBe(true);
      }
    });
  });
});
