/**
 * Discovery Reorg Detection Fork Tests
 *
 * Tests for discoverAll reorg detection using real RPC providers.
 * Verifies watermark hash validation and rollback behavior.
 *
 * NOTE: These tests require ARB1_RPC or ARB1_ARCHIVE_RPC to be set in .env.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import type { CacheAdapter, DiscoveryWatermarks, WatermarkHashes } from "../src/types";
import { DEFAULT_RPC_URLS } from "../src";
import {
  discoverAll,
  verifyWatermark,
  loadWatermarks,
  saveWatermarks,
} from "../src/tracker/discovery";

dotenv.config({ quiet: true });

class MockCache implements CacheAdapter {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

describe.skipIf(process.env.NO_RPC === "1")("Discovery Reorg Detection Fork Tests", () => {
  let l2Provider: ethers.providers.JsonRpcProvider;
  let cache: MockCache;

  const TEST_BLOCK = 390_000_000;
  const NARROW_RANGE = 1_000;

  beforeAll(() => {
    const arbRpc = process.env.ARB1_ARCHIVE_RPC || process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
  });

  beforeEach(() => {
    cache = new MockCache();
  });

  describe("verifyWatermark with real chain", () => {
    it("should establish hash when no expected hash is provided", async () => {
      // #given - a block number without stored hash
      const blockNumber = TEST_BLOCK;

      // #when - verifying watermark without expected hash
      const result = await verifyWatermark(
        "constitutionalGovernor",
        blockNumber,
        undefined,
        l2Provider
      );

      // #then - should return valid with new hash established
      expect(result.isValid).toBe(true);
      expect(result.blockNumber).toBe(blockNumber);
      expect(result.newHash).toBeDefined();
      expect(result.newHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should validate matching hash", async () => {
      // #given - fetch actual block hash from chain
      const blockNumber = TEST_BLOCK;
      const block = await l2Provider.getBlock(blockNumber);
      const expectedHash = block.hash;

      // #when - verifying with correct hash
      const result = await verifyWatermark(
        "constitutionalGovernor",
        blockNumber,
        expectedHash,
        l2Provider
      );

      // #then - should return valid
      expect(result.isValid).toBe(true);
      expect(result.blockNumber).toBe(blockNumber);
      expect(result.newHash).toBe(expectedHash);
    });

    it("should detect reorg when hash does not match", async () => {
      // #given - a wrong hash for a known block
      const blockNumber = TEST_BLOCK;
      const wrongHash = "0x" + "f".repeat(64);

      // #when - verifying with mismatched hash
      const result = await verifyWatermark(
        "constitutionalGovernor",
        blockNumber,
        wrongHash,
        l2Provider
      );

      // #then - should detect reorg and roll back by 1000 blocks
      expect(result.isValid).toBe(false);
      expect(result.blockNumber).toBe(blockNumber - 1000);
    });
  });

  describe("discoverAll with reorg detection enabled", () => {
    it("should populate watermark hashes after discovery", async () => {
      // #given - targets for constitutional governor only
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const fromBlock = TEST_BLOCK;
      const toBlock = TEST_BLOCK + NARROW_RANGE;

      // #when - discovering with reorg check enabled (default)
      const result = await discoverAll(
        targets,
        toBlock,
        l2Provider,
        cache,
        { constitutionalGovernor: fromBlock },
        {}, // empty hashes - first run
        { skipReorgCheck: false }
      );

      // #then - should return populated hashes for toBlock
      expect(result.hashes).toBeDefined();
      expect(result.hashes.constitutionalGovernor).toBeDefined();
      expect(result.hashes.constitutionalGovernor).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // Watermarks should be updated to toBlock
      expect(result.watermarks.constitutionalGovernor).toBe(toBlock);
    });

    it("should verify existing hashes and continue on match", async () => {
      // #given - discover once to get valid hashes
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const fromBlock = TEST_BLOCK;
      const toBlock = TEST_BLOCK + NARROW_RANGE;

      const firstResult = await discoverAll(
        targets,
        toBlock,
        l2Provider,
        cache,
        { constitutionalGovernor: fromBlock },
        {},
        { skipReorgCheck: false }
      );

      // #when - discovering again with stored hashes from previous run
      const toBlock2 = toBlock + NARROW_RANGE;
      const secondResult = await discoverAll(
        targets,
        toBlock2,
        l2Provider,
        cache,
        firstResult.watermarks,
        firstResult.hashes, // pass hashes from first run
        { skipReorgCheck: false }
      );

      // #then - should continue from toBlock (no rollback because hash matched)
      expect(secondResult.watermarks.constitutionalGovernor).toBe(toBlock2);
      expect(secondResult.hashes.constitutionalGovernor).toBeDefined();
    });

    it("should roll back watermark when hash mismatch detected", async () => {
      // #given - watermarks with incorrect hash (simulating reorg)
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const fromBlock = TEST_BLOCK;
      const toBlock = TEST_BLOCK + NARROW_RANGE;

      // Store a wrong hash to simulate reorg scenario
      const wrongHash = "0x" + "a".repeat(64);
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: fromBlock,
      };
      const hashes: WatermarkHashes = {
        constitutionalGovernor: wrongHash, // This won't match the actual block
      };

      // #when - discovering with mismatched hash
      const result = await discoverAll(targets, toBlock, l2Provider, cache, watermarks, hashes, {
        skipReorgCheck: false,
      });

      // #then - should complete discovery (from rolled back position)
      // Watermarks will be set to toBlock after successful discovery
      expect(result.watermarks.constitutionalGovernor).toBe(toBlock);
      // New correct hashes should be established
      expect(result.hashes.constitutionalGovernor).toBeDefined();
      expect(result.hashes.constitutionalGovernor).not.toBe(wrongHash);
    });

    it("should handle multiple targets with reorg check", async () => {
      // #given - multiple targets enabled
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: true,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: true,
        l2NonConstitutionalTimelock: false,
      };
      const fromBlock = TEST_BLOCK;
      const toBlock = TEST_BLOCK + NARROW_RANGE;

      // #when - discovering with reorg check enabled
      const result = await discoverAll(
        targets,
        toBlock,
        l2Provider,
        cache,
        {
          constitutionalGovernor: fromBlock,
          nonConstitutionalGovernor: fromBlock,
          l2ConstitutionalTimelock: fromBlock,
        },
        {}, // empty hashes
        { skipReorgCheck: false }
      );

      // #then - all active targets should have hashes populated
      expect(result.hashes.constitutionalGovernor).toBeDefined();
      expect(result.hashes.nonConstitutionalGovernor).toBeDefined();
      expect(result.hashes.l2ConstitutionalTimelock).toBeDefined();

      // All watermarks should be at toBlock
      expect(result.watermarks.constitutionalGovernor).toBe(toBlock);
      expect(result.watermarks.nonConstitutionalGovernor).toBe(toBlock);
      expect(result.watermarks.l2ConstitutionalTimelock).toBe(toBlock);
    });
  });

  describe("watermark persistence with hashes", () => {
    it("should save and load watermarks with hashes", async () => {
      // #given - watermarks and hashes to persist
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: TEST_BLOCK,
        nonConstitutionalGovernor: TEST_BLOCK + 100,
      };
      const hashes: WatermarkHashes = {
        constitutionalGovernor: "0x" + "a".repeat(64),
        nonConstitutionalGovernor: "0x" + "b".repeat(64),
      };

      // #when - saving and loading
      await saveWatermarks(watermarks, hashes, cache);
      const loaded = await loadWatermarks(cache);

      // #then - should round-trip correctly
      expect(loaded.watermarks).toEqual(watermarks);
      expect(loaded.hashes).toEqual(hashes);
    });

    it("should integrate with discoverAll save/load cycle", async () => {
      // #given - run discovery to get real data
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const toBlock = TEST_BLOCK + NARROW_RANGE;

      const result = await discoverAll(
        targets,
        toBlock,
        l2Provider,
        cache,
        { constitutionalGovernor: TEST_BLOCK },
        {},
        { skipReorgCheck: false }
      );

      // #when - save and reload watermarks
      await saveWatermarks(result.watermarks, result.hashes, cache);
      const loaded = await loadWatermarks(cache);

      // #then - should match discovery results
      expect(loaded.watermarks.constitutionalGovernor).toBe(toBlock);
      expect(loaded.hashes.constitutionalGovernor).toBe(result.hashes.constitutionalGovernor);
    });

    it("should use loaded hashes for subsequent discovery", async () => {
      // #given - run discovery and save
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const toBlock1 = TEST_BLOCK + NARROW_RANGE;

      const result1 = await discoverAll(
        targets,
        toBlock1,
        l2Provider,
        cache,
        { constitutionalGovernor: TEST_BLOCK },
        {},
        { skipReorgCheck: false }
      );

      await saveWatermarks(result1.watermarks, result1.hashes, cache);

      // #when - load and use for next discovery
      const loaded = await loadWatermarks(cache);
      const toBlock2 = toBlock1 + NARROW_RANGE;

      const result2 = await discoverAll(
        targets,
        toBlock2,
        l2Provider,
        cache,
        loaded.watermarks,
        loaded.hashes,
        { skipReorgCheck: false }
      );

      // #then - should succeed with updated watermarks
      expect(result2.watermarks.constitutionalGovernor).toBe(toBlock2);
      expect(result2.hashes.constitutionalGovernor).toBeDefined();
    });
  });

  describe("skipReorgCheck option", () => {
    it("should skip verification when skipReorgCheck is true", async () => {
      // #given - watermarks with wrong hash
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const fromBlock = TEST_BLOCK;
      const toBlock = TEST_BLOCK + NARROW_RANGE;

      const wrongHash = "0x" + "c".repeat(64);

      // #when - discovering with skipReorgCheck: true
      const result = await discoverAll(
        targets,
        toBlock,
        l2Provider,
        cache,
        { constitutionalGovernor: fromBlock },
        { constitutionalGovernor: wrongHash },
        { skipReorgCheck: true }
      );

      // #then - should complete without rollback
      expect(result.watermarks.constitutionalGovernor).toBe(toBlock);
      // With skipReorgCheck, hashes are still updated for toBlock
      expect(result.hashes.constitutionalGovernor).toBeDefined();
    });
  });
});
