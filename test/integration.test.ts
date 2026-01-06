/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Integration tests for discovery functions and utilities
 *
 * Tests discovery functions (governor, timelock), utilities, and Security Council detection
 * using real RPC data. For full tracker workflow tests, see tracker.test.ts.
 *
 * Run with: npx vitest run test/integration.test.ts
 *
 * Set environment variables:
 * - ARB1_RPC: Arbitrum One RPC (optional, uses default if not set)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

import {
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  ARBITRUM_ADDRESSES as FIXTURE_ADDRESSES,
} from "./fixtures";

import {
  // Discovery functions
  discoverProposalByTxHash,
  findCallScheduledByTxHash,
  getTimelockOperationState,
  getProposalState,

  // Security Council
  isSecurityCouncilElectionProposal,

  // Utilities
  ADDRESSES,
  DEFAULT_RPC_URLS,
} from "../src";

// Import queryWithRetry from internal module for testing
import { queryWithRetry } from "../src/utils/rpc-utils";

dotenv.config({ quiet: true });

describe.skipIf(process.env.NO_RPC === "1")("Integration Tests", () => {
  let l2Provider: ethers.providers.JsonRpcProvider;

  beforeAll(() => {
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
  });

  describe("Governor Discovery", () => {
    it("should find ProposalCreated event by tx hash", async () => {
      const result = await discoverProposalByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash,
        l2Provider
      );

      expect(result).not.toBeNull();
      expect(result!.proposalId).toBe(CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.proposalId);
    });

    it("should get proposal state", async () => {
      const state = await getProposalState(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.governorAddress,
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.proposalId,
        l2Provider
      );

      // This is a completed proposal, state should be "Executed"
      expect(state).toBe("Executed");
    });
  });

  describe("Timelock Discovery", () => {
    it("should find CallScheduled events by tx hash", async () => {
      const results = await findCallScheduledByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.timelockTxHash,
        l2Provider
      );

      expect(results).not.toBeNull();
      expect(results!.length).toBeGreaterThan(0);
      // First event should have the operation ID
      expect(results![0].operationId.toLowerCase()).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.operationId.toLowerCase()
      );
    });
    // Note: isL1Timelock unit tests are in utils.test.ts

    it("should get L2 timelock operation state (completed)", async () => {
      const state = await getTimelockOperationState(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.l2TimelockAddress,
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.operationId,
        l2Provider
      );

      // Completed operation - should be DONE
      expect(state.isDone).toBe(true);
      expect(state.isReady).toBe(false);
      expect(state.isPending).toBe(false);
    });
  });

  describe("Utilities", () => {
    it("should retry failed queries with config object", async () => {
      let attempts = 0;
      const result = await queryWithRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            // Simulate a retryable error
            const error = new Error("rate limit exceeded");
            throw error;
          }
          return "success";
        },
        { maxRetries: 3, initialDelay: 50, maxDelay: 200, backoffMultiplier: 2 }
      );

      expect(result).toBe("success");
      expect(attempts).toBe(2);
    });
  });

  describe("Security Council", () => {
    it("should detect Security Council proposal by targets", () => {
      // A proposal targeting the SecurityCouncilManager is an SC election
      const scTargets = [ADDRESSES.SECURITY_COUNCIL_MANAGER];
      expect(isSecurityCouncilElectionProposal(scTargets)).toBe(true);

      // A proposal not targeting the manager is not an SC election
      const normalTargets = [FIXTURE_ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK];
      expect(isSecurityCouncilElectionProposal(normalTargets)).toBe(false);
    });
  });
});
// Note: isL1Timelock unit tests are in utils.test.ts
