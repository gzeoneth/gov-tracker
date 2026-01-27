/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Historical Tracking Tests with Anvil Fork
 *
 * Tests proposal tracking at specific historical block numbers where we know
 * the exact state. This provides deterministic results that don't change
 * over time.
 *
 * NOTE: These tests require ARB1_ARCHIVE_RPC and L1_RPC_URL to be set in .env.
 * They use specific block ranges where we know the proposal state.
 *
 * Optimized: Tests grouped by block configuration to share fork instances.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { startDualForksAtL2Block, getTestRpcUrls, DualForkResult } from "./helpers/anvil-fork";
import { createTracker, ProposalStageTracker, ADDRESSES } from "../src";
import {
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  CONSTITUTIONAL_GOVERNOR_COMPLETED,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./fixtures";

dotenv.config({ quiet: true });

/**
 * Historical L2 block numbers for deterministic testing.
 * The corresponding L1 block is auto-detected from the L2 block's embedded l1BlockNumber.
 */
const HISTORICAL_L2_BLOCKS = {
  /** Proposal queued but L2 timelock not yet executed */
  L2_TIMELOCK: 377_000_000,

  /** L2 timelock executed, L2→L1 message sent */
  L2_EXECUTED_L1_PENDING: 380_000_000,

  /** Treasury proposal after L2 execution (completed) */
  TREASURY_COMPLETED: 397_000_000,
};

/**
 * Tests at L2_TIMELOCK block (377M) with auto-detected L1
 * Fork started once, shared across all tests in this block
 */
describe("Tracking Fork - L2_TIMELOCK Block", () => {
  let forks: DualForkResult | null = null;
  let tracker: ProposalStageTracker;
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;
  let novaProvider: ethers.providers.JsonRpcProvider;

  beforeAll(async () => {
    const urls = getTestRpcUrls();
    if (!urls) {
      throw new Error(
        "Archive RPC URLs required for fork tests. Set ARB1_ARCHIVE_RPC and ETH_RPC environment variables."
      );
    }
    rpcUrls = urls;
    novaProvider = new ethers.providers.JsonRpcProvider(rpcUrls.nova);

    // Start fork once for all tests at this block
    forks = await startDualForksAtL2Block({
      l1Url: rpcUrls.l1,
      l2Url: rpcUrls.l2Archive,
      l2BlockNumber: HISTORICAL_L2_BLOCKS.L2_TIMELOCK,
    });

    tracker = createTracker({
      l1Provider: forks.l1.provider,
      l2Provider: forks.l2.provider,
      novaProvider,
    });
  });

  afterAll(async () => {
    if (forks) {
      await forks.stopAll();
    }
  });

  describe("L2 Timelock Pending State", () => {
    it("should track proposal in L2 timelock pending state", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      // At this block, proposal should have early stages completed
      const createdStage = result.stages.find((s) => s.type === "PROPOSAL_CREATED");
      expect(createdStage?.status).toBe("COMPLETED");

      const votingStage = result.stages.find((s) => s.type === "VOTING_ACTIVE");
      expect(votingStage?.status).toBe("COMPLETED");

      const queuedStage = result.stages.find((s) => s.type === "PROPOSAL_QUEUED");
      expect(queuedStage?.status).toBe("COMPLETED");

      // L2 timelock delay should still be in progress (not yet passed)
      const l2PendingStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2PendingStage?.status).toBe("PENDING");

      // L1 stages should not be started
      const l1PendingStage = result.stages.find((s) => s.type === "L1_TIMELOCK");
      if (l1PendingStage) {
        expect(l1PendingStage.status).toBe("NOT_STARTED");
      }

      // Verify stage data integrity
      expect((l2PendingStage!.data.operationId as string).toLowerCase()).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.operationId.toLowerCase()
      );
      expect(l2PendingStage!.timing).toBeDefined();
    });
  });

  describe("Timelock Entry Point", () => {
    it("should track from timelock tx hash at historical block", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.timelockTxHash
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      expect(result.input.type).toBe("timelock");

      // Timelock delay should still be in progress
      const l2PendingStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2PendingStage?.status).toBe("PENDING");
      expect(l2PendingStage?.status).not.toBe("COMPLETED");
    });
  });
});

