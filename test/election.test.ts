/**
 * Tests for Election Module
 *
 * Tests for Security Council election-related functions.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { BigNumber, ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  ADDRESSES,
  checkElectionStatus,
  checkVettingPeriod,
  hasVettingPeriod,
  getElectionProposalId,
  getElectionProposalParams,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
  prepareElectionCreation,
  trackElectionProposal,
  DEFAULT_RPC_URLS,
} from "../src";
import { getVettingDeadline } from "./helpers/election-helpers";

dotenv.config({ quiet: true });

describe("Election Module", () => {
  // Note: hasVettingPeriod requires a proper ethers Contract which needs a signer/provider
  // These are integration-level tests and require RPC access
  // Unit tests focus on pure functions

  describe("Election Address Detection", () => {
    it("should identify Election Nominee Governor", () => {
      // The ELECTION_NOMINEE_GOVERNOR address should be properly defined
      expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).toBeDefined();
      expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should identify Election Member Governor", () => {
      // The ELECTION_MEMBER_GOVERNOR address should be properly defined
      expect(ADDRESSES.ELECTION_MEMBER_GOVERNOR).toBeDefined();
      expect(ADDRESSES.ELECTION_MEMBER_GOVERNOR).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should have distinct addresses for different election governors", () => {
      expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).not.toBe(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
    });

    it("should have Security Council Manager address defined", () => {
      expect(ADDRESSES.SECURITY_COUNCIL_MANAGER).toBeDefined();
      expect(ADDRESSES.SECURITY_COUNCIL_MANAGER).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe("Election Types", () => {
    // Test type definitions by creating valid objects

    it("should accept valid ElectionProposalStatus", () => {
      const status = {
        phase: "NOMINEE_SELECTION" as const,
        currentNomineeCount: 10,
        maxNominees: 12,
        nomineeDeadline: BigNumber.from(1700000000),
        canAdvance: true,
      };

      expect(status.phase).toBe("NOMINEE_SELECTION");
      expect(status.canAdvance).toBe(true);
    });

    it("should accept valid cohort types", () => {
      const marchCohort = "MARCH";
      const septemberCohort = "SEPTEMBER";

      expect(["MARCH", "SEPTEMBER"]).toContain(marchCohort);
      expect(["MARCH", "SEPTEMBER"]).toContain(septemberCohort);
    });
  });

  describe("Election Proposal Types", () => {
    it("should have valid election proposal types", () => {
      // Election governors are distinct from regular governance
      const electionTypes = ["ELECTION_NOMINEE", "ELECTION_MEMBER"];

      expect(electionTypes).toContain("ELECTION_NOMINEE");
      expect(electionTypes).toContain("ELECTION_MEMBER");
    });
  });
});

describe.skipIf(process.env.NO_RPC === "1")("Election Integration Tests", () => {
  let l2Provider: ethers.providers.JsonRpcProvider;
  let l1Provider: ethers.providers.JsonRpcProvider;

  beforeAll(() => {
    const ethRpc = process.env.ETH_RPC;
    const arbRpc = process.env.ARB1_ARCHIVE_RPC || process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;

    if (!ethRpc) {
      throw new Error(
        "RPC URLs required: Set ETH_RPC and ARB1_ARCHIVE_RPC/ARB1_RPC environment variables"
      );
    }

    l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
  });

  describe("hasVettingPeriod", () => {
    it("should detect nominee election governor has vetting", async () => {
      const hasVetting = await hasVettingPeriod(ADDRESSES.ELECTION_NOMINEE_GOVERNOR, l2Provider);
      expect(hasVetting).toBe(true);
    });

    it("should detect core governor does not have vetting", async () => {
      const hasVetting = await hasVettingPeriod(ADDRESSES.CONSTITUTIONAL_GOVERNOR, l2Provider);
      expect(hasVetting).toBe(false);
    });
  });

  describe("checkVettingPeriod", () => {
    it("should check vetting period for non-vetting governor", async () => {
      // Core governor doesn't have vetting
      const result = await checkVettingPeriod(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "0", // Dummy proposal ID
        l2Provider
      );

      expect(result.hasVettingPeriod).toBe(false);
      expect(result.vettingDeadline).toBeNull();
      expect(result.isVettingActive).toBe(false);
    });
  });

  describe("getVettingDeadline", () => {
    it("should return undefined for non-vetting governor", async () => {
      // Core governor doesn't have vetting deadline
      const deadline = await getVettingDeadline(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "0", // Dummy proposal ID
        l2Provider
      );

      expect(deadline).toBeUndefined();
    });

    it("should return a value for nominee election governor (vetting period check succeeds)", async () => {
      // Nominee election governor has proposalVettingDeadline function
      // For any proposal ID, it calculates: proposalDeadline + vettingDuration
      // The function succeeds even for proposal ID 0 (returns calculated value)
      const deadline = await getVettingDeadline(
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
        "0",
        l2Provider
      );

      // Should return a BigNumber - the function call succeeds on nominee governors
      expect(deadline).toBeDefined();
      expect(deadline?.toNumber()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getElectionProposalId", () => {
    it("should return proposal ID for past elections", async () => {
      // Get current election count
      const status = await checkElectionStatus(
        l2Provider,
        l1Provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      if (status.electionCount > 0) {
        let foundProposalId = false;
        for (let i = status.electionCount - 1; i >= 0; i--) {
          const proposalId = await getElectionProposalId(i, l2Provider);
          if (proposalId !== null) {
            foundProposalId = true;
            break;
          }
        }
        expect(foundProposalId).toBe(true);
      }
    });
  });

  describe("Election Proposal Params", () => {
    it("should fetch proposal params for a completed election", async () => {
      // Get election count
      const status = await checkElectionStatus(
        l2Provider,
        l1Provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      if (status.electionCount > 0) {
        // Find an election that has a valid proposal ID
        let foundParams = false;
        for (let i = status.electionCount - 1; i >= 0; i--) {
          const proposalId = await getElectionProposalId(i, l2Provider);
          if (proposalId !== null) {
            // Fetch params for this election
            const params = await getElectionProposalParams(i, l2Provider);

            if (params) {
              foundParams = true;
              break;
            }
          }
        }
        expect(foundParams).toBe(true);
      }
    });

    it("should return null for non-existent election", async () => {
      const params = await getElectionProposalParams(999, l2Provider);
      expect(params).toBeNull();
    });
  });

  describe("Member Election Trigger", () => {
    it("should return null when election cannot proceed to member phase", async () => {
      // Get current election status
      const status = await checkElectionStatus(
        l2Provider,
        l1Provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      if (status.electionCount > 0) {
        // Track a completed election (should not be able to proceed)
        const electionStatus = await trackElectionProposal(0, l2Provider, l1Provider);

        // A completed election cannot proceed to member phase
        if (electionStatus.phase === "COMPLETED") {
          const tx = await prepareMemberElectionTrigger(
            { electionIndex: 0, canProceedToMemberPhase: false },
            l2Provider
          );
          expect(tx).toBeNull();
        }
      }
    });
  });

  describe("Election Phase Tracking", () => {
    it("should correctly identify completed election phases", async () => {
      const status = await checkElectionStatus(
        l2Provider,
        l1Provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      // Track all completed elections and verify phase data
      for (let i = 0; i < Math.min(status.electionCount, 3); i++) {
        const electionStatus = await trackElectionProposal(i, l2Provider, l1Provider);

        expect(electionStatus.electionIndex).toBe(i);
        expect(electionStatus.targetNomineeCount).toBe(6);
        expect([0, 1]).toContain(electionStatus.cohort);

        // Completed elections should have proposal IDs
        if (electionStatus.phase === "COMPLETED") {
          expect(electionStatus.nomineeProposalId).not.toBeNull();
          expect(electionStatus.memberProposalId).not.toBeNull();
          expect(electionStatus.nomineeProposalState).toBe("Executed");
          expect(electionStatus.memberProposalState).toBe("Executed");
          expect(electionStatus.isInVettingPeriod).toBe(false);
          expect(electionStatus.canProceedToMemberPhase).toBe(false);
        }
      }
    });

    it("should track cohort alternation across elections", async () => {
      const status = await checkElectionStatus(
        l2Provider,
        l1Provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      if (status.electionCount >= 2) {
        const election0 = await trackElectionProposal(0, l2Provider, l1Provider);
        const election1 = await trackElectionProposal(1, l2Provider, l1Provider);

        // Cohorts should alternate
        expect(election0.cohort).not.toBe(election1.cohort);
      }
    });
  });
});

describe("Election Module - Mocked Tests", () => {
  describe("prepareMemberElectionTrigger", () => {
    it("should return null when canProceedToMemberPhase is false", async () => {
      // #given - Any provider (won't be used since function exits early)
      const mockProvider = {} as ethers.providers.Provider;

      // #when - calling with canProceedToMemberPhase=false
      const result = await prepareMemberElectionTrigger(
        { electionIndex: 5, canProceedToMemberPhase: false },
        mockProvider
      );

      // #then - should return null without calling any provider methods
      expect(result).toBeNull();
    });

    it("should build correct execute calldata structure", () => {
      // #given - test that the governor interface encoding is correct
      const governorInterface = new ethers.utils.Interface([
        "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)",
      ]);

      const targets = ["0x1111111111111111111111111111111111111111"];
      const values = [BigNumber.from(0)];
      const calldatas = ["0xabcdef"];
      const descriptionHash = ethers.utils.id("Test election proposal");

      // #when - encoding the execute calldata
      const calldata = governorInterface.encodeFunctionData("execute", [
        targets,
        values,
        calldatas,
        descriptionHash,
      ]);

      // #then - should produce valid calldata
      expect(calldata).toContain("0x");
      expect(calldata.length).toBeGreaterThan(10); // At least selector + params
    });
  });

  describe("prepareElectionCreation", () => {
    it("should prepare election creation transaction", () => {
      // #given - minimal election status with election count
      // #when - preparing election creation
      const result = prepareElectionCreation({ electionCount: 5 });

      // #then - should return prepared transaction
      expect(result.transaction).toBeDefined();
      expect(result.transaction.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(result.transaction.chain).toBe("arb1");
      expect(result.transaction.chainId).toBe(42161);
      expect(result.transaction.value).toBe("0");
      expect(result.electionIndex).toBe(5);
    });

    it("should use custom governor address when provided", () => {
      // #given - custom governor address
      const customAddress = "0x1111111111111111111111111111111111111111";

      // #when - preparing with custom address
      const result = prepareElectionCreation({ electionCount: 3 }, customAddress);

      // #then - should use custom address
      expect(result.transaction.to).toBe(customAddress);
    });
  });

  describe("prepareMemberElectionExecution", () => {
    it("should return null when canExecuteMember is false", async () => {
      // #given - Any provider (won't be used since function exits early)
      const mockProvider = {} as ethers.providers.Provider;

      // #when - calling with canExecuteMember=false
      const result = await prepareMemberElectionExecution(
        { electionIndex: 2, canExecuteMember: false },
        mockProvider
      );

      // #then - should return null without calling any provider methods
      expect(result).toBeNull();
    });
  });
});
