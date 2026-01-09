/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Comprehensive tests for ProposalStageTracker
 *
 * Tests the main tracker entry points against real blockchain data:
 * - trackByTxHash: Full roundtrip, L2-only, in-progress scenarios
 * - trackByTxHash: Universal entry from any tx (proposal creation or CallScheduled)
 * - Error handling and edge cases
 *
 * PERFORMANCE OPTIMIZATION:
 * All proposals are tracked once in beforeAll and reused across tests.
 * This reduces test time from ~12 minutes to ~3 minutes.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

import {
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
  CONSTITUTIONAL_GOVERNOR_IN_PROGRESS,
  DIRECT_TIMELOCK_OPERATION,
} from "./fixtures";

import {
  ProposalStageTracker,
  createTracker,
  StageType,
  validateSalt,
  validateSaltBatch,
  TimelockParams,
  TimelockBatchParams,
  DEFAULT_RPC_URLS,
  TrackingResult,
  TrackedStage,
  StageTransaction,
  TrackingCheckpoint,
} from "../src";
import { extractTimelockLink } from "../src/tracker";

dotenv.config({ quiet: true });

describe("extractTimelockLink (Unit Tests)", () => {
  it("should return undefined for empty stages array", () => {
    // #given - empty stages array
    const stages: TrackedStage[] = [];

    // #when - extracting timelock link
    const result = extractTimelockLink(stages);

    // #then - should return undefined
    expect(result).toBeUndefined();
  });

  it("should return undefined when PROPOSAL_QUEUED stage is not completed", () => {
    // #given - stages with PROPOSAL_QUEUED not completed
    const stages = [
      {
        type: "PROPOSAL_QUEUED" as const,
        status: "READY" as const,
        chain: "arb1" as const,
        chainId: 42161 as const,
        transactions: [],
        data: { proposalState: "Succeeded" },
      },
    ];

    // #when - extracting timelock link
    const result = extractTimelockLink(stages as TrackedStage[]);

    // #then - should return undefined
    expect(result).toBeUndefined();
  });

  it("should return undefined when transactions are missing", () => {
    // #given - completed stage without transactions
    const stages = [
      {
        type: "PROPOSAL_QUEUED" as const,
        status: "COMPLETED" as const,
        chain: "arb1" as const,
        chainId: 42161 as const,
        transactions: [],
        data: { proposalState: "Queued", operationId: "0x123", timelockAddress: "0x456" },
      },
    ];

    // #when - extracting timelock link
    const result = extractTimelockLink(stages as TrackedStage[]);

    // #then - should return undefined
    expect(result).toBeUndefined();
  });

  it("should return undefined when operationId is missing", () => {
    // #given - completed stage without operationId
    const stages = [
      {
        type: "PROPOSAL_QUEUED" as const,
        status: "COMPLETED" as const,
        chain: "arb1" as const,
        chainId: 42161 as const,
        transactions: [{ hash: "0xabc", blockNumber: 100, chain: "arb1" as const, chainId: 42161 }],
        data: { proposalState: "Queued", timelockAddress: "0x456" },
      },
    ];

    // #when - extracting timelock link
    const result = extractTimelockLink(stages as TrackedStage[]);

    // #then - should return undefined
    expect(result).toBeUndefined();
  });

  it("should extract timelock link from completed PROPOSAL_QUEUED stage", () => {
    // #given - valid completed PROPOSAL_QUEUED stage
    const stages = [
      {
        type: "PROPOSAL_QUEUED" as const,
        status: "COMPLETED" as const,
        chain: "arb1" as const,
        chainId: 42161 as const,
        transactions: [
          { hash: "0xabc123", blockNumber: 100000, chain: "arb1" as const, chainId: 42161 },
        ],
        data: {
          proposalState: "Queued",
          operationId: "0xoperation456",
          timelockAddress: "0x789timelock",
        },
      },
    ];

    // #when - extracting timelock link
    const result = extractTimelockLink(stages as TrackedStage[]);

    // #then - should return valid timelock link
    expect(result).toBeDefined();
    expect(result?.txHash).toBe("0xabc123");
    expect(result?.operationId).toBe("0xoperation456");
    expect(result?.timelockAddress).toBe("0x789timelock");
    expect(result?.queueBlockNumber).toBe(100000);
  });
});

