/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Integration tests for discovery functions and utilities
 *
 * Tests discovery functions (governor, timelock), utilities, and Security Council detection
 * using real RPC data. For full tracker workflow tests, see tracker.test.ts.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { shouldSkipRpc, createL2OnlyTestSuite, FIXTURES } from "./helpers/rpc-test-setup";

import {
  discoverProposalByTxHash,
  findCallScheduledByTxHash,
  getTimelockOperationState,
  getProposalState,
  isSecurityCouncilElectionProposal,
  ADDRESSES,
} from "../src";
import { queryWithRetry } from "../src/utils/rpc-utils";

describe.skipIf(shouldSkipRpc())("Integration Tests", () => {
  const { getProvider, beforeAllSetup } = createL2OnlyTestSuite();

  // Cached RPC results - populated once in beforeAll
  let cachedProposal: Awaited<ReturnType<typeof discoverProposalByTxHash>>;
  let cachedProposalState: string;
  let cachedCallScheduledEvents: Awaited<ReturnType<typeof findCallScheduledByTxHash>>;
  let cachedTimelockState: Awaited<ReturnType<typeof getTimelockOperationState>>;

  beforeAll(async () => {
    beforeAllSetup();

    // Cache all RPC results in parallel
    const [proposal, proposalState, callScheduledEvents, timelockState] = await Promise.all([
      discoverProposalByTxHash(FIXTURES.FULL_ROUNDTRIP.creationTxHash, getProvider()),
      getProposalState(
        FIXTURES.FULL_ROUNDTRIP.governorAddress,
        FIXTURES.FULL_ROUNDTRIP.proposalId,
        getProvider()
      ),
      findCallScheduledByTxHash(FIXTURES.FULL_ROUNDTRIP.timelockTxHash, getProvider()),
      getTimelockOperationState(
        FIXTURES.FULL_ROUNDTRIP.l2TimelockAddress,
        FIXTURES.FULL_ROUNDTRIP.operationId,
        getProvider()
      ),
    ]);
    cachedProposal = proposal;
    cachedProposalState = proposalState;
    cachedCallScheduledEvents = callScheduledEvents;
    cachedTimelockState = timelockState;
    console.log("✓ Integration test RPC results cached");
  });

  describe("Governor Discovery", () => {
    it("should find ProposalCreated event by tx hash", () => {
      // #given - cached proposal discovery result
      // #then - should return the proposal with matching ID
      expect(cachedProposal).not.toBeNull();
      expect(cachedProposal!.proposalId).toBe(FIXTURES.FULL_ROUNDTRIP.proposalId);
    });

    it("should get proposal state", () => {
      // #given - cached proposal state
      // #then - should return "Executed" for a completed proposal
      expect(cachedProposalState).toBe("Executed");
    });
  });

  describe("Timelock Discovery", () => {
    it("should find CallScheduled events by tx hash", () => {
      // #given - cached CallScheduled events
      // #then - should return events with matching operation ID
      expect(cachedCallScheduledEvents).not.toBeNull();
      expect(cachedCallScheduledEvents!.length).toBeGreaterThan(0);
      expect(cachedCallScheduledEvents![0].operationId.toLowerCase()).toBe(
        FIXTURES.FULL_ROUNDTRIP.operationId.toLowerCase()
      );
    });

    it("should get L2 timelock operation state (completed)", () => {
      // #given - cached timelock operation state
      // #then - should show isDone=true for completed operation
      expect(cachedTimelockState.isDone).toBe(true);
      expect(cachedTimelockState.isReady).toBe(false);
      expect(cachedTimelockState.isPending).toBe(false);
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
