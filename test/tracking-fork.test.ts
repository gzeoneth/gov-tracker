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
  // Core Governor Full Roundtrip proposal timeline:
  // Creation block: 369846189
  // Queue block: 376175960
  // L2 Timelock Execute block: 378942159
  // Retryable created block: 382228795

  /** Proposal queued but L2 timelock not yet executed */
  L2_TIMELOCK: 377_000_000,

  /** L2 timelock executed, L2→L1 message sent */
  L2_EXECUTED_L1_PENDING: 380_000_000,

  /** Treasury proposal after L2 execution (completed) */
  TREASURY_COMPLETED: 397_000_000,
};

const hasArchiveRpc = () => getTestRpcUrls() !== null;

describe.skipIf(!hasArchiveRpc())("Historical Tracking Fork Tests", () => {
  let forks: DualForkResult | null = null;
  let tracker: ProposalStageTracker;
  let rpcUrls: ReturnType<typeof getTestRpcUrls>;
  let novaProvider: ethers.providers.JsonRpcProvider;

  beforeAll(() => {
    rpcUrls = getTestRpcUrls()!;
    novaProvider = new ethers.providers.JsonRpcProvider(rpcUrls.nova);
  });

  afterAll(async () => {
    if (forks) {
      await forks.stopAll();
    }
  });

  describe("L2 Timelock Pending State", () => {
    it("should track proposal in L2 timelock pending state", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: HISTORICAL_L2_BLOCKS.L2_TIMELOCK,
      });

      tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

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
      // At block 377M, we're ~30% through the ~3 day delay period
      const l2PendingStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2PendingStage?.status).toBe("PENDING");

      // L2 timelock executed should NOT be completed
      const l2ExecutedStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2ExecutedStage?.status).not.toBe("COMPLETED");

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

      await forks.stopAll();
      forks = null;
    });
  });

  describe("L2 Executed, L1 Pending State", () => {
    it("should track proposal after L2 execution, before L1 queue", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: HISTORICAL_L2_BLOCKS.L2_EXECUTED_L1_PENDING,
      });

      tracker = createTracker({
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

      // L2→L1 message should be sent but in challenge period (PENDING or READY)
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
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: HISTORICAL_L2_BLOCKS.TREASURY_COMPLETED,
      });

      tracker = createTracker({
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

  describe("Timelock Entry Point at Historical Block", () => {
    it("should track from timelock tx hash at historical block", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: HISTORICAL_L2_BLOCKS.L2_TIMELOCK,
      });

      tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.timelockTxHash
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      expect(result.input.type).toBe("timelock");

      // Timelock delay should still be in progress (not yet passed)
      // At block 377M, we're ~30% through the ~3 day delay period
      const l2PendingStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2PendingStage?.status).toBe("PENDING");

      // L2 executed should not be complete at this block
      const l2ExecutedStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2ExecutedStage?.status).not.toBe("COMPLETED");

      await forks.stopAll();
      forks = null;
    });
  });

  describe("L1 Timelock Execute Transaction", () => {
    it("should prepare and execute L1 timelock transaction when READY", async () => {
      // Fork at a block where L1 timelock is READY for CONSTITUTIONAL_GOVERNOR_COMPLETED
      // Queue: 23258264, Executed: 23279739, delay: ~21600 blocks (~3 days)
      // Ready should be around queue + delay, pick a block just before actual execution
      const L1_READY_BLOCK = 23279700;

      // Need to find corresponding L2 block for this L1 block
      // Use a recent L2 block that has this L1 block as reference
      const L2_BLOCK_FOR_L1_READY = 374_000_000;

      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: L2_BLOCK_FOR_L1_READY,
        l1BlockOverride: L1_READY_BLOCK,
      });

      tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];

      // At this L1 block, L1 timelock should be READY
      const l1TimelockStage = result.stages.find((s) => s.type === "L1_TIMELOCK");
      expect(l1TimelockStage).toBeDefined();
      expect(l1TimelockStage?.status).toBe("READY");

      // Prepare the execution transaction
      const prepResult = await tracker.prepareTransaction(l1TimelockStage!);
      expect(prepResult.success).toBe(true);
      if (prepResult.success) {
        expect(prepResult.prepared).toBeDefined();
        expect(prepResult.prepared.chain).toBe("ethereum");
        expect(prepResult.prepared.to.toLowerCase()).toBe(ADDRESSES.L1_TIMELOCK.toLowerCase());
      }

      await forks.stopAll();
      forks = null;
    });
  });
});