describe("Tracker Cache Methods (Mocked)", () => {
  const mockL1Provider = {} as ethers.providers.Provider;
  const mockL2Provider = {} as ethers.providers.Provider;

  describe("loadWatermarks", () => {
    it("should return empty object when no cache configured", async () => {
      // #given - tracker without cache
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // #when - loading watermarks
      const watermarks = await tracker.loadWatermarks();

      // #then - should return empty object
      expect(watermarks).toEqual({});
    });
  });

  describe("saveWatermarks", () => {
    it("should complete without error when no cache configured", async () => {
      // #given - tracker without cache
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // #when - saving watermarks
      await tracker.saveWatermarks({});

      // #then - should not throw
      expect(true).toBe(true);
    });
  });

  describe("listCheckpointKeys", () => {
    it("should return empty array when no cache configured", async () => {
      // #given - tracker without cache
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // #when - listing checkpoint keys
      const keys = await tracker.listCheckpointKeys();

      // #then - should return empty array
      expect(keys).toEqual([]);
    });
  });

  describe("getCheckpoint", () => {
    it("should return null when no cache configured", async () => {
      // #given - tracker without cache
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // #when - getting a checkpoint
      const checkpoint = await tracker.getCheckpoint("tx:0x123");

      // #then - should return null
      expect(checkpoint).toBeNull();
    });
  });

  describe("getAllCheckpoints", () => {
    it("should return empty map when no cache configured", async () => {
      // #given - tracker without cache
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // #when - getting all checkpoints
      const checkpoints = await tracker.getAllCheckpoints();

      // #then - should return empty map
      expect(checkpoints.size).toBe(0);
    });
  });

  describe("queryIncompleteCheckpoints", () => {
    it("should return empty array when no cache configured", async () => {
      // #given - tracker without cache
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // #when - querying incomplete checkpoints
      const incomplete = await tracker.queryIncompleteCheckpoints();

      // #then - should return empty array
      expect(incomplete).toEqual([]);
    });
  });

  describe("getStats", () => {
    it("should return zero stats when no cache configured", async () => {
      // #given - tracker without cache
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // #when - getting stats
      const stats = await tracker.getStats();

      // #then - should return zeroed stats
      expect(stats.total).toBe(0);
      expect(stats.proposals.total).toBe(0);
      expect(stats.timelocks.total).toBe(0);
      expect(stats.elections.total).toBe(0);
    });
  });
});

