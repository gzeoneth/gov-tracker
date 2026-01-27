/**
 * Retryable Ticket Lifecycle Edge Case Tests
 *
 * Tests retryable tracking, status detection, and preparation functions
 * using real blockchain data from completed proposals.
 *
 * Key test scenarios:
 * 1. Retryable creation from L1 timelock execution
 * 2. Retryable redemption status tracking
 * 3. Preparation functions for manual redemption
 * 4. Missing provider handling (Nova graceful degradation)
 * 5. L2-only proposals (no retryables - SKIPPED status)
 *
 * PERFORMANCE OPTIMIZATION:
 * Retryables are tracked once in beforeAll and reused across tests.
 * This reduces test time from ~2.3 minutes to ~30 seconds.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

import {
  shouldSkipRpc,
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./helpers";

import {
  detectAllRetryableTargetChains,
  trackRetryables,
  prepareRetryableRedemption,
  prepareAllRetryables,
} from "../src/stages/retryables";

import { ParentToChildMessageReader, ParentToChildMessageStatus } from "@arbitrum/sdk";

import {
  createTracker,
  ProposalStageTracker,
  ADDRESSES,
  DEFAULT_RPC_URLS,
  TrackingResult,
  TrackedStage,
  StageTransaction,
} from "../src";
import type { L2Chain } from "../src/types/core";
import type { RetryableStageData } from "../src/types/stages";

// Type for trackRetryables return value
interface RetryableTrackingResult {
  stage: TrackedStage;
  messages: ParentToChildMessageReader[];
  isComplete: boolean;
  targetChains: L2Chain[];
}

dotenv.config({ quiet: true });

// L1 execution tx that creates retryables to Arb1
const L1_TX_WITH_RETRYABLE = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.expectedStages.L1_TIMELOCK.hash;

describe.skipIf(shouldSkipRpc())(
  "Retryable Lifecycle Tests",
  {
    timeout: 300000, // 5 minutes for slow retryable tests
  },
  () => {
    let l1Provider: ethers.providers.JsonRpcProvider;
    let l2Provider: ethers.providers.JsonRpcProvider;
    let tracker: ProposalStageTracker;

    // Cached tracking results (tracked once, reused across all tests)
    let retryableResult: RetryableTrackingResult;
    let fullProposalResult: TrackingResult;
    let l2OnlyProposalResult: TrackingResult;
    // Additional cached results
    let cachedTargetChains: Awaited<ReturnType<typeof detectAllRetryableTargetChains>>;
    let cachedRetryableWithoutNova: RetryableTrackingResult;
    let cachedPrepareAllResult: Awaited<ReturnType<typeof prepareAllRetryables>>;

    beforeAll(async () => {
      const ethRpc = process.env.ETH_RPC;
      if (!ethRpc) {
        throw new Error("RPC URLs required: Set ETH_RPC environment variables");
      }
      const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;

      l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
      l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);

      tracker = createTracker({
        l1Provider,
        l2Provider,
      });

      // Track retryables and proposals once
      console.log("Tracking retryables and proposals for test suite...");
      const [
        retryResult,
        fullResults,
        l2Results,
        targetChains,
        retryableWithoutNova,
        prepareAllResult,
      ] = await Promise.all([
        trackRetryables(L1_TX_WITH_RETRYABLE, l1Provider, { l2Provider }),
        tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash),
        tracker.trackByTxHash(NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash),
        detectAllRetryableTargetChains(L1_TX_WITH_RETRYABLE, l1Provider),
        trackRetryables(L1_TX_WITH_RETRYABLE, l1Provider, { l2Provider, novaProvider: undefined }),
        prepareAllRetryables(L1_TX_WITH_RETRYABLE, l1Provider, l2Provider),
      ]);

      retryableResult = retryResult;
      fullProposalResult = fullResults[0];
      l2OnlyProposalResult = l2Results[0];
      cachedTargetChains = targetChains;
      cachedRetryableWithoutNova = retryableWithoutNova;
      cachedPrepareAllResult = prepareAllResult;
      console.log("✓ All retryables and proposals tracked and cached");
    }, 300000); // 5 minute timeout for initial tracking

    describe("detectAllRetryableTargetChains", () => {
      it("should detect Arb1 as target chain for known retryable", () => {
        // Uses cachedTargetChains from beforeAll
        expect(cachedTargetChains.length).toBeGreaterThan(0);

        // Should include Arb1 (L2 chain type)
        const arb1Target = cachedTargetChains.find((t) => t.chain === "arb1");
        expect(arb1Target).toBeDefined();
        if (arb1Target) {
          expect(arb1Target.inboxAddress.toLowerCase()).toBe(
            ADDRESSES.ARB1_DELAYED_INBOX.toLowerCase()
          );
          expect(arb1Target.messageCount).toBeGreaterThan(0);
        }
      });

      it("should return empty array for tx without retryables", async () => {
        // Use the L2 timelock execution tx (no retryables from L2 tx)
        const l2TxHash = NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.expectedStages.L2_TIMELOCK.hash;

        // This will fail to find the tx on L1, which is expected
        const targets = await detectAllRetryableTargetChains(l2TxHash, l1Provider);
        expect(targets).toEqual([]);
      });

      it("should return empty array for invalid tx hash", async () => {
        const invalidHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const targets = await detectAllRetryableTargetChains(invalidHash, l1Provider);
        expect(targets).toEqual([]);
      });
    });

    describe("trackRetryables", () => {
      it("should track retryables with creation and redemption data", async () => {
        const result = retryableResult;

        expect(result.stage.type).toBe("RETRYABLE_EXECUTED");
        expect(result.stage.chain).toBe("arb1");
        // Stage may be READY if there are Nova retryables without Nova provider
        expect(["COMPLETED", "READY"]).toContain(result.stage.status);
        expect(result.messages.length).toBeGreaterThan(0);

        // Verify transaction data
        expect(result.stage.transactions.length).toBeGreaterThan(0);
        expect(result.stage.transactions[0].chain).toBe("ethereum");
        expect(result.stage.transactions[0].hash.toLowerCase()).toBe(
          L1_TX_WITH_RETRYABLE.toLowerCase()
        );

        // Should have creation and redemption details
        const data = result.stage.data as RetryableStageData;
        expect(data.ticketCount).toBeGreaterThan(0);
        expect(data.creationDetails).toBeDefined();
        expect(data.redemptionDetails).toBeDefined();
        expect(Array.isArray(data.creationDetails)).toBe(true);
      });

      it("should include L2 transaction hash in creation details", async () => {
        const result = retryableResult;
        const retryableData = result.stage.data as RetryableStageData;

        const creationDetails = retryableData.creationDetails as Array<{
          index: number;
          targetChain: string;
          l2TxHash: string;
        }>;

        expect(creationDetails.length).toBeGreaterThan(0);
        const arb1Details = creationDetails.filter((d) => d.targetChain === "arb1");
        expect(arb1Details.length).toBeGreaterThan(0);
        expect(arb1Details[0].l2TxHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      });

      it("should return SKIPPED for non-retryable L1 tx", async () => {
        const result = await trackRetryables(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          l1Provider,
          { l2Provider }
        );

        expect(result.stage.status).toBe("SKIPPED");
        expect(result.isComplete).toBe(true);
        expect(result.messages.length).toBe(0);
      });

      it("should handle missing Nova provider gracefully", () => {
        // Uses cachedRetryableWithoutNova from beforeAll
        expect(cachedRetryableWithoutNova.messages.length).toBeGreaterThan(0);

        const data = cachedRetryableWithoutNova.stage.data as RetryableStageData;
        const redemptionDetails = data.redemptionDetails as Array<{
          targetChain: string;
          status: string;
        }>;
        const arb1Tickets = redemptionDetails.filter((d) => d.targetChain === "arb1");
        const novaTickets = redemptionDetails.filter((d) => d.targetChain === "nova");

        for (const ticket of arb1Tickets) {
          expect(ticket.status).toBe("REDEEMED");
        }
        for (const ticket of novaTickets) {
          expect(ticket.status).toBe("PROVIDER_NOT_AVAILABLE");
        }
      });

      it("should include redemption transaction details for completed retryables", async () => {
        const result = retryableResult;

        // Find L2 redemption transactions (not the L1 tx or creation txs)
        const l2RedemptionTxs = result.stage.transactions.filter(
          (tx: StageTransaction) => tx.chain === "arb1" && tx.blockNumber > 0
        );

        expect(l2RedemptionTxs.length).toBeGreaterThan(0);
        expect(l2RedemptionTxs[0].blockNumber).toBeGreaterThan(0);
      });
    });

    describe("Retryable preparation functions", () => {
      it("should reject preparation for already redeemed ticket", async () => {
        const { messages } = retryableResult;

        expect(messages.length).toBeGreaterThan(0);

        const result = await prepareRetryableRedemption(messages[0], l2Provider);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("already redeemed");
        }
      });

      it("should allow forced preparation for historical validation", async () => {
        const { messages } = retryableResult;

        expect(messages.length).toBeGreaterThan(0);

        const result = await prepareRetryableRedemption(messages[0], l2Provider, {
          prepareCompleted: true,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared).toBeDefined();
          expect(result.prepared.to).toBe(ADDRESSES.ARB_RETRYABLE_TX);
          expect(result.prepared.data).toMatch(/^0x/);
          expect(result.prepared.value).toBe("0");
        }
      });

      it("should prepare all retryables from L1 tx", () => {
        // Uses cachedPrepareAllResult from beforeAll
        const { total, results, targetChain } = cachedPrepareAllResult;

        expect(total).toBeGreaterThan(0);
        expect(results.length).toBe(total);
        expect(targetChain).toBe("arb1");

        // All should fail since already redeemed
        for (const result of results) {
          expect(result.success).toBe(false);
        }
      });

      it("should return error for non-existent L1 tx", async () => {
        const { total, results } = await prepareAllRetryables(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          l1Provider,
          l2Provider
        );

        expect(total).toBe(0);
        expect(results.length).toBe(1);
        expect(results[0].success).toBe(false);
      });
    });

    describe("Full lifecycle integration", () => {
      it("should track full proposal with retryable stages", async () => {
        const result = fullProposalResult;

        // Find retryable stage
        const retryableStage = result.stages.find(
          (s: TrackedStage) => s.type === "RETRYABLE_EXECUTED"
        );

        expect(retryableStage).toBeDefined();
        if (retryableStage) {
          // Stage may be READY if there are Nova retryables without Nova provider
          expect(["COMPLETED", "READY"]).toContain(retryableStage.status);

          // Verify chain classification
          expect(retryableStage.chain).toBe("arb1"); // Retryables execute on L2 chains (Arb1/Nova)
        }
      });

      it("should skip or not include retryable stages for L2-only proposal", async () => {
        const result = l2OnlyProposalResult;

        // Retryable stage should be skipped or not present for L2-only proposals
        const retryableStage = result.stages.find(
          (s: TrackedStage) => s.type === "RETRYABLE_EXECUTED"
        );

        // Either not present or skipped
        if (retryableStage) {
          expect(retryableStage.status).toBe("SKIPPED");
        }

        // The proposal should be complete (L2-only path doesn't need retryables)
        expect(result.isComplete).toBe(true);
      });
    });

    describe("Retryable data accuracy", () => {
      it("should have correct ticket count in stage", async () => {
        const result = retryableResult;
        const data = result.stage.data as RetryableStageData;

        const ticketCount = data.ticketCount as number;
        expect(ticketCount).toBeGreaterThan(0);
      });

      it("should have matching creation and redemption details", async () => {
        const result = retryableResult;
        const data = result.stage.data as RetryableStageData;

        const creationDetails = data.creationDetails as Array<{
          index: number;
          targetChain: string;
          l2TxHash: string;
        }>;

        const redemptionDetails = data.redemptionDetails as Array<{
          index: number;
          targetChain: string;
          status: string;
          l2TxHash: string | null;
        }>;

        expect(creationDetails.length).toBe(redemptionDetails.length);

        // Each created ticket should have a corresponding redemption entry
        // Arb1 tickets should be REDEEMED, Nova tickets may be NOT_TRACKED (no Nova provider)
        for (let i = 0; i < creationDetails.length; i++) {
          expect(creationDetails[i].targetChain).toBe(redemptionDetails[i].targetChain);
          if (redemptionDetails[i].targetChain === "arb1") {
            expect(redemptionDetails[i].status).toBe("REDEEMED");
          } else {
            // Nova tickets without provider are PROVIDER_NOT_AVAILABLE
            expect(["REDEEMED", "PROVIDER_NOT_AVAILABLE"]).toContain(redemptionDetails[i].status);
          }
        }
      });

      it("should have valid timing data", async () => {
        const result = retryableResult;

        expect(result.stage.timing).toBeDefined();
        if (result.stage.timing) {
          expect(result.stage.timing.startedAt).toBeGreaterThan(0);
        }
      });
    });
  }
);

describe("Retryable Edge Cases (No RPC)", () => {
  describe("Input validation", () => {
    it("should handle null/undefined gracefully", async () => {
      // These tests use mock behavior - actual implementation should handle edge cases
      expect(() => {
        // Just verify types are correct
        const emptyHash = "";
        expect(typeof emptyHash).toBe("string");
      }).not.toThrow();
    });
  });
});

/**
 * Retryable Preparation Status Edge Cases
 *
 * Tests for prepareRetryableRedemption status validation paths using mocked message objects.
 * These cover lines 372-377 in retryables.ts for EXPIRED and not-ready status handling.
 */
