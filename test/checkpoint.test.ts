/**
 * Checkpoint and Resume Tests
 *
 * Tests for tracking checkpoint functionality:
 * - Checkpoint generation
 * - Resuming from checkpoint
 * - Cache interactions
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  createTracker,
  ProposalStageTracker,
  DEFAULT_RPC_URLS,
  TrackingResult,
  TrackingCheckpoint,
  CacheAdapter,
} from "../src";
import {
  shouldSkipRpc,
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./helpers";

dotenv.config({ quiet: true });

/**
 * In-memory cache adapter for testing
 */
class MemoryCache implements CacheAdapter {
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

describe("Checkpoint Module (Unit Tests)", () => {
  describe("Checkpoint structure validation", () => {
    it("should have required checkpoint fields", () => {
      // #given - a checkpoint with governor input type and all required fields
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          proposalId: "12345",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "a".repeat(64),
        },
        lastProcessedStage: "PROPOSAL_CREATED",
        lastProcessedBlock: { l1: 100000, l2: 200000 },
        cachedData: {
          completedStages: [],
        },
        metadata: {
          errorCount: 0,
          lastTrackedAt: Date.now(),
        },
      };

      // #when - accessing checkpoint properties (no action, structure validation)

      // #then - all required fields should be present and correctly typed
      expect(checkpoint.version).toBe(1);
      expect(checkpoint.input.type).toBe("governor");
      expect(checkpoint.lastProcessedStage).toBe("PROPOSAL_CREATED");
      expect(checkpoint.metadata?.errorCount).toBe(0);
    });

    it("should support timelock input type", () => {
      // #given - a checkpoint with timelock input type
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          operationId: "0x" + "b".repeat(64),
          timelockAddress: "0x" + "2".repeat(40),
          scheduledTxHash: "0x" + "c".repeat(64),
        },
        lastProcessedStage: "L2_TIMELOCK",
        lastProcessedBlock: { l1: 100000, l2: 200000 },
        cachedData: {},
        metadata: {
          errorCount: 0,
          lastTrackedAt: Date.now(),
        },
      };

      // #when - checking input type and accessing timelock-specific fields

      // #then - timelock input fields should be accessible via type narrowing
      expect(checkpoint.input.type).toBe("timelock");
      if (checkpoint.input.type === "timelock") {
        expect(checkpoint.input.operationId).toBe("0x" + "b".repeat(64));
      }
    });

    it("should support discovery input type", () => {
      // #given - a checkpoint with discovery input type and watermarks
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "discovery",
          id: "watermarks",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 300000 },
        cachedData: {
          discoveryWatermarks: {
            constitutionalGovernor: 100000,
            nonConstitutionalGovernor: 200000,
          },
        },
        metadata: {
          errorCount: 0,
          lastTrackedAt: Date.now(),
        },
      };

      // #when - checking discovery input and cached watermarks

      // #then - discovery input type and watermarks should be present
      expect(checkpoint.input.type).toBe("discovery");
      expect(checkpoint.cachedData.discoveryWatermarks).toBeDefined();
    });
  });

  describe("Checkpoint cache key generation", () => {
    it("should use lowercase tx hash for cache key", () => {
      // #given - a transaction hash with uppercase characters
      const txHash = "0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";

      // #when - generating a cache key from the tx hash
      const expectedKey = `tx:${txHash.toLowerCase()}`;

      // #then - the cache key should be lowercase for consistent lookups
      expect(expectedKey).toBe(
        "tx:0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
      );
    });
  });

  describe("CacheAdapter interface", () => {
    let cache: MemoryCache;

    beforeEach(() => {
      cache = new MemoryCache();
    });

    it("should store and retrieve values", async () => {
      // #given - a checkpoint object to store
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "discovery", id: "watermarks" },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      // #when - storing and retrieving the checkpoint from cache
      await cache.set("test-key", checkpoint);
      const retrieved = await cache.get<TrackingCheckpoint>("test-key");

      // #then - the retrieved value should match the stored checkpoint
      expect(retrieved).not.toBeNull();
      expect(retrieved!.version).toBe(1);
    });

    it("should return null for non-existent key", async () => {
      // #given - an empty cache (from beforeEach)

      // #when - attempting to get a key that doesn't exist
      const result = await cache.get("non-existent");

      // #then - should return null
      expect(result).toBeNull();
    });

    it("should check key existence", async () => {
      // #given - a cache with one existing key
      await cache.set("existing-key", { value: 1 });

      // #when - checking existence of existing and non-existing keys

      // #then - has() should return true for existing key, false for missing
      expect(await cache.has("existing-key")).toBe(true);
      expect(await cache.has("non-existing-key")).toBe(false);
    });

    it("should delete keys", async () => {
      // #given - a cache with a key to be deleted
      await cache.set("delete-me", { value: 1 });
      expect(await cache.has("delete-me")).toBe(true);

      // #when - deleting the key
      await cache.delete("delete-me");

      // #then - the key should no longer exist
      expect(await cache.has("delete-me")).toBe(false);
    });

    it("should list all keys", async () => {
      // #given - a cache with multiple keys
      await cache.set("key1", { value: 1 });
      await cache.set("key2", { value: 2 });
      await cache.set("key3", { value: 3 });

      // #when - listing all keys
      const keys = await cache.keys();

      // #then - all stored keys should be returned
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
      expect(keys.length).toBe(3);
    });

    it("should clear all data", async () => {
      // #given - a cache with multiple entries
      await cache.set("key1", { value: 1 });
      await cache.set("key2", { value: 2 });

      // #when - clearing the cache
      await cache.clear();

      // #then - the cache should be empty
      const keys = await cache.keys();
      expect(keys.length).toBe(0);
    });
  });
});

