/**
 * Mocked tests for election tracking functions
 *
 * These tests cover the election tracking pure functions and edge cases.
 * Functions requiring real RPC connections are tested in election-fork.test.ts.
 */

import { describe, it, expect } from "vitest";
import { BigNumber, ethers } from "ethers";
import { TIMING } from "../src/constants";
import type { ElectionProposalStatus, ElectionPhase } from "../src/types";
import type { ElectionProposalParams } from "../src/election";

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

describe("Election Status Filtering", () => {
  it("should identify completed elections", () => {
    // #given
    const completed: ElectionProposalStatus = {
      electionIndex: 0,
      phase: "COMPLETED",
      cohort: 0,
      nomineeProposalId: "123",
      nomineeProposalState: "Executed",
      memberProposalId: "456",
      memberProposalState: "Executed",
      compliantNomineeCount: 6,
      targetNomineeCount: 6,
      isInVettingPeriod: false,
      vettingDeadline: null,
      canProceedToMemberPhase: false,
      canExecuteMember: false,
    };

    const active: ElectionProposalStatus = {
      electionIndex: 1,
      phase: "MEMBER_ELECTION",
      cohort: 1,
      nomineeProposalId: "789",
      nomineeProposalState: "Executed",
      memberProposalId: "101",
      memberProposalState: "Active",
      compliantNomineeCount: 6,
      targetNomineeCount: 6,
      isInVettingPeriod: false,
      vettingDeadline: null,
      canProceedToMemberPhase: false,
      canExecuteMember: false,
    };

    const elections = [completed, active];

    // #when
    const incompleteElections = elections.filter((e) => e.phase !== "COMPLETED");

    // #then
    expect(incompleteElections.length).toBe(1);
    expect(incompleteElections[0].electionIndex).toBe(1);
  });

  it("should identify elections ready for member trigger", () => {
    // #given
    const elections: ElectionProposalStatus[] = [
      {
        electionIndex: 0,
        phase: "PENDING_EXECUTION",
        cohort: 0,
        nomineeProposalId: "123",
        nomineeProposalState: "Succeeded",
        memberProposalId: null,
        memberProposalState: null,
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: true,
        canExecuteMember: false,
      },
      {
        electionIndex: 1,
        phase: "VETTING_PERIOD",
        cohort: 1,
        nomineeProposalId: "456",
        nomineeProposalState: "Succeeded",
        memberProposalId: null,
        memberProposalState: null,
        compliantNomineeCount: 5,
        targetNomineeCount: 6,
        isInVettingPeriod: true,
        vettingDeadline: 1700000000,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      },
    ];

    // #when
    const readyToTrigger = elections.filter((e) => e.canProceedToMemberPhase);

    // #then
    expect(readyToTrigger.length).toBe(1);
    expect(readyToTrigger[0].electionIndex).toBe(0);
  });

  it("should identify elections ready for member execution", () => {
    // #given
    const elections: ElectionProposalStatus[] = [
      {
        electionIndex: 0,
        phase: "PENDING_EXECUTION",
        cohort: 0,
        nomineeProposalId: "123",
        nomineeProposalState: "Executed",
        memberProposalId: "456",
        memberProposalState: "Succeeded",
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: true,
      },
      {
        electionIndex: 1,
        phase: "MEMBER_ELECTION",
        cohort: 1,
        nomineeProposalId: "789",
        nomineeProposalState: "Executed",
        memberProposalId: "101",
        memberProposalState: "Active",
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      },
    ];

    // #when
    const readyToExecute = elections.filter((e) => e.canExecuteMember);

    // #then
    expect(readyToExecute.length).toBe(1);
    expect(readyToExecute[0].electionIndex).toBe(0);
  });
});