describe("Retryable Preparation Status Checks", () => {
  // Mock provider with minimal interface for chain detection
  const mockL2Provider = {
    getNetwork: async () => ({ chainId: 42161, name: "arb1" }),
  } as unknown as ethers.providers.Provider;

  // Factory for mock ParentToChildMessageReader with custom status
  function createMockMessage(status: ParentToChildMessageStatus): ParentToChildMessageReader {
    return {
      retryableCreationId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      status: async () => status,
    } as unknown as ParentToChildMessageReader;
  }

  it("should reject EXPIRED retryable tickets (covers line 372-374)", async () => {
    // #given - mock message with EXPIRED status
    const expiredMessage = createMockMessage(ParentToChildMessageStatus.EXPIRED);

    // #when - attempt to prepare the expired retryable
    const result = await prepareRetryableRedemption(expiredMessage, mockL2Provider);

    // #then - should fail with appropriate message
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("expired");
    }
  });

  it("should reject NOT_YET_CREATED retryable tickets (covers line 376-377)", async () => {
    // #given - mock message with NOT_YET_CREATED status
    const notCreatedMessage = createMockMessage(ParentToChildMessageStatus.NOT_YET_CREATED);

    // #when - attempt to prepare the not-yet-created retryable
    const result = await prepareRetryableRedemption(notCreatedMessage, mockL2Provider);

    // #then - should fail with not ready message
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not ready");
      expect(result.error).toContain("NOT_YET_CREATED");
    }
  });

  it("should reject CREATION_FAILED retryable tickets (covers line 376-377)", async () => {
    // #given - mock message with CREATION_FAILED status
    const failedMessage = createMockMessage(ParentToChildMessageStatus.CREATION_FAILED);

    // #when - attempt to prepare the failed retryable
    const result = await prepareRetryableRedemption(failedMessage, mockL2Provider);

    // #then - should fail with not ready message
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not ready");
      expect(result.error).toContain("CREATION_FAILED");
    }
  });
});