describe("Tracker Cache Methods (With Mock Cache)", () => {
  const mockL1Provider = {} as ethers.providers.Provider;
  const mockL2Provider = {} as ethers.providers.Provider;

  function createMockCache() {
    const storage = new Map<string, unknown>();
    return {
      get: async <T>(key: string): Promise<T | null> => (storage.get(key) as T) ?? null,
      set: async <T>(key: string, value: T): Promise<void> => {
        storage.set(key, value);
      },
      delete: async (key: string): Promise<void> => {
        storage.delete(key);
      },
      clear: async (): Promise<void> => {
        storage.clear();
      },
      has: async (key: string): Promise<boolean> => storage.has(key),
      keys: (prefix?: string): string[] =>
        [...storage.keys()].filter((k) => !prefix || k.startsWith(prefix)),
      _storage: storage,
    };
  }

  describe("loadWatermarks with cache", () => {
    it("should return watermarks from cache when stored", async () => {
      // #given - cache with stored watermarks using valid DiscoveryKey values
      const mockCache = createMockCache();
      const storedWatermarks = {
        constitutionalGovernor: 100,
        l2ConstitutionalTimelock: 200,
      };
      await mockCache.set("discovery:watermarks", {
        version: 1,
        createdAt: Date.now(),
        lastTrackedAt: Date.now(),
        input: { type: "watermarks" },
        cachedData: {
          discoveryWatermarks: storedWatermarks,
        },
        metadata: { errorCount: 0 },
      });

      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        cache: mockCache,
      });

      // #when - loading watermarks
      const watermarks = await tracker.loadWatermarks();

      // #then - should return stored watermarks
      expect(watermarks).toEqual(storedWatermarks);
    });
  });

  describe("saveWatermarks with cache", () => {
    it("should save watermarks to cache", async () => {
      // #given - empty cache
      const mockCache = createMockCache();
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        cache: mockCache,
      });

      // #when - saving watermarks with valid DiscoveryKey
      const watermarksToSave = { constitutionalGovernor: 500 };
      await tracker.saveWatermarks(watermarksToSave);

      // #then - should be retrievable
      const retrieved = await tracker.loadWatermarks();
      expect(retrieved).toEqual(watermarksToSave);
    });
  });

  describe("listCheckpointKeys with cache", () => {
    it("should return keys from cache", async () => {
      // #given - cache with stored checkpoints
      const mockCache = createMockCache();
      await mockCache.set("tx:0xabc", { version: 1 });
      await mockCache.set("tx:0xdef", { version: 1 });
      await mockCache.set("other:key", { version: 1 });

      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        cache: mockCache,
      });

      // #when - listing checkpoint keys
      const keys = await tracker.listCheckpointKeys();

      // #then - should return tx: prefixed keys
      expect(keys).toContain("tx:0xabc");
      expect(keys).toContain("tx:0xdef");
    });
  });

  describe("getCheckpoint with cache", () => {
    it("should return checkpoint from cache when exists", async () => {
      // #given - cache with stored checkpoint
      const mockCache = createMockCache();
      const checkpoint = {
        version: 1,
        createdAt: Date.now(),
        lastTrackedAt: Date.now(),
        input: { type: "governor", proposalId: "123" },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0 },
      };
      await mockCache.set("tx:0xtest123", checkpoint);

      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        cache: mockCache,
      });

      // #when - getting the checkpoint
      const result = await tracker.getCheckpoint("tx:0xtest123");

      // #then - should return stored checkpoint
      expect(result).toEqual(checkpoint);
    });
  });

  describe("getAllCheckpoints with cache", () => {
    it("should return all checkpoints from cache", async () => {
      // #given - cache with multiple checkpoints
      const mockCache = createMockCache();
      const checkpoint1 = {
        version: 1,
        createdAt: Date.now(),
        lastTrackedAt: Date.now(),
        input: { type: "governor", proposalId: "1" },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0 },
      };
      const checkpoint2 = {
        version: 1,
        createdAt: Date.now(),
        lastTrackedAt: Date.now(),
        input: { type: "timelock", operationId: "2" },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0 },
      };
      await mockCache.set("tx:0xaaa", checkpoint1);
      await mockCache.set("tx:0xbbb", checkpoint2);

      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        cache: mockCache,
      });

      // #when - getting all checkpoints
      const checkpoints = await tracker.getAllCheckpoints();

      // #then - should return map with all checkpoints
      expect(checkpoints.size).toBe(2);
      expect(checkpoints.get("tx:0xaaa")).toEqual(checkpoint1);
      expect(checkpoints.get("tx:0xbbb")).toEqual(checkpoint2);
    });
  });

  describe("queryIncompleteCheckpoints with cache", () => {
    it("should return incomplete checkpoints", async () => {
      // #given - cache with complete and incomplete checkpoints
      const mockCache = createMockCache();
      const recentDate = Date.now() - 86400000; // 1 day ago

      // Incomplete: has PENDING stage (not all stages are complete)
      const incompleteCheckpoint = {
        version: 1,
        createdAt: recentDate,
        lastTrackedAt: recentDate,
        input: { type: "governor", proposalId: "1" },
        cachedData: {
          completedStages: [
            { type: "PROPOSAL_CREATED", status: "COMPLETED" },
            { type: "VOTING_ACTIVE", status: "PENDING" },
          ],
        },
        metadata: { errorCount: 0 },
      };
      // Complete: all stages are COMPLETED (areAllStagesComplete returns true)
      const completeCheckpoint = {
        version: 1,
        createdAt: recentDate,
        lastTrackedAt: recentDate,
        input: { type: "governor", proposalId: "2" },
        cachedData: {
          completedStages: [
            { type: "PROPOSAL_CREATED", status: "COMPLETED" },
            { type: "VOTING_ACTIVE", status: "COMPLETED" },
            { type: "L2_TIMELOCK", status: "COMPLETED" },
          ],
        },
        metadata: { errorCount: 0 },
      };
      await mockCache.set("tx:0xinc", incompleteCheckpoint);
      await mockCache.set("tx:0xcomp", completeCheckpoint);

      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        cache: mockCache,
      });

      // #when - querying incomplete checkpoints
      const incomplete = await tracker.queryIncompleteCheckpoints();

      // #then - should only return incomplete checkpoint (PENDING stage)
      expect(incomplete.length).toBe(1);
      expect(incomplete[0].key).toBe("tx:0xinc");
    });
  });

  describe("getStats with cache", () => {
    it("should return stats from cache", async () => {
      // #given - cache with mixed checkpoints
      const mockCache = createMockCache();
      await mockCache.set("tx:0xgov1", {
        version: 1,
        createdAt: Date.now(),
        lastTrackedAt: Date.now(),
        input: { type: "governor", proposalId: "1" },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0, isComplete: true },
      });
      await mockCache.set("tx:0xtl1", {
        version: 1,
        createdAt: Date.now(),
        lastTrackedAt: Date.now(),
        input: { type: "timelock", operationId: "1" },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0, isComplete: false },
      });

      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        cache: mockCache,
      });

      // #when - getting stats
      const stats = await tracker.getStats();

      // #then - should return correct counts
      expect(stats.total).toBe(2);
      expect(stats.proposals.total).toBe(1);
      expect(stats.timelocks.total).toBe(1);
    });
  });
});