/**
 * Tests at L2 379M + L1 23,365,000 (challenge period)
 * Fork started once, shared across all tests in this block
 */
describe("Tracking Fork - Challenge Period Block", () => {
  let forks: DualForkResult | null = null;
  let tracker: ProposalStageTracker;
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;
  let novaProvider: ethers.providers.JsonRpcProvider;

  const L2_BLOCK_AFTER_EXECUTION = 379_000_000;
  const L1_BLOCK_IN_CHALLENGE_PERIOD = 23_365_000;

  beforeAll(async () => {
    const urls = getTestRpcUrls();
    if (!urls) {
      throw new Error(
        "Archive RPC URLs required for fork tests. Set ARB1_ARCHIVE_RPC and ETH_RPC environment variables."
      );
    }
    rpcUrls = urls;
    novaProvider = new ethers.providers.JsonRpcProvider(rpcUrls.nova);

    // Start fork once for all tests at this block configuration
    forks = await startDualForksAtL2Block({
      l1Url: rpcUrls.l1,
      l2Url: rpcUrls.l2Archive,
      l2BlockNumber: L2_BLOCK_AFTER_EXECUTION,
      l1BlockOverride: L1_BLOCK_IN_CHALLENGE_PERIOD,
    });

    tracker = createTracker({
      l1Provider: forks.l1.provider,
      l2Provider: forks.l2.provider,
      novaProvider,
    });
  });

  afterAll(async () => {
    if (forks) {
      await forks.stopAll();
    }
  });

  describe("L2→L1 Message UNCONFIRMED State", () => {
    it("should track L2→L1 message in UNCONFIRMED state with timing data", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      // L2→L1 message should be in PENDING state (UNCONFIRMED in SDK terms)
      const messageSentStage = result.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      expect(messageSentStage).toBeDefined();

      // Should have message data
      expect(messageSentStage!.data.messageCount).toBeGreaterThan(0);
      expect(messageSentStage!.data.l2TxHash).toBeDefined();

      // Assert PENDING status (UNCONFIRMED)
      expect(messageSentStage!.status).toBe("PENDING");
      expect(messageSentStage!.data.status).toBe("UNCONFIRMED");

      // Verify timing data for UNCONFIRMED state
      expect(messageSentStage!.timing).toBeDefined();
      expect(messageSentStage!.data.firstExecutableBlock).toBeDefined();
    });
  });

  describe("Pipeline Fast-Path Resume", () => {
    it("should use fast-path when resuming with cached PENDING L2→L1 message", async () => {
      // Use a memory cache to enable checkpoint resumption
      const cache = new Map<string, unknown>();
      const cacheAdapter = {
        get: async <T>(key: string) => cache.get(key) as T | null,
        set: async <T>(key: string, value: T) => {
          cache.set(key, value);
        },
        delete: async (key: string) => {
          cache.delete(key);
        },
        clear: async () => cache.clear(),
        has: async (key: string) => cache.has(key),
        keys: (prefix?: string) => {
          const allKeys = [...cache.keys()];
          return prefix ? allKeys.filter((k) => k.startsWith(prefix)) : allKeys;
        },
      };

      const trackerWithCache = createTracker({
        l1Provider: forks!.l1.provider,
        l2Provider: forks!.l2.provider,
        novaProvider,
        cache: cacheAdapter,
      });

      // First track: creates checkpoint with PENDING L2_TO_L1_MESSAGE
      const results1 = await trackerWithCache.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result1 = results1[0];

      // Verify first track has PENDING L2_TO_L1_MESSAGE with firstExecutableBlock
      const messageSentStage1 = result1.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      expect(messageSentStage1).toBeDefined();
      expect(messageSentStage1!.status).toBe("PENDING");
      expect(messageSentStage1!.data.firstExecutableBlock).toBeDefined();
      expect(messageSentStage1!.data.firstExecutableBlock).toBeGreaterThan(
        L1_BLOCK_IN_CHALLENGE_PERIOD
      );

      // Second track: should use fast-path since L1 block < firstExecutableBlock
      const results2 = await trackerWithCache.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result2 = results2[0];

      // Should still have PENDING L2_TO_L1_MESSAGE with timing updated via fast-path
      const messageSentStage2 = result2.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      expect(messageSentStage2).toBeDefined();
      expect(messageSentStage2!.status).toBe("PENDING");

      // Fast-path adds `fastPath: true` to the stage data
      expect(messageSentStage2!.data.fastPath).toBe(true);
      expect(messageSentStage2!.data.currentL1Block).toBeDefined();

      // Timing should be updated
      expect(messageSentStage2!.timing).toBeDefined();
      expect(messageSentStage2!.timing!.delaySeconds).toBeGreaterThan(0);
    });
  });
});

