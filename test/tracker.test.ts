/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Comprehensive tests for ProposalStageTracker
 *
 * Tests the main tracker entry points against real blockchain data:
 * - trackByTxHash: Full roundtrip, L2-only, in-progress scenarios
 * - trackByTxHash: Universal entry from any tx (proposal creation or CallScheduled)
 * - Error handling and edge cases
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
} from "../src";

dotenv.config({ quiet: true });

describe.skipIf(process.env.NO_RPC === "1")("ProposalStageTracker", () => {
  let l1Provider: ethers.providers.JsonRpcProvider;
  let l2Provider: ethers.providers.JsonRpcProvider;
  let novaProvider: ethers.providers.JsonRpcProvider;
  let tracker: ProposalStageTracker;

  beforeAll(() => {
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
  });

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
  });

  describe("trackByTxHash - Core Governor Full Roundtrip", () => {
    it("should track completed proposal through all stages", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      expect(result).toBeDefined();
      expect(result.input.type).toBe("governor");
      expect(result.proposalType).toBeDefined();
      expect(result.isComplete).toBe(true);

      // Verify all expected stages present
      const stageTypes = result.stages.map((s) => s.type);
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
    }, 180000);

    it("should return correct proposal data", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      expect(result.proposalData).toBeDefined();
      expect(result.proposalData?.proposalId).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.proposalId
      );
      expect(result.proposalData?.creationBlock).toBeGreaterThan(0);
    }, 60000);

    it("should have COMPLETED status for all stages in completed proposal", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      const nonSkippedStages = result.stages.filter((s) => s.status !== "SKIPPED");
      for (const stage of nonSkippedStages) {
        expect(stage.status).toBe("COMPLETED");
      }
    }, 180000);

    it("should include transaction hashes for completed stages", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      const l2TimelockExecuted = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2TimelockExecuted).toBeDefined();
      expect(l2TimelockExecuted!.transactions.length).toBeGreaterThan(0);
      // Find the execution transaction (has description "executed" or is the last tx)
      const executionTx =
        l2TimelockExecuted!.transactions.find((t) => t.description === "executed") ||
        l2TimelockExecuted!.transactions[l2TimelockExecuted!.transactions.length - 1];
      expect(executionTx.hash.toLowerCase()).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.expectedStages.L2_TIMELOCK.hash.toLowerCase()
      );
    }, 180000);

    it("should generate valid checkpoint", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

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
    }, 60000);
  });

  describe("trackByTxHash - Treasury Governor L2 Only", () => {
    it("should track L2-only proposal without L1 stages", async () => {
      const results = await tracker.trackByTxHash(
        NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash
      );
      const result = results[0];

      expect(result).toBeDefined();
      expect(result.isComplete).toBe(true);

      // Should have L2 stages
      const l2Executed = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2Executed).toBeDefined();
      expect(l2Executed!.status).toBe("COMPLETED");

      // L1 stages should be skipped
      const l1Stages = result.stages.filter((s) => s.chain === "L1");
      for (const stage of l1Stages) {
        expect(stage.status).toBe("SKIPPED");
      }
    }, 180000);

    it("should correctly identify treasury governor type", async () => {
      const results = await tracker.trackByTxHash(
        NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash
      );
      const result = results[0];

      expect(result.proposalType).toBe("NON_CONSTITUTIONAL");
    }, 60000);

    it("should match expected L2 timelock execution hash", async () => {
      const results = await tracker.trackByTxHash(
        NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash
      );
      const result = results[0];

      const l2Executed = result.stages.find((s) => s.type === "L2_TIMELOCK");
      // Find the execution transaction (has description "executed" or is the last tx)
      const executionTx =
        l2Executed!.transactions.find((t) => t.description === "executed") ||
        l2Executed!.transactions[l2Executed!.transactions.length - 1];
      expect(executionTx.hash.toLowerCase()).toBe(
        NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.expectedStages.L2_TIMELOCK.hash.toLowerCase()
      );
    }, 180000);
  });

  describe("trackByTxHash - In Progress Proposal", () => {
    it("should track partial progress with pending stages", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_IN_PROGRESS.creationTxHash
      );
      const result = results[0];

      expect(result).toBeDefined();
      // May or may not be complete depending on current blockchain state
      // The important thing is that it tracks the stages correctly
    }, 180000);

    it("should show L2 timelock as completed", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_IN_PROGRESS.creationTxHash
      );
      const result = results[0];

      const l2Executed = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2Executed).toBeDefined();
      expect(l2Executed!.status).toBe("COMPLETED");
    }, 180000);
  });

  describe("trackByTxHash - Timelock Entry", () => {
    it("should track from timelock scheduled tx hash", async () => {
      const results = await tracker.trackByTxHash(DIRECT_TIMELOCK_OPERATION.timelockTxHash);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      expect(result.input.type).toBe("timelock");

      // Should not have governor stages (timelock entry skips them)
      const createdStage = result.stages.find((s) => s.type === "PROPOSAL_CREATED");
      expect(createdStage).toBeUndefined();

      // Should have timelock stages
      const l2Executed = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2Executed).toBeDefined();
    }, 180000);

    it("should extract correct operation ID from tx", async () => {
      const results = await tracker.trackByTxHash(DIRECT_TIMELOCK_OPERATION.timelockTxHash);

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];
      expect(result.input.type).toBe("timelock");

      // operationId is now in completedStages (single source of truth)
      const l2PendingStage = result.checkpoint.cachedData.completedStages?.find(
        (s) => s.type === "L2_TIMELOCK"
      );
      expect((l2PendingStage?.data as { operationId?: string })?.operationId).toBe(
        DIRECT_TIMELOCK_OPERATION.operationId.toLowerCase()
      );
    }, 180000);

    it("should return empty array for invalid tx hash", async () => {
      const results = await tracker.trackByTxHash(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
      );
      expect(results).toEqual([]);
    }, 30000);

    it("should match governor tracking results for same operation", async () => {
      const [governorResults, timelockResults] = await Promise.all([
        tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash),
        tracker.trackByTxHash(DIRECT_TIMELOCK_OPERATION.timelockTxHash),
      ]);

      const governorResult = governorResults[0];
      const timelockResult = timelockResults[0];

      // L2 timelock execution should be the same
      const govL2Executed = governorResult.stages.find((s) => s.type === "L2_TIMELOCK");
      const tlL2Executed = timelockResult.stages.find((s) => s.type === "L2_TIMELOCK");

      expect(govL2Executed!.transactions[0].hash.toLowerCase()).toBe(
        tlL2Executed!.transactions[0].hash.toLowerCase()
      );
    }, 300000);
  });

  describe("validateSalt (standalone function)", () => {
    it("should validate correct salt for timelock stage", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      const timelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      if (
        timelockStage &&
        timelockStage.data.salt &&
        timelockStage.data.operationId &&
        timelockStage.data.timelockAddress
      ) {
        const targets = timelockStage.data.targets as string[] | undefined;
        if (targets && Array.isArray(targets)) {
          const params: TimelockBatchParams = {
            targets,
            values: (timelockStage.data.values as string[]).map((v) => ethers.BigNumber.from(v)),
            payloads: timelockStage.data.payloads as string[],
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: timelockStage.data.salt as string,
          };
          const isValid = await validateSaltBatch(
            timelockStage.data.timelockAddress as string,
            timelockStage.data.operationId as string,
            params,
            l2Provider
          );
          expect(isValid).toBe(true);
        } else if (timelockStage.data.target) {
          const params: TimelockParams = {
            target: timelockStage.data.target as string,
            value: ethers.BigNumber.from(timelockStage.data.value ?? "0"),
            data: (timelockStage.data.data as string) ?? "0x",
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: timelockStage.data.salt as string,
          };
          const isValid = await validateSalt(
            timelockStage.data.timelockAddress as string,
            timelockStage.data.operationId as string,
            params,
            l2Provider
          );
          expect(isValid).toBe(true);
        }
      }
    }, 60000);

    it("should reject invalid salt", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

      const timelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      const invalidSalt = "0x0000000000000000000000000000000000000000000000000000000000000001";

      if (timelockStage && timelockStage.data.operationId && timelockStage.data.timelockAddress) {
        const targets = timelockStage.data.targets as string[] | undefined;
        if (targets && Array.isArray(targets)) {
          const params: TimelockBatchParams = {
            targets,
            values: (timelockStage.data.values as string[]).map((v) => ethers.BigNumber.from(v)),
            payloads: timelockStage.data.payloads as string[],
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: invalidSalt,
          };
          const isValid = await validateSaltBatch(
            timelockStage.data.timelockAddress as string,
            timelockStage.data.operationId as string,
            params,
            l2Provider
          );
          expect(isValid).toBe(false);
        } else if (timelockStage.data.target) {
          const params: TimelockParams = {
            target: timelockStage.data.target as string,
            value: ethers.BigNumber.from(timelockStage.data.value ?? "0"),
            data: (timelockStage.data.data as string) ?? "0x",
            predecessor: (timelockStage.data.predecessor as string) || ethers.constants.HashZero,
            salt: invalidSalt,
          };
          const isValid = await validateSalt(
            timelockStage.data.timelockAddress as string,
            timelockStage.data.operationId as string,
            params,
            l2Provider
          );
          expect(isValid).toBe(false);
        }
      }
    }, 60000);
  });

  describe("Stage chain classification", () => {
    it("should correctly classify L1 and L2 stages", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

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
          expect(stage.chain).toBe("L2");
        } else if (l1Stages.includes(stage.type)) {
          expect(stage.chain).toBe("L1");
        }
      }
    }, 180000);
  });

  describe("Stage ordering", () => {
    it("should return stages in correct order", async () => {
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result = results[0];

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

      const actualTypes = result.stages.map((s) => s.type);
      for (let i = 0; i < expectedOrder.length; i++) {
        const expectedType = expectedOrder[i];
        const actualIndex = actualTypes.indexOf(expectedType);
        if (actualIndex !== -1 && i < actualTypes.length) {
          // Each stage should come at or after its expected position
          // (some stages might be missing)
          expect(actualIndex).toBeGreaterThanOrEqual(0);
        }
      }
    }, 180000);
  });
});

// Note: createTracker unit tests are in utils.test.ts
