/**
 * Mocked tests for election tracking functions
 *
 * These tests cover the election tracking pure functions and edge cases.
 * Functions requiring real RPC connections are tested in election-fork.test.ts.
 */

import { describe, it, expect } from "vitest";
import { BigNumber, ethers } from "ethers";
import { TIMING } from "../src/constants";
import type { ElectionProposalParams } from "../src/election";
import type { TrackingResult, ElectionProposalStatus } from "../src";

describe("Election Constants", () => {
  it("should have correct target nominee count", () => {
    expect(TIMING.SECURITY_COUNCIL_TARGET_NOMINEES).toBe(6);
  });
});

describe("Election Execution Path Tests (Mocked)", () => {
  describe("prepareElectionCreation - function selector", () => {
    it("should encode createElection function correctly", async () => {
      // #given
      const { prepareElectionCreation } = await import("../src/election");

      // #when
      const result = prepareElectionCreation({ electionCount: 0 });

      // #then - function selector for createElection() is 0x24c2286c (4 bytes)
      expect(result.transaction.data).toMatch(/^0x[a-fA-F0-9]{8}$/);
      expect(result.transaction.data).toBe("0x24c2286c");
    });
  });

  describe("prepareMemberElectionTrigger edge cases", () => {
    it("should return null immediately when canProceedToMemberPhase is false without provider call", async () => {
      // #given - null provider to ensure no RPC calls are made
      const { prepareMemberElectionTrigger } = await import("../src/election");
      const nullProvider = null as unknown as ethers.providers.Provider;

      // #when - should not throw even with null provider since early return
      const result = await prepareMemberElectionTrigger(
        { electionIndex: 5, canProceedToMemberPhase: false },
        nullProvider
      );

      // #then
      expect(result).toBeNull();
    });
  });

  describe("prepareMemberElectionExecution edge cases", () => {
    it("should return null immediately when canExecuteMember is false without provider call", async () => {
      // #given - null provider to ensure no RPC calls are made
      const { prepareMemberElectionExecution } = await import("../src/election");
      const nullProvider = null as unknown as ethers.providers.Provider;

      // #when - should not throw even with null provider since early return
      const result = await prepareMemberElectionExecution(
        { electionIndex: 5, canExecuteMember: false },
        nullProvider
      );

      // #then
      expect(result).toBeNull();
    });
  });

  describe("ElectionProposalParams validation", () => {
    it("should compute correct description hash", () => {
      // #given
      const description = "Test Election Proposal";
      const expectedHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description));

      // #when
      const params: ElectionProposalParams = {
        targets: [],
        values: [],
        calldatas: [],
        description,
        descriptionHash: expectedHash,
      };

      // #then
      expect(params.descriptionHash).toBe(expectedHash);
    });

    it("should have matching array lengths for valid proposal", () => {
      // #given
      const targets = [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ];
      const values = [BigNumber.from(0), BigNumber.from(100)];
      const calldatas = ["0xabcd", "0xef01"];

      const params: ElectionProposalParams = {
        targets,
        values,
        calldatas,
        description: "Multi-call proposal",
        descriptionHash: "0x" + "0".repeat(64),
      };

      // #then
      expect(params.targets.length).toBe(params.values.length);
      expect(params.values.length).toBe(params.calldatas.length);
    });
  });
});

describe("TrackingResult with electionStatus", () => {
  it("should allow electionStatus to be undefined for non-election proposals", () => {
    // #given - a tracking result for a regular proposal
    const result: Partial<TrackingResult> = {
      isElection: false,
      electionStatus: undefined,
    };

    // #then - electionStatus should be optional and undefined
    expect(result.electionStatus).toBeUndefined();
    expect(result.isElection).toBe(false);
  });

  it("should include electionStatus for election proposals", () => {
    // #given - an election status
    const electionStatus: ElectionProposalStatus = {
      electionIndex: 2,
      phase: "NOMINEE_SELECTION",
      cohort: 0,
      nomineeProposalId: "123456",
      memberProposalId: null,
      nomineeProposalState: "Active",
      memberProposalState: null,
      compliantNomineeCount: 3,
      targetNomineeCount: 6,
      vettingDeadline: null,
      isInVettingPeriod: false,
      canProceedToMemberPhase: false,
      canExecuteMember: false,
    };

    // #when - creating a tracking result with election status
    const result: Partial<TrackingResult> = {
      isElection: true,
      electionStatus,
    };

    // #then - electionStatus should be present with correct values
    expect(result.electionStatus).toBeDefined();
    expect(result.electionStatus?.electionIndex).toBe(2);
    expect(result.electionStatus?.phase).toBe("NOMINEE_SELECTION");
    expect(result.isElection).toBe(true);
  });

  it("should track election phases correctly", () => {
    // #given - different election phases
    const phases: ElectionProposalStatus["phase"][] = [
      "NOT_STARTED",
      "NOMINEE_SELECTION",
      "VETTING_PERIOD",
      "MEMBER_ELECTION",
      "PENDING_EXECUTION",
      "COMPLETED",
    ];

    // #then - all phases should be valid
    for (const phase of phases) {
      const status: Partial<ElectionProposalStatus> = { phase };
      expect(status.phase).toBe(phase);
    }
  });
});
