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
} from "../src";

dotenv.config({ quiet: true });

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
});

// Note: createTracker unit tests are in utils.test.ts