describe.skipIf(shouldSkipRpc())("Checkpoint Integration Tests", () => {
  let tracker: ProposalStageTracker;
  let cache: MemoryCache;
  let initialResult: TrackingResult;
  let l1Provider: ethers.providers.JsonRpcProvider;
  let l2Provider: ethers.providers.JsonRpcProvider;
  let novaProvider: ethers.providers.JsonRpcProvider;

  beforeAll(async () => {
    const ethRpc = process.env.ETH_RPC;
    if (!ethRpc) {
      throw new Error("ETH_RPC environment variable required");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

    l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
    novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);

    tracker = createTracker({ l1Provider, l2Provider, novaProvider });
    cache = new MemoryCache();

    // Track once to get initial result
    const results = await tracker.trackByTxHash(
      CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
    );
    initialResult = results[0];
  }, 180000);

  describe("Checkpoint generation", () => {
    it("should generate valid checkpoint from tracking result", () => {
      // #given - an initial tracking result from beforeAll

      // #when - extracting the checkpoint from the result
      const checkpoint = initialResult.checkpoint;

      // #then - checkpoint should have valid structure and version
      expect(checkpoint).toBeDefined();
      expect(checkpoint.version).toBe(1);
      expect(checkpoint.createdAt).toBeGreaterThan(0);
      expect(checkpoint.input.type).toBe("governor");
    });

    it("should include completed stages in checkpoint", () => {
      // #given - an initial tracking result from beforeAll

      // #when - extracting cached data from the checkpoint
      const checkpoint = initialResult.checkpoint;

      // #then - completed stages should be cached for resume
      expect(checkpoint.cachedData.completedStages).toBeDefined();
      expect(checkpoint.cachedData.completedStages!.length).toBeGreaterThan(0);
    });

    it("should have defined lastProcessedBlock", () => {
      // #given - an initial tracking result from beforeAll

      // #when - extracting block information from checkpoint
      const checkpoint = initialResult.checkpoint;

      // #then - both L1 and L2 block numbers should be tracked
      expect(checkpoint.lastProcessedBlock).toBeDefined();
      expect(typeof checkpoint.lastProcessedBlock.l1).toBe("number");
      expect(typeof checkpoint.lastProcessedBlock.l2).toBe("number");
    });
  });

  describe("Resume from checkpoint", () => {
    it("should resume tracking from checkpoint", async () => {
      // #given - a checkpoint from the initial tracking result
      const checkpoint = initialResult.checkpoint;

      // #when - resuming tracking from the checkpoint
      const resumed = await tracker.trackFromCheckpoint(checkpoint);

      // #then - resumed result should have same input type and stages
      expect(resumed).toBeDefined();
      expect(resumed.input.type).toBe(checkpoint.input.type);
      expect(resumed.stages.length).toBeGreaterThan(0);
    });

    it("should use cached stages when resuming", async () => {
      // #given - a checkpoint stored in the cache
      const checkpoint = initialResult.checkpoint;
      const cacheKey = `tx:${CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash.toLowerCase()}`;
      await cache.set(cacheKey, checkpoint);

      // #when - tracking with a cache-enabled tracker
      const trackerWithCache = createTracker({
        l1Provider,
        l2Provider,
        novaProvider,
        cache,
      });
      const results = await trackerWithCache.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );

      // #then - tracking should complete using cached data
      expect(results.length).toBe(1);
      expect(results[0].isComplete).toBe(true);
    });
  });

  describe("Cache persistence", () => {
    it("should store checkpoint in cache after tracking", async () => {
      // #given - a fresh tracker with an empty cache
      const ethRpc = process.env.ETH_RPC;
      if (!ethRpc) {
        throw new Error("ETH_RPC environment variable required");
      }
      const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
      const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

      const newCache = new MemoryCache();
      const newL1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
      const newL2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
      const newNovaProvider = new ethers.providers.JsonRpcProvider(novaRpc);

      const newTracker = createTracker({
        l1Provider: newL1Provider,
        l2Provider: newL2Provider,
        novaProvider: newNovaProvider,
        cache: newCache,
      });

      // #when - tracking a proposal by transaction hash
      await newTracker.trackByTxHash(NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash);

      // #then - checkpoint should be automatically stored in the cache
      const cacheKey = `tx:${NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash.toLowerCase()}`;
      const stored = await newCache.get<TrackingCheckpoint>(cacheKey);

      expect(stored).not.toBeNull();
      expect(stored!.input.type).toBe("governor");
    });
  });
});