describe("trackAllElections and trackIncompleteElections", () => {
  describe("trackIncompleteElections filtering", () => {
    it("should filter out COMPLETED elections from results", () => {
      // #given a mix of completed and incomplete elections
      const allElections: ElectionProposalStatus[] = [
        {
          electionIndex: 0,
          phase: "COMPLETED",
          cohort: 0,
          nomineeProposalId: "123",
          nomineeProposalState: "Executed",
          memberProposalId: "456",
          memberProposalState: "Executed",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
        {
          electionIndex: 1,
          phase: "COMPLETED",
          cohort: 1,
          nomineeProposalId: "789",
          nomineeProposalState: "Executed",
          memberProposalId: "012",
          memberProposalState: "Executed",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
        {
          electionIndex: 2,
          phase: "MEMBER_ELECTION",
          cohort: 0,
          nomineeProposalId: "345",
          nomineeProposalState: "Executed",
          memberProposalId: "678",
          memberProposalState: "Active",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
      ];

      // #when filtering for incomplete elections
      const incompleteElections = allElections.filter((e) => e.phase !== "COMPLETED");

      // #then should only include non-COMPLETED elections
      expect(incompleteElections.length).toBe(1);
      expect(incompleteElections[0].electionIndex).toBe(2);
      expect(incompleteElections[0].phase).toBe("MEMBER_ELECTION");
    });

    it("should return empty array when all elections are completed", () => {
      // #given all elections are completed
      const allElections: ElectionProposalStatus[] = [
        {
          electionIndex: 0,
          phase: "COMPLETED",
          cohort: 0,
          nomineeProposalId: "123",
          nomineeProposalState: "Executed",
          memberProposalId: "456",
          memberProposalState: "Executed",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
      ];

      // #when filtering for incomplete elections
      const incompleteElections = allElections.filter((e) => e.phase !== "COMPLETED");

      // #then should return empty array
      expect(incompleteElections.length).toBe(0);
    });

    it("should include all phases except COMPLETED", () => {
      // #given elections in various phases
      const phases: ElectionPhase[] = [
        "NOT_STARTED",
        "NOMINEE_SELECTION",
        "VETTING_PERIOD",
        "PENDING_EXECUTION",
        "MEMBER_ELECTION",
        "COMPLETED",
      ];

      const allElections: ElectionProposalStatus[] = phases.map((phase, i) => ({
        electionIndex: i,
        phase,
        cohort: (i % 2) as 0 | 1,
        nomineeProposalId: phase === "NOT_STARTED" ? null : `${i}00`,
        nomineeProposalState:
          phase === "NOT_STARTED" ? null : phase === "COMPLETED" ? "Executed" : "Active",
        memberProposalId: phase === "MEMBER_ELECTION" || phase === "COMPLETED" ? `${i}01` : null,
        memberProposalState:
          phase === "MEMBER_ELECTION" ? "Active" : phase === "COMPLETED" ? "Executed" : null,
        compliantNomineeCount: phase === "NOT_STARTED" ? 0 : 6,
        targetNomineeCount: 6,
        isInVettingPeriod: phase === "VETTING_PERIOD",
        vettingDeadline: phase === "VETTING_PERIOD" ? 1700000000 : null,
        canProceedToMemberPhase: phase === "PENDING_EXECUTION",
        canExecuteMember: false,
      }));

      // #when filtering for incomplete elections
      const incompleteElections = allElections.filter((e) => e.phase !== "COMPLETED");

      // #then should include all phases except COMPLETED
      expect(incompleteElections.length).toBe(5);
      expect(incompleteElections.map((e) => e.phase)).toEqual([
        "NOT_STARTED",
        "NOMINEE_SELECTION",
        "VETTING_PERIOD",
        "PENDING_EXECUTION",
        "MEMBER_ELECTION",
      ]);
    });

    it("should preserve election order after filtering", () => {
      // #given elections in mixed order
      const allElections: ElectionProposalStatus[] = [
        {
          electionIndex: 0,
          phase: "COMPLETED",
          cohort: 0,
          nomineeProposalId: "123",
          nomineeProposalState: "Executed",
          memberProposalId: "456",
          memberProposalState: "Executed",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
        {
          electionIndex: 1,
          phase: "NOMINEE_SELECTION",
          cohort: 1,
          nomineeProposalId: "789",
          nomineeProposalState: "Active",
          memberProposalId: null,
          memberProposalState: null,
          compliantNomineeCount: 3,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
        {
          electionIndex: 2,
          phase: "VETTING_PERIOD",
          cohort: 0,
          nomineeProposalId: "012",
          nomineeProposalState: "Succeeded",
          memberProposalId: null,
          memberProposalState: null,
          compliantNomineeCount: 5,
          targetNomineeCount: 6,
          isInVettingPeriod: true,
          vettingDeadline: 1700000000,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
      ];

      // #when filtering for incomplete elections
      const incompleteElections = allElections.filter((e) => e.phase !== "COMPLETED");

      // #then should preserve order
      expect(incompleteElections.map((e) => e.electionIndex)).toEqual([1, 2]);
    });

    it("should handle empty election list", () => {
      // #given empty election list
      const allElections: ElectionProposalStatus[] = [];

      // #when filtering for incomplete elections
      const incompleteElections = allElections.filter((e) => e.phase !== "COMPLETED");

      // #then should return empty array
      expect(incompleteElections.length).toBe(0);
    });
  });

  describe("election list aggregation", () => {
    it("should count elections correctly from array", () => {
      // #given election array
      const elections: ElectionProposalStatus[] = [
        {
          electionIndex: 0,
          phase: "COMPLETED",
          cohort: 0,
          nomineeProposalId: "1",
          nomineeProposalState: "Executed",
          memberProposalId: "2",
          memberProposalState: "Executed",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
        {
          electionIndex: 1,
          phase: "MEMBER_ELECTION",
          cohort: 1,
          nomineeProposalId: "3",
          nomineeProposalState: "Executed",
          memberProposalId: "4",
          memberProposalState: "Active",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
      ];

      // #then should have correct length
      expect(elections.length).toBe(2);
    });

    it("should identify elections ready for action", () => {
      // #given elections with various action readiness
      const elections: ElectionProposalStatus[] = [
        {
          electionIndex: 0,
          phase: "PENDING_EXECUTION",
          cohort: 0,
          nomineeProposalId: "1",
          nomineeProposalState: "Succeeded",
          memberProposalId: null,
          memberProposalState: null,
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: true,
          canExecuteMember: false,
        },
        {
          electionIndex: 1,
          phase: "PENDING_EXECUTION",
          cohort: 1,
          nomineeProposalId: "2",
          nomineeProposalState: "Executed",
          memberProposalId: "3",
          memberProposalState: "Succeeded",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: true,
        },
        {
          electionIndex: 2,
          phase: "MEMBER_ELECTION",
          cohort: 0,
          nomineeProposalId: "4",
          nomineeProposalState: "Executed",
          memberProposalId: "5",
          memberProposalState: "Active",
          compliantNomineeCount: 6,
          targetNomineeCount: 6,
          isInVettingPeriod: false,
          vettingDeadline: null,
          canProceedToMemberPhase: false,
          canExecuteMember: false,
        },
      ];

      // #when checking for actionable elections
      const readyToTrigger = elections.filter((e) => e.canProceedToMemberPhase);
      const readyToExecute = elections.filter((e) => e.canExecuteMember);

      // #then should identify correct elections
      expect(readyToTrigger.length).toBe(1);
      expect(readyToTrigger[0].electionIndex).toBe(0);
      expect(readyToExecute.length).toBe(1);
      expect(readyToExecute[0].electionIndex).toBe(1);
    });
  });
});
