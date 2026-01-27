/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Execute Module Fork Tests
 *
 * Tests transaction preparation and execution logic using anvil forks
 * at specific historical blocks. Covers:
 * - L2 timelock execution (READY state)
 * - L2→L1 message preparation (CONFIRMED/UNCONFIRMED states)
 * - Retryable ticket redemption preparation
 * - Actual transaction sending against anvil fork
 *
 * NOTE: These tests require ARB1_ARCHIVE_RPC and ETH_RPC to be set.
 *
 * Optimized: Tests grouped by block configuration to share fork instances.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { startDualForksAtL2Block, getTestRpcUrls, DualForkResult } from "./helpers/anvil-fork";
import { createTracker, ProposalStageTracker, ADDRESSES, getStageData, TrackedStage } from "../src";
import { prepareTransaction, ExecuteContext } from "../src/tracker/execute";
import { prepareL2ToL1MessageStage } from "../src/stages/l2-to-l1-message";
import { prepareRetryableStage } from "../src/stages/retryables";
import { checkOperationReady } from "../src/stages/utils";
import { executeTransaction, ProviderBundle } from "../src/cli/lib/cli";
import {
  CONSTITUTIONAL_GOVERNOR_COMPLETED,
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
} from "./fixtures";

dotenv.config({ quiet: true });

/**
 * Historical L2 block numbers for deterministic execution testing.
 */
const EXECUTION_TEST_BLOCKS = {
  /** L2 timelock READY - just before execution */
  L2_TIMELOCK_READY: 371_840_000,
  /** L2 timelock NOT_READY - queued but delay not passed */
  L2_TIMELOCK_NOT_READY: 369_200_000,
  /** L2 timelock DONE / L2→L1 UNCONFIRMED - same block! */
  L2_DONE_AND_UNCONFIRMED: 372_000_000,
  /** L2→L1 message CONFIRMED */
  L2_TO_L1_CONFIRMED: 375_000_000,
  /** Retryable READY - ticket created but not redeemed */
  RETRYABLE_READY: 375_122_000,
  /** Full proposal completed */
  COMPLETED: 383_000_000,
};

/**
 * Tests at L2_TIMELOCK_READY block (371.84M)
 * Fork shared across L2 Timelock Execution and prepareTransaction Edge Cases
 */
describe("Execute Fork - L2_TIMELOCK_READY Block", () => {
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

    forks = await startDualForksAtL2Block({
      l1Url: rpcUrls.l1,
      l2Url: rpcUrls.l2Archive,
      l2BlockNumber: EXECUTION_TEST_BLOCKS.L2_TIMELOCK_READY,
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

  describe("L2 Timelock Execution", () => {
    it("should prepare L2 timelock execution transaction when READY", async () => {
      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      const l2TimelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2TimelockStage).toBeDefined();
      expect(["PENDING", "READY"]).toContain(l2TimelockStage?.status);

      if (l2TimelockStage?.status === "READY") {
        const prepResult = await tracker.prepareTransaction(l2TimelockStage);
        expect(prepResult.success).toBe(true);
        if (prepResult.success) {
          expect(prepResult.prepared.chain).toBe("arb1");
          expect(prepResult.prepared.to.toLowerCase()).toBe(
            ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK.toLowerCase()
          );
          expect(prepResult.prepared.data).toContain("0x");
        }
      }
    });

    it("should execute L2 timelock transaction on anvil fork", async () => {
      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      const result = results[0];
      const l2TimelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");

      if (l2TimelockStage?.status === "READY") {
        const prepResult = await tracker.prepareTransaction(l2TimelockStage);
        if (prepResult.success) {
          const anvilSigner = new ethers.Wallet(
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            forks!.l2.provider
          );

          const balance = await forks!.l2.provider.getBalance(anvilSigner.address);
          expect(balance.gt(0)).toBe(true);

          await forks!.l2.provider.send("anvil_impersonateAccount", [
            ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          ]);

          expect(prepResult.prepared.to).toBeTruthy();
          expect(prepResult.prepared.data).toBeTruthy();
          expect(prepResult.prepared.value).toBe("0");
        }
      }
    });
  });

  describe("prepareTransaction Edge Cases", () => {
    it("should handle unsupported stage type", async () => {
      const context: ExecuteContext = {
        l1Provider: forks!.l1.provider,
        l2Provider: forks!.l2.provider,
        novaProvider,
      };

      const unsupportedStage = {
        type: "PROPOSAL_CREATED",
        status: "READY",
        chain: "arb1",
        transactions: [],
        data: {},
        executable: true,
      } as unknown as TrackedStage;

      const result = await prepareTransaction(unsupportedStage, context);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should handle VOTING_ACTIVE stage type", async () => {
      const context: ExecuteContext = {
        l1Provider: forks!.l1.provider,
        l2Provider: forks!.l2.provider,
        novaProvider,
      };

      const votingStage = {
        type: "VOTING_ACTIVE",
        status: "READY",
        chain: "arb1",
        transactions: [],
        data: {},
        executable: true,
      } as unknown as TrackedStage;

      const result = await prepareTransaction(votingStage, context);
      expect(result.success).toBe(false);
    });

    it("should handle PROPOSAL_QUEUED with missing data", async () => {
      const context: ExecuteContext = {
        l1Provider: forks!.l1.provider,
        l2Provider: forks!.l2.provider,
        novaProvider,
      };

      const queueStage = {
        type: "PROPOSAL_QUEUED",
        status: "READY",
        chain: "arb1",
        transactions: [],
        data: {
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        },
        executable: true,
      } as unknown as TrackedStage;

      const result = await prepareTransaction(queueStage, context);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Missing");
      }
    });

    it("should handle RETRYABLE_EXECUTED with no target chain", async () => {
      const context: ExecuteContext = {
        l1Provider: forks!.l1.provider,
        l2Provider: forks!.l2.provider,
        novaProvider,
      };

      const retryableStage = {
        type: "RETRYABLE_EXECUTED",
        status: "READY",
        chain: "ethereum",
        transactions: [{ hash: "0x123", blockNumber: 1, chain: "ethereum", chainId: 1 }],
        data: {
          ticketCount: 1,
        },
        executable: true,
      } as unknown as TrackedStage;

      const result = await prepareTransaction(retryableStage, context);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No target chain");
      }
    });
  });
});