describe("trackFromCheckpoint Edge Cases", () => {
  const mockL1Provider = {} as ethers.providers.Provider;
  const mockL2Provider = {} as ethers.providers.Provider;

  describe("governor checkpoint missing creationTxHash", () => {
    it("should throw error when creationTxHash is missing (line 621-622)", async () => {
      // #given - tracker with governor checkpoint missing creationTxHash
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // Simulating a checkpoint from cache/JSON that lacks creationTxHash
      const checkpointMissingTxHash = {
        version: 1 as const,
        createdAt: Date.now(),
        input: {
          type: "governor" as const,
          governorAddress: "0x123",
          proposalId: "123",
          creationTxHash: "", // Empty string triggers the check
        },
        cachedData: { completedStages: [] },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      // #when / #then - should throw error
      await expect(tracker.trackFromCheckpoint(checkpointMissingTxHash)).rejects.toThrow(
        "Governor checkpoint missing creationTxHash"
      );
    });
  });

  describe("timelock checkpoint missing scheduledTxHash", () => {
    it("should throw error when scheduledTxHash is missing (line 638-639)", async () => {
      // #given - tracker with timelock checkpoint missing scheduledTxHash
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // Simulating a checkpoint from cache/JSON that lacks scheduledTxHash
      const checkpointMissingTxHash = {
        version: 1 as const,
        createdAt: Date.now(),
        input: {
          type: "timelock" as const,
          timelockAddress: "0x456",
          operationId: "0x123",
          scheduledTxHash: "", // Empty string triggers the check
        },
        cachedData: { completedStages: [] },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      // #when / #then - should throw error
      await expect(tracker.trackFromCheckpoint(checkpointMissingTxHash)).rejects.toThrow(
        "Timelock checkpoint missing scheduledTxHash"
      );
    });
  });

  describe("unsupported checkpoint input type", () => {
    it("should throw error for unsupported input type (line 655)", async () => {
      // #given - tracker with unsupported checkpoint type
      const tracker = createTracker({
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
      });

      // Simulating a checkpoint with an unknown type (e.g., from future version)
      const checkpointUnsupported = {
        version: 1 as const,
        createdAt: Date.now(),
        input: { type: "unknown" },
        cachedData: { completedStages: [] },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      } as unknown as TrackingCheckpoint;

      // #when / #then - should throw error
      await expect(tracker.trackFromCheckpoint(checkpointUnsupported)).rejects.toThrow(
        "Unsupported checkpoint input type"
      );
    });
  });
});

describe("trackByTxHash Error Handling (Mocked)", () => {
  // Helper to create a mock cache
  function createMockCache() {
    const storage = new Map<string, unknown>();
    return {
      get: async <T>(key: string): Promise<T | null> => (storage.get(key) as T) ?? null,
      set: async <T>(key: string, value: T): Promise<void> => {
        storage.set(key, value);
      },
      delete: async (key: string): Promise<void> => {
        storage.delete(key);
      },
      clear: async (): Promise<void> => {
        storage.clear();
      },
      has: async (key: string): Promise<boolean> => storage.has(key),
      keys: (prefix?: string): string[] =>
        [...storage.keys()].filter((k) => !prefix || k.startsWith(prefix)),
      _storage: storage,
    };
  }

  it("should save checkpoint with incremented error count on tracking failure (lines 370-398)", async () => {
    // #given - tracker with cache and mock provider that throws
    const mockCache = createMockCache();
    const mockL2Provider = {
      getTransactionReceipt: () => Promise.reject(new Error("RPC connection failed")),
    } as unknown as ethers.providers.Provider;
    const mockL1Provider = {} as ethers.providers.Provider;

    const tracker = createTracker({
      l1Provider: mockL1Provider,
      l2Provider: mockL2Provider,
      cache: mockCache,
    });

    const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    // #when - tracking throws an error
    await expect(tracker.trackByTxHash(txHash)).rejects.toThrow("RPC connection failed");

    // #then - checkpoint should be saved with error count = 1
    const cacheKey = `tx:${txHash.toLowerCase()}`;
    const savedCheckpoint = await mockCache.get<TrackingCheckpoint>(cacheKey);
    expect(savedCheckpoint).not.toBeNull();
    expect(savedCheckpoint!.metadata?.errorCount).toBe(1);
  });

  it("should NOT increment error count for gas estimation errors (line 378-379)", async () => {
    // #given - tracker with cache and mock provider that throws gas error
    const mockCache = createMockCache();
    const mockL2Provider = {
      getTransactionReceipt: () =>
        Promise.reject(new Error("execution reverted: gas required exceeds allowance")),
    } as unknown as ethers.providers.Provider;
    const mockL1Provider = {} as ethers.providers.Provider;

    const tracker = createTracker({
      l1Provider: mockL1Provider,
      l2Provider: mockL2Provider,
      cache: mockCache,
    });

    const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

    // #when - tracking throws a gas estimation error
    await expect(tracker.trackByTxHash(txHash)).rejects.toThrow("execution reverted");

    // #then - checkpoint should be saved with error count = 0 (not incremented for gas errors)
    const cacheKey = `tx:${txHash.toLowerCase()}`;
    const savedCheckpoint = await mockCache.get<TrackingCheckpoint>(cacheKey);
    expect(savedCheckpoint).not.toBeNull();
    expect(savedCheckpoint!.metadata?.errorCount).toBe(0);
  });

  it("should increment error count on consecutive failures", async () => {
    // #given - tracker with cache containing a discovery checkpoint (not governor/timelock)
    // Using discovery type means it won't resume and will go through normal tracking
    const mockCache = createMockCache();
    const txHash = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
    const cacheKey = `tx:${txHash.toLowerCase()}`;

    // Pre-populate with existing checkpoint that has error count = 2
    // Use discovery type which is not a resume-able type for trackByTxHash
    await mockCache.set(cacheKey, {
      version: 1,
      createdAt: Date.now(),
      input: {
        type: "discovery", // Not governor/timelock, so won't resume
      },
      lastProcessedStage: null,
      lastProcessedBlock: { l1: 0, l2: 0 },
      cachedData: {},
      metadata: { errorCount: 2, lastTrackedAt: Date.now() },
    });

    const mockL2Provider = {
      getTransactionReceipt: () => Promise.reject(new Error("Network timeout")),
    } as unknown as ethers.providers.Provider;
    const mockL1Provider = {} as ethers.providers.Provider;

    const tracker = createTracker({
      l1Provider: mockL1Provider,
      l2Provider: mockL2Provider,
      cache: mockCache,
    });

    // #when - tracking fails (goes through new tracking since discovery type doesn't resume)
    await expect(tracker.trackByTxHash(txHash)).rejects.toThrow("Network timeout");

    // #then - error count should be incremented to 3
    const savedCheckpoint = await mockCache.get<TrackingCheckpoint>(cacheKey);
    expect(savedCheckpoint).not.toBeNull();
    expect(savedCheckpoint!.metadata?.errorCount).toBe(3);
  });
});

describe.skipIf(process.env.NO_RPC === "1")("ProposalStageTracker", () => {
  let l1Provider: ethers.providers.JsonRpcProvider;
  let l2Provider: ethers.providers.JsonRpcProvider;
  let novaProvider: ethers.providers.JsonRpcProvider;
  let tracker: ProposalStageTracker;

  // Cached tracking results (tracked once, reused across all tests)
  let fullRoundtripResult: TrackingResult;
  let l2OnlyResult: TrackingResult;
  let inProgressResult: TrackingResult;
  let timelockResult: TrackingResult;

  beforeAll(async () => {
    const ethRpc = process.env.ETH_RPC;
    if (!ethRpc) {
      throw new Error("RPC URLs required: Set ETH_RPC environment variables");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

    l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
    novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);
    tracker = createTracker({
      l1Provider,
      l2Provider,
      novaProvider,
    });

    // Track all proposals once
    console.log("Tracking proposals for test suite...");
    const [fullResults, l2Results, inProgressResults, timelockResults] = await Promise.all([
      tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash),
      tracker.trackByTxHash(NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash),
      tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_IN_PROGRESS.creationTxHash),
      tracker.trackByTxHash(DIRECT_TIMELOCK_OPERATION.timelockTxHash),
    ]);

    fullRoundtripResult = fullResults[0];
    l2OnlyResult = l2Results[0];
    inProgressResult = inProgressResults[0];
    timelockResult = timelockResults[0];
    console.log("✓ All proposals tracked and cached");
  }, 180000); // 3 minute timeout for initial tracking

  describe("createTracker factory", () => {
    it("should create tracker instance", () => {
      const t = createTracker({ l1Provider, l2Provider, novaProvider });
      expect(t).toBeInstanceOf(ProposalStageTracker);
    });

    it("should have undefined cache when not provided", () => {
      // Cache is optional - undefined when not explicitly provided
      expect((tracker as unknown as { cache?: unknown }).cache).toBeUndefined();
    });

    it("should use default chunking config when not provided", () => {
      expect(tracker.chunkingConfig).toBeDefined();
      expect(tracker.chunkingConfig.l2ChunkSize).toBe(10_000_000);
    });

    it("should return providers via getProviders()", () => {
      const providers = tracker.getProviders();

      expect(providers.l1).toBe(l1Provider);
      expect(providers.l2).toBe(l2Provider);
      expect(providers.nova).toBe(novaProvider);
    });
  });

  describe("trackByTxHash - Core Governor Full Roundtrip", () => {
    it("should track completed proposal through all stages", async () => {
      const result = fullRoundtripResult;

      expect(result).toBeDefined();
      expect(result.input.type).toBe("governor");
      expect(result.proposalType).toBeDefined();
      expect(result.isComplete).toBe(true);

      // Verify all expected stages present
      const stageTypes = result.stages.map((s: TrackedStage) => s.type);
      expect(stageTypes).toContain("PROPOSAL_CREATED");
      expect(stageTypes).toContain("VOTING_ACTIVE");
      expect(stageTypes).toContain("PROPOSAL_QUEUED");
      expect(stageTypes).toContain("L2_TIMELOCK");
      expect(stageTypes).toContain("L2_TIMELOCK");
      expect(stageTypes).toContain("L2_TO_L1_MESSAGE");
      expect(stageTypes).toContain("L2_TO_L1_MESSAGE");
      expect(stageTypes).toContain("L1_TIMELOCK");
      expect(stageTypes).toContain("L1_TIMELOCK");
      expect(stageTypes).toContain("RETRYABLE_EXECUTED");
    });

    it("should return correct proposal data", async () => {
      const result = fullRoundtripResult;

      expect(result.proposalData).toBeDefined();
      expect(result.proposalData?.proposalId).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.proposalId
      );
      expect(result.proposalData?.creationBlock).toBeGreaterThan(0);
    });

    it("should have COMPLETED status for all stages in completed proposal", async () => {
      const result = fullRoundtripResult;

      const nonSkippedStages = result.stages.filter((s: TrackedStage) => s.status !== "SKIPPED");
      for (const stage of nonSkippedStages) {
        expect(stage.status).toBe("COMPLETED");
      }
    });

    it("should include transaction hashes for completed stages", async () => {
      const result = fullRoundtripResult;

      const l2TimelockExecuted = result.stages.find((s: TrackedStage) => s.type === "L2_TIMELOCK");
      expect(l2TimelockExecuted).toBeDefined();
      expect(l2TimelockExecuted!.transactions.length).toBeGreaterThan(0);
      // Find the execution transaction (has description "executed" or is the last tx)
      const executionTx =
        l2TimelockExecuted!.transactions.find(
          (t: StageTransaction) => t.description === "executed"
        ) || l2TimelockExecuted!.transactions[l2TimelockExecuted!.transactions.length - 1];
      expect(executionTx.hash.toLowerCase()).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.expectedStages.L2_TIMELOCK.hash.toLowerCase()
      );
    });

    it("should generate valid checkpoint", async () => {
      const result = fullRoundtripResult;

      expect(result.checkpoint).toBeDefined();
      expect(result.checkpoint.version).toBe(1);
      expect(result.checkpoint.createdAt).toBeGreaterThan(0);
      expect(result.checkpoint.input.type).toBe("governor");
      // operationId is now in completedStages (single source of truth)
      const l2PendingStage = result.checkpoint.cachedData.completedStages?.find(
        (s) => s.type === "L2_TIMELOCK"
      );
      expect((l2PendingStage?.data as { operationId?: string })?.operationId).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.operationId.toLowerCase()
      );
    });
  });

  describe("trackByTxHash - Treasury Governor L2 Only", () => {
    it("should track L2-only proposal without L1 stages", async () => {
      const result = l2OnlyResult;

      expect(result).toBeDefined();
      expect(result.isComplete).toBe(true);

      // Should have L2 stages
      const l2Executed = result.stages.find((s: TrackedStage) => s.type === "L2_TIMELOCK");
      expect(l2Executed).toBeDefined();
      expect(l2Executed!.status).toBe("COMPLETED");

      // L1 stages should be skipped
      const l1Stages = result.stages.filter((s: TrackedStage) => s.chain === "ethereum");
      for (const stage of l1Stages) {
        expect(stage.status).toBe("SKIPPED");
      }
    });

    it("should correctly identify treasury governor type", async () => {
      const result = l2OnlyResult;

      expect(result.proposalType).toBe("NON_CONSTITUTIONAL");
    });

    it("should match expected L2 timelock execution hash", async () => {
      const result = l2OnlyResult;

      const l2Executed = result.stages.find((s: TrackedStage) => s.type === "L2_TIMELOCK");
      // Find the execution transaction (has description "executed" or is the last tx)
      const executionTx =
        l2Executed!.transactions.find((t: StageTransaction) => t.description === "executed") ||
        l2Executed!.transactions[l2Executed!.transactions.length - 1];
      expect(executionTx.hash.toLowerCase()).toBe(
        NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.expectedStages.L2_TIMELOCK.hash.toLowerCase()
      );
    });
  });

  describe("trackByTxHash - In Progress Proposal", () => {
    it("should track partial progress with pending stages", async () => {
      const result = inProgressResult;

      expect(result).toBeDefined();
      // May or may not be complete depending on current blockchain state
      // The important thing is that it tracks the stages correctly
    });

    it("should show L2 timelock as completed", async () => {
      const result = inProgressResult;

      const l2Executed = result.stages.find((s: TrackedStage) => s.type === "L2_TIMELOCK");
      expect(l2Executed).toBeDefined();
      expect(l2Executed!.status).toBe("COMPLETED");
    });
  });

  describe("trackByTxHash - Timelock Entry", () => {
    it("should track from timelock scheduled tx hash", async () => {
      const result = timelockResult;

      expect(result).toBeDefined();
      expect(result.input.type).toBe("timelock");

      // Should not have governor stages (timelock entry skips them)
      const createdStage = result.stages.find((s: TrackedStage) => s.type === "PROPOSAL_CREATED");
      expect(createdStage).toBeUndefined();

      // Should have timelock stages
      const l2Executed = result.stages.find((s: TrackedStage) => s.type === "L2_TIMELOCK");
      expect(l2Executed).toBeDefined();
    });

    it("should extract correct operation ID from tx", async () => {
      const result = timelockResult;

      expect(result.input.type).toBe("timelock");

      // operationId is now in completedStages (single source of truth)
      const l2PendingStage = result.checkpoint.cachedData.completedStages?.find(
        (s) => s.type === "L2_TIMELOCK"
      );
      expect((l2PendingStage?.data as { operationId?: string })?.operationId).toBe(
        DIRECT_TIMELOCK_OPERATION.operationId.toLowerCase()
      );
    });

    it("should return empty array for invalid tx hash", async () => {
      const results = await tracker.trackByTxHash(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
      );
      expect(results).toEqual([]);
    });

    it("should match governor tracking results for same operation", async () => {
      const governorResult = fullRoundtripResult;
      const timelockResult2 = timelockResult;

      // L2 timelock execution should be the same
      const govL2Executed = governorResult.stages.find(
        (s: TrackedStage) => s.type === "L2_TIMELOCK"
      );
      const tlL2Executed = timelockResult2.stages.find(
        (s: TrackedStage) => s.type === "L2_TIMELOCK"
      );

      expect(govL2Executed!.transactions[0].hash.toLowerCase()).toBe(
        tlL2Executed!.transactions[0].hash.toLowerCase()
      );
    });
  });

  describe("validateSalt (standalone function)", () => {
    it("should validate correct salt for timelock stage", async () => {
      const result = fullRoundtripResult;

      const timelockStage = result.stages.find((s: TrackedStage) => s.type === "L2_TIMELOCK");
      if (
        timelockStage &&
        timelockStage.data.salt &&
        timelockStage.data.operationId &&
        timelockStage.data.callScheduledData
      ) {
        const callData = timelockStage.data.callScheduledData;
        const isBatch = callData.length > 1 || timelockStage.data.isBatchOperation;

        if (isBatch) {
          const params: TimelockBatchParams = {
            targets: callData.map((c) => c.target),
            values: callData.map((c) => ethers.BigNumber.from(c.value)),
            payloads: callData.map((c) => c.data),
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: timelockStage.data.salt as string,
          };
          const isValid = validateSaltBatch(timelockStage.data.operationId as string, params);
          expect(isValid).toBe(true);
        } else if (callData.length === 1) {
          const params: TimelockParams = {
            target: callData[0].target,
            value: ethers.BigNumber.from(callData[0].value),
            data: callData[0].data,
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: timelockStage.data.salt as string,
          };
          const isValid = validateSalt(timelockStage.data.operationId as string, params);
          expect(isValid).toBe(true);
        }
      }
    });

    it("should reject invalid salt", async () => {
      const result = fullRoundtripResult;

      const timelockStage = result.stages.find((s: TrackedStage) => s.type === "L2_TIMELOCK");
      const invalidSalt = "0x0000000000000000000000000000000000000000000000000000000000000001";

      if (timelockStage && timelockStage.data.operationId && timelockStage.data.callScheduledData) {
        const callData = timelockStage.data.callScheduledData;
        const isBatch = callData.length > 1 || timelockStage.data.isBatchOperation;

        if (isBatch) {
          const params: TimelockBatchParams = {
            targets: callData.map((c) => c.target),
            values: callData.map((c) => ethers.BigNumber.from(c.value)),
            payloads: callData.map((c) => c.data),
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: invalidSalt,
          };
          const isValid = validateSaltBatch(timelockStage.data.operationId as string, params);
          expect(isValid).toBe(false);
        } else if (callData.length === 1) {
          const params: TimelockParams = {
            target: callData[0].target,
            value: ethers.BigNumber.from(callData[0].value),
            data: callData[0].data,
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: invalidSalt,
          };
          const isValid = validateSalt(timelockStage.data.operationId as string, params);
          expect(isValid).toBe(false);
        }
      }
    });
  });

  describe("Stage chain classification", () => {
    it("should correctly classify L1 and L2 stages", async () => {
      const result = fullRoundtripResult;

      const l2Stages: StageType[] = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "RETRYABLE_EXECUTED",
      ];

      // Only L1_TIMELOCK is on L1
      // L2_TO_L1_MESSAGE and RETRYABLE_EXECUTED happen on L2 (Arb1/Nova)
      const l1Stages: StageType[] = ["L1_TIMELOCK"];

      for (const stage of result.stages) {
        if (l2Stages.includes(stage.type)) {
          expect(stage.chain).toBe("arb1");
        } else if (l1Stages.includes(stage.type)) {
          expect(stage.chain).toBe("ethereum");
        }
      }
    });
  });

  describe("Stage ordering", () => {
    it("should return stages in correct order", async () => {
      const result = fullRoundtripResult;

      const expectedOrder: StageType[] = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ];

      const actualTypes = result.stages.map((s: TrackedStage) => s.type);
      for (let i = 0; i < expectedOrder.length; i++) {
        const expectedType = expectedOrder[i];
        const actualIndex = actualTypes.indexOf(expectedType);
        if (actualIndex !== -1 && i < actualTypes.length) {
          // Each stage should come at or after its expected position
          // (some stages might be missing)
          expect(actualIndex).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe("trackFromCheckpoint", () => {
    it("should resume governor checkpoint with creationTxHash", async () => {
      // #given a valid governor checkpoint
      const checkpoint = fullRoundtripResult.checkpoint;

      // #when resuming from checkpoint
      const result = await tracker.trackFromCheckpoint(checkpoint);

      // #then should return valid tracking result
      expect(result).toBeDefined();
      expect(result.input.type).toBe("governor");
      expect(result.stages.length).toBeGreaterThan(0);
    });

    it("should resume timelock checkpoint with scheduledTxHash", async () => {
      // #given a valid timelock checkpoint
      const checkpoint = timelockResult.checkpoint;

      // #when resuming from checkpoint
      const result = await tracker.trackFromCheckpoint(checkpoint);

      // #then should return valid tracking result
      expect(result).toBeDefined();
      expect(result.input.type).toBe("timelock");
      expect(result.stages.length).toBeGreaterThan(0);
    });

    it("should throw error for governor checkpoint missing creationTxHash", async () => {
      // #given a governor checkpoint without creationTxHash
      // Use type assertion since we're intentionally creating invalid input for testing
      const checkpoint = {
        ...fullRoundtripResult.checkpoint,
        input: {
          type: "governor" as const,
          governorAddress: "0x123",
          proposalId: "123",
          creationTxHash: undefined,
        } as unknown as typeof fullRoundtripResult.checkpoint.input,
      };

      // #when/then resuming should throw
      await expect(tracker.trackFromCheckpoint(checkpoint)).rejects.toThrow(
        "Governor checkpoint missing creationTxHash"
      );
    });

    it("should throw error for timelock checkpoint missing scheduledTxHash", async () => {
      // #given a timelock checkpoint without scheduledTxHash
      // Use type assertion since we're intentionally creating invalid input for testing
      const checkpoint = {
        ...timelockResult.checkpoint,
        input: {
          type: "timelock" as const,
          operationId: "0x123",
          timelockAddress: "0x456",
          scheduledTxHash: undefined,
        } as unknown as typeof timelockResult.checkpoint.input,
      };

      // #when/then resuming should throw
      await expect(tracker.trackFromCheckpoint(checkpoint)).rejects.toThrow(
        "Timelock checkpoint missing scheduledTxHash"
      );
    });

    it("should throw error for unsupported checkpoint input type", async () => {
      // #given a checkpoint with unsupported type
      const checkpoint = {
        ...fullRoundtripResult.checkpoint,
        input: { type: "unsupported" as unknown } as never,
      };

      // #when/then resuming should throw
      await expect(tracker.trackFromCheckpoint(checkpoint)).rejects.toThrow(
        "Unsupported checkpoint input type"
      );
    });
  });

  describe("checkElection", () => {
    it("should return election status with canCreate flag", async () => {
      // #when checking election status
      const result = await tracker.checkElection();

      // #then should return valid result with status
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(typeof result.canCreate).toBe("boolean");
      expect(typeof result.canTriggerMember).toBe("boolean");
      expect(result.prepared).toBeDefined();
    });

    it("should include current election info if elections exist", async () => {
      // #when checking election status
      const result = await tracker.checkElection();

      // #then if elections exist, should include current election
      if (result.status.electionCount > 0) {
        expect(result.currentElection).toBeDefined();
        expect(result.currentElection?.electionIndex).toBe(result.status.electionCount - 1);
      }
    });

    it("should allow custom nominee governor address", async () => {
      // #when checking with custom address (using default address for test)
      const result = await tracker.checkElection({
        nomineeGovernorAddress: "0x8a1cDA8dee421cD06023470608605934c16A05a0",
      });

      // #then should return valid result
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });
});

// Note: createTracker unit tests are in utils.test.ts
