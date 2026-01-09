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

import { CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP } from "./fixtures";

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
      // #given - a known proposal creation transaction hash
      // #when - discovering proposal by tx hash
      const result = await discoverProposalByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash,
        l2Provider
      );

      // #then - should return the proposal with matching ID
      expect(result).not.toBeNull();
      expect(result!.proposalId).toBe(CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.proposalId);
    });

    it("should get proposal state", async () => {
      // #given - a completed proposal's governor address and ID
      // #when - querying the proposal state
      const state = await getProposalState(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.governorAddress,
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.proposalId,
        l2Provider
      );

      // #then - should return "Executed" for a completed proposal
      expect(state).toBe("Executed");
    });
  });

  describe("Timelock Discovery", () => {
    it("should find CallScheduled events by tx hash", async () => {
      // #given - a known timelock transaction hash
      // #when - finding CallScheduled events by tx hash
      const results = await findCallScheduledByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.timelockTxHash,
        l2Provider
      );

      // #then - should return events with matching operation ID
      expect(results).not.toBeNull();
      expect(results!.length).toBeGreaterThan(0);
      expect(results![0].operationId.toLowerCase()).toBe(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.operationId.toLowerCase()
      );
    });
    // Note: isL1Timelock unit tests are in utils.test.ts

    it("should get L2 timelock operation state (completed)", async () => {
      // #given - a completed L2 timelock operation
      // #when - querying the operation state
      const state = await getTimelockOperationState(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.l2TimelockAddress,
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.operationId,
        l2Provider
      );

      // #then - should show isDone=true for completed operation
      expect(state.isDone).toBe(true);
      expect(state.isReady).toBe(false);
      expect(state.isPending).toBe(false);
    });
  });

  describe("Utilities", () => {
    it("should retry failed queries with config object", async () => {
      // #given - a function that fails on first attempt then succeeds
      let attempts = 0;

      // #when - executing with retry config
      const result = await queryWithRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            const error = new Error("rate limit exceeded");
            throw error;
          }
          return "success";
        },
        { maxRetries: 3, initialDelay: 50, maxDelay: 200, backoffMultiplier: 2 }
      );

      // #then - should succeed after retry and record 2 attempts
      expect(result).toBe("success");
      expect(attempts).toBe(2);
    });
  });

  describe("Security Council", () => {
    it("should detect Security Council proposal by targets", () => {
      // #given - targets containing SecurityCouncilManager address
      const scTargets = [ADDRESSES.SECURITY_COUNCIL_MANAGER];

      // #when - checking if it's a Security Council election proposal
      // #then - should return true for SC manager target
      expect(isSecurityCouncilElectionProposal(scTargets)).toBe(true);

      // #given - targets not containing SecurityCouncilManager
      const normalTargets = [ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK];

      // #when - checking if it's a Security Council election proposal
      // #then - should return false for non-SC targets
      expect(isSecurityCouncilElectionProposal(normalTargets)).toBe(false);
    });
  });
});
// Note: isL1Timelock unit tests are in utils.test.ts