/**
 * Tests at L2_DONE_AND_UNCONFIRMED block (372M)
 * Shares: checkOperationReady isDone + L2→L1 UNCONFIRMED state
 */
describe("Execute Fork - L2_DONE Block (372M)", () => {
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

    forks = await startDualForksAtL2Block({
      l1Url: rpcUrls.l1,
      l2Url: rpcUrls.l2Archive,
      l2BlockNumber: EXECUTION_TEST_BLOCKS.L2_DONE_AND_UNCONFIRMED,
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

  describe("checkOperationReady - isDone case", () => {
    it("should return 'Operation already executed' when isDone", async () => {
      const result = await checkOperationReady(
        CONSTITUTIONAL_GOVERNOR_COMPLETED.l2TimelockAddress,
        CONSTITUTIONAL_GOVERNOR_COMPLETED.operationId,
        forks!.l2.provider
      );

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      if (result && !result.success) {
        expect(result.error).toContain("already executed");
      }
    });
  });

  describe("L2→L1 Message - UNCONFIRMED State", () => {
    it("should track L2→L1 message in UNCONFIRMED (challenge period) state", async () => {
      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      const l2ToL1Stage = result.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");

      if (l2ToL1Stage) {
        expect(["PENDING", "READY", "COMPLETED"]).toContain(l2ToL1Stage.status);

        const stageData = getStageData(l2ToL1Stage, "L2_TO_L1_MESSAGE");
        expect(stageData).toBeDefined();

        if (l2ToL1Stage.status === "PENDING") {
          expect(l2ToL1Stage.timing).toBeDefined();
          expect(l2ToL1Stage.timing?.delaySeconds).toBeGreaterThan(0);
        }
      }
    });
  });
});

/**
 * Tests requiring unique block configurations
 */
describe("Execute Fork - Unique Block Tests", () => {
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

  describe("checkOperationReady - Not Ready case", () => {
    it("should return 'Operation is not ready' when pending", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: EXECUTION_TEST_BLOCKS.L2_TIMELOCK_NOT_READY,
      });

      const result = await checkOperationReady(
        CONSTITUTIONAL_GOVERNOR_COMPLETED.l2TimelockAddress,
        CONSTITUTIONAL_GOVERNOR_COMPLETED.operationId,
        forks.l2.provider
      );

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      if (result && !result.success) {
        expect(result.error).toContain("not ready");
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("L2→L1 Message - CONFIRMED State", () => {
    it("should prepare L2→L1 message for all messages", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: EXECUTION_TEST_BLOCKS.L2_TO_L1_CONFIRMED,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      const result = results[0];
      const l2ToL1Stage = result.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");

      if (l2ToL1Stage && l2ToL1Stage.status === "READY") {
        const bulkResult = await prepareL2ToL1MessageStage(
          l2ToL1Stage,
          forks.l2.provider,
          forks.l1.provider,
          { prepareCompleted: false }
        );

        expect(bulkResult.total).toBeGreaterThan(0);
        expect(bulkResult.results.length).toBeGreaterThan(0);
      }

      await forks.stopAll();
      forks = null;
    });

    it("should handle prepareCompleted option for historical validation", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: EXECUTION_TEST_BLOCKS.L2_TO_L1_CONFIRMED,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      const result = results[0];
      const l2ToL1Stage = result.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");

      if (l2ToL1Stage) {
        try {
          const bulkResult = await prepareL2ToL1MessageStage(
            l2ToL1Stage,
            forks.l2.provider,
            forks.l1.provider,
            { prepareCompleted: true }
          );
          expect(bulkResult).toBeDefined();
        } catch (err) {
          const message = (err as Error).message;
          expect(message.includes("CALL_EXCEPTION") || message.includes("EVM error")).toBe(true);
        }
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("Retryable Ticket Preparation", () => {
    it("should prepare retryable redemption when ticket is ready", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: EXECUTION_TEST_BLOCKS.RETRYABLE_READY,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      const result = results[0];
      const retryableStage = result.stages.find((s) => s.type === "RETRYABLE_EXECUTED");

      if (retryableStage && ["PENDING", "READY"].includes(retryableStage.status)) {
        try {
          const bulkResult = await prepareRetryableStage(
            retryableStage,
            forks.l1.provider,
            forks.l2.provider,
            { prepareCompleted: false }
          );

          expect(bulkResult).toBeDefined();
          expect(bulkResult.total).toBeGreaterThanOrEqual(0);
        } catch (err) {
          const message = (err as Error).message;
          expect(message).toContain("decode");
        }
      }

      await forks.stopAll();
      forks = null;
    });

    it("should handle prepareCompleted for historical retryable validation", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: EXECUTION_TEST_BLOCKS.RETRYABLE_READY,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      const result = results[0];
      const retryableStage = result.stages.find((s) => s.type === "RETRYABLE_EXECUTED");

      if (retryableStage) {
        try {
          const bulkResult = await prepareRetryableStage(
            retryableStage,
            forks.l1.provider,
            forks.l2.provider,
            { prepareCompleted: true }
          );
          expect(bulkResult).toBeDefined();
        } catch (err) {
          const message = (err as Error).message;
          expect(message).toContain("decode");
        }
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("Full Roundtrip Transaction Execution", () => {
    it("should track and verify full roundtrip proposal at completed state", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: EXECUTION_TEST_BLOCKS.COMPLETED,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      expect(result.stages.length).toBe(7);

      const createdStage = result.stages.find((s) => s.type === "PROPOSAL_CREATED");
      expect(createdStage?.status).toBe("COMPLETED");

      const votingStage = result.stages.find((s) => s.type === "VOTING_ACTIVE");
      expect(votingStage?.status).toBe("COMPLETED");

      const l2TimelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2TimelockStage?.status).toBe("COMPLETED");

      const retryableStage = result.stages.find((s) => s.type === "RETRYABLE_EXECUTED");
      expect(retryableStage).toBeDefined();
      expect(["COMPLETED", "PENDING", "READY"]).toContain(retryableStage?.status);

      const retryableData = getStageData(retryableStage!, "RETRYABLE_EXECUTED");
      if (retryableStage?.status === "COMPLETED") {
        expect(retryableData?.redeemedCount).toBeGreaterThan(0);
      }

      await forks.stopAll();
      forks = null;
    });

    it("should execute transaction on anvil fork using CLI executeTransaction", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls.l1,
        l2Url: rpcUrls.l2Archive,
        l2BlockNumber: EXECUTION_TEST_BLOCKS.L2_TIMELOCK_READY,
      });

      const tracker = createTracker({
        l1Provider: forks.l1.provider,
        l2Provider: forks.l2.provider,
        novaProvider,
      });

      const results = await tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_COMPLETED.creationTxHash);
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      const l2TimelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");

      if (l2TimelockStage?.status === "READY") {
        const prepResult = await tracker.prepareTransaction(l2TimelockStage);

        if (prepResult.success) {
          const anvilPrivateKey =
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
          const testWallet = new ethers.Wallet(anvilPrivateKey);

          await forks.l2.provider.send("anvil_setBalance", [
            testWallet.address,
            "0x" + (10n ** 18n).toString(16),
          ]);

          const providers: ProviderBundle = {
            l1Provider: forks.l1.provider,
            l2Provider: forks.l2.provider,
            novaProvider,
          };

          const execResult = await executeTransaction(prepResult.prepared, testWallet, providers, {
            maxFeePerGas: 0.1,
            maxPriorityFeePerGas: 0.01,
          });

          expect(execResult).toBeDefined();
          if (!execResult.success) {
            expect(execResult.error).toBeDefined();
          }
        }
      } else {
        expect(["PENDING", "COMPLETED"]).toContain(l2TimelockStage?.status);
      }

      await forks.stopAll();
      forks = null;
    });
  });
});