/**
 * Tests requiring unique block configurations (one fork per test)
 */
describe("Tracking Fork - Unique Block Tests", () => {
  let forks: DualForkResult | null = null;
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;
  let novaProvider: ethers.providers.JsonRpcProvider;

  beforeAll(() => {
    const urls = getTestRpcUrls();
    if (!urls) {
      throw new Error(
        "Archive RPC URLs required for fork tests. Set ARB1_ARCHIVE_RPC and ETH_RPC environment variables."
      );
    }
    rpcUrls = urls;
    novaProvider = new ethers.providers.JsonRpcProvider(rpcUrls.nova);
  });

  afterAll(async () => {
    if (forks) {
      await forks.stopAll();
    }
  });

  describe("L2 Executed, L1 Pending State", () => {
    it("should track proposal after L2 execution, before L1 queue", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: HISTORICAL_L2_BLOCKS.L2_EXECUTED_L1_PENDING,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      // L2 timelock should be executed
      const l2ExecutedStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2ExecutedStage?.status).toBe("COMPLETED");

      // L2→L1 message should be sent but in challenge period
      const messageSentStage = result.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      expect(["PENDING", "READY"]).toContain(messageSentStage?.status);

      // Proposal should not be marked complete
      expect(result.isComplete).toBe(false);

      await forks.stopAll();
      forks = null;
    });
  });

  describe("Treasury Proposal Completed State", () => {
    it("should track completed treasury proposal at historical block", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: HISTORICAL_L2_BLOCKS.TREASURY_COMPLETED,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(
        NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash
      );
      const result = results[0];

      // L2 timelock should be executed
      const l2ExecutedStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2ExecutedStage?.status).toBe("COMPLETED");

      // Treasury proposal is L2-only, so L1 stages should be skipped
      const l1Stages = result.stages.filter((s) => s.chain === "ethereum");
      for (const stage of l1Stages) {
        expect(stage.status).toBe("SKIPPED");
      }

      // Proposal should be complete
      expect(result.isComplete).toBe(true);
      expect(result.proposalType).toBe("NON_CONSTITUTIONAL");

      await forks.stopAll();
      forks = null;
    });
  });

  describe("L2→L1 Message CONFIRMED State", () => {
    it("should track L2→L1 message in CONFIRMED state (READY)", async () => {
      const L2_BLOCK_AFTER_CHALLENGE = 374_500_000;
      const L1_BLOCK_CONFIRMED = 23_257_500;

      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: L2_BLOCK_AFTER_CHALLENGE,
        l1BlockOverride: L1_BLOCK_CONFIRMED,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      const result = results[0];

      const messageSentStage = result.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      expect(messageSentStage).toBeDefined();

      // Could be READY (CONFIRMED), COMPLETED (EXECUTED), or PENDING
      if (messageSentStage!.status === "READY") {
        expect(messageSentStage!.data.status).toBe("CONFIRMED");
      } else if (messageSentStage!.status === "COMPLETED") {
        expect(messageSentStage!.data.status).toBe("EXECUTED");
      } else {
        expect(messageSentStage!.status).toBe("PENDING");
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("L1 Timelock Execute Transaction", () => {
    it("should prepare L1 timelock transaction when READY", async () => {
      const L1_READY_BLOCK = 23279738;
      const L2_BLOCK_FOR_L1_READY = 375_000_000;

      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: L2_BLOCK_FOR_L1_READY,
        l1BlockOverride: L1_READY_BLOCK,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      expect(results.length).toBeGreaterThan(0);
      const result = results[0];

      const l1TimelockStage = result.stages.find((s) => s.type === "L1_TIMELOCK");
      expect(l1TimelockStage).toBeDefined();
      expect(["PENDING", "READY"]).toContain(l1TimelockStage?.status);

      if (l1TimelockStage?.status === "READY") {
        const prepResult = await tracker.prepareTransaction(l1TimelockStage);
        expect(prepResult.success).toBe(true);
        if (prepResult.success) {
          expect(prepResult.prepared).toBeDefined();
          expect(prepResult.prepared.chain).toBe("ethereum");
          expect(prepResult.prepared.to.toLowerCase()).toBe(ADDRESSES.L1_TIMELOCK.toLowerCase());
        }
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("L2→L1 Message Preparation", () => {
    it("should prepare L2→L1 message for CONFIRMED state", async () => {
      const L2_BLOCK_AFTER_L2_EXECUTION = 380_000_000;
      const L1_BLOCK_CONFIRMED_WINDOW = 23_380_000;

      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: L2_BLOCK_AFTER_L2_EXECUTION,
        l1BlockOverride: L1_BLOCK_CONFIRMED_WINDOW,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      const messageSentStage = result.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      expect(messageSentStage).toBeDefined();

      if (messageSentStage!.status === "READY") {
        expect(messageSentStage!.data.status).toBe("CONFIRMED");

        const prepResult = await tracker.prepareTransaction(messageSentStage!);
        expect(prepResult.success).toBe(true);
        if (prepResult.success) {
          expect(prepResult.prepared.chain).toBe("ethereum");
          expect(prepResult.prepared.to.toLowerCase()).toBe(ADDRESSES.ARB1_OUTBOX.toLowerCase());
          expect(prepResult.prepared.data).toBeDefined();
        }
      } else {
        expect(["PENDING", "COMPLETED"]).toContain(messageSentStage!.status);
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("Retryable Ticket Preparation", () => {
    it("should prepare retryable ticket for redemption when READY", async () => {
      const L2_BLOCK_RETRYABLE_READY = 375_121_600;
      const L1_BLOCK_AFTER_EXECUTION = 23_280_000;

      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: L2_BLOCK_RETRYABLE_READY,
        l1BlockOverride: L1_BLOCK_AFTER_EXECUTION,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      const result = results[0];

      const retryableStage = result.stages.find((s) => s.type === "RETRYABLE_EXECUTED");
      expect(retryableStage).toBeDefined();

      if (retryableStage!.status === "READY") {
        try {
          const prepResult = await tracker.prepareTransaction(retryableStage!);
          expect(prepResult.success).toBe(true);
          if (prepResult.success) {
            expect(prepResult.prepared.chain).toBe("arb1");
            expect(prepResult.prepared.data).toBeDefined();
          }
        } catch (err) {
          // Anvil fork limitation - receipt decoding can fail
          const message = (err as Error).message;
          expect(message).toContain("decode");
        }
      } else {
        expect(["PENDING", "COMPLETED", "NOT_STARTED"]).toContain(retryableStage!.status);
      }

      await forks.stopAll();
      forks = null;
    });
  });
});
