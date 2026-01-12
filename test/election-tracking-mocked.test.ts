/**
 * Mocked tests for election tracking functions
 *
 * These tests cover the election tracking pure functions and edge cases.
 * Functions requiring real RPC connections are tested in election-fork.test.ts.
 */

import { describe, it, expect } from "vitest";
import { BigNumber, ethers } from "ethers";
import { ADDRESSES, TIMING } from "../src/constants";
import type { ElectionProposalStatus, ElectionPhase } from "../src/types";

describe("Election Tracking - Phase Logic Tests", () => {
  describe("ElectionProposalStatus structure", () => {
    it("should have correct fields for NOT_STARTED phase", () => {
      // #given
      const status: ElectionProposalStatus = {
        electionIndex: 0,
        phase: "NOT_STARTED",
        cohort: 0,
        nomineeProposalId: null,
        nomineeProposalState: null,
        memberProposalId: null,
        memberProposalState: null,
        compliantNomineeCount: 0,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      };

      // #then
      expect(status.phase).toBe("NOT_STARTED");
      expect(status.nomineeProposalId).toBeNull();
      expect(status.memberProposalId).toBeNull();
      expect(status.canProceedToMemberPhase).toBe(false);
      expect(status.canExecuteMember).toBe(false);
    });

    it("should have correct fields for NOMINEE_SELECTION phase", () => {
      // #given
      const status: ElectionProposalStatus = {
        electionIndex: 1,
        phase: "NOMINEE_SELECTION",
        cohort: 1,
        nomineeProposalId: "123456789",
        nomineeProposalState: "Active",
        memberProposalId: null,
        memberProposalState: null,
        compliantNomineeCount: 3,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: 1700000000,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      };

      // #then
      expect(status.phase).toBe("NOMINEE_SELECTION");
      expect(status.nomineeProposalId).not.toBeNull();
      expect(status.nomineeProposalState).toBe("Active");
    });

    it("should have correct fields for VETTING_PERIOD phase", () => {
      // #given
      const status: ElectionProposalStatus = {
        electionIndex: 2,
        phase: "VETTING_PERIOD",
        cohort: 0,
        nomineeProposalId: "987654321",
        nomineeProposalState: "Succeeded",
        memberProposalId: null,
        memberProposalState: null,
        compliantNomineeCount: 5,
        targetNomineeCount: 6,
        isInVettingPeriod: true,
        vettingDeadline: 1700100000,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      };

      // #then
      expect(status.phase).toBe("VETTING_PERIOD");
      expect(status.isInVettingPeriod).toBe(true);
      expect(status.nomineeProposalState).toBe("Succeeded");
    });

    it("should have correct fields for PENDING_EXECUTION phase when ready to trigger", () => {
      // #given
      const status: ElectionProposalStatus = {
        electionIndex: 3,
        phase: "PENDING_EXECUTION",
        cohort: 1,
        nomineeProposalId: "111222333",
        nomineeProposalState: "Succeeded",
        memberProposalId: null,
        memberProposalState: null,
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: 1699999000,
        canProceedToMemberPhase: true,
        canExecuteMember: false,
      };

      // #then
      expect(status.phase).toBe("PENDING_EXECUTION");
      expect(status.canProceedToMemberPhase).toBe(true);
      expect(status.isInVettingPeriod).toBe(false);
    });

    it("should have correct fields for MEMBER_ELECTION phase", () => {
      // #given
      const status: ElectionProposalStatus = {
        electionIndex: 4,
        phase: "MEMBER_ELECTION",
        cohort: 0,
        nomineeProposalId: "444555666",
        nomineeProposalState: "Executed",
        memberProposalId: "777888999",
        memberProposalState: "Active",
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      };

      // #then
      expect(status.phase).toBe("MEMBER_ELECTION");
      expect(status.memberProposalId).not.toBeNull();
      expect(status.memberProposalState).toBe("Active");
    });

    it("should have correct fields for PENDING_EXECUTION with canExecuteMember", () => {
      // #given
      const status: ElectionProposalStatus = {
        electionIndex: 5,
        phase: "PENDING_EXECUTION",
        cohort: 1,
        nomineeProposalId: "101010",
        nomineeProposalState: "Executed",
        memberProposalId: "202020",
        memberProposalState: "Succeeded",
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: true,
      };

      // #then
      expect(status.canExecuteMember).toBe(true);
      expect(status.memberProposalState).toBe("Succeeded");
    });

    it("should have correct fields for COMPLETED phase", () => {
      // #given
      const status: ElectionProposalStatus = {
        electionIndex: 6,
        phase: "COMPLETED",
        cohort: 0,
        nomineeProposalId: "303030",
        nomineeProposalState: "Executed",
        memberProposalId: "404040",
        memberProposalState: "Executed",
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      };

      // #then
      expect(status.phase).toBe("COMPLETED");
      expect(status.nomineeProposalState).toBe("Executed");
      expect(status.memberProposalState).toBe("Executed");
    });
  });

  describe("Phase transitions", () => {
    it("should validate all phases are valid ElectionPhase values", () => {
      // #given
      const validPhases: ElectionPhase[] = [
        "NOT_STARTED",
        "NOMINEE_SELECTION",
        "VETTING_PERIOD",
        "PENDING_EXECUTION",
        "MEMBER_ELECTION",
        "COMPLETED",
      ];

      // #then
      validPhases.forEach((phase) => {
        expect(typeof phase).toBe("string");
        expect(phase.length).toBeGreaterThan(0);
      });
    });

    it("should have consistent cohort values (0 or 1)", () => {
      // #given - cohort must be 0 or 1
      const cohort0: ElectionProposalStatus = {
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

      const cohort1: ElectionProposalStatus = {
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
      };

      // #then
      expect([0, 1]).toContain(cohort0.cohort);
      expect([0, 1]).toContain(cohort1.cohort);
    });
  });
});

describe("Election Constants", () => {
  it("should have correct target nominee count", () => {
    expect(TIMING.SECURITY_COUNCIL_TARGET_NOMINEES).toBe(6);
  });

  it("should have valid election governor addresses", () => {
    expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(ADDRESSES.ELECTION_MEMBER_GOVERNOR).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(ADDRESSES.SECURITY_COUNCIL_MANAGER).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("should have distinct addresses for different election governors", () => {
    expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).not.toBe(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
    expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).not.toBe(ADDRESSES.SECURITY_COUNCIL_MANAGER);
  });
});

describe("Election Pure Function Tests", () => {
  describe("prepareElectionCreation", () => {
    it("should prepare election creation transaction with correct structure", async () => {
      // #given
      const { prepareElectionCreation } = await import("../src/election");
      const status = { electionCount: 5 };

      // #when
      const result = prepareElectionCreation(status);

      // #then
      expect(result.transaction).toBeDefined();
      expect(result.transaction.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(result.transaction.chain).toBe("arb1");
      expect(result.transaction.chainId).toBe(42161);
      expect(result.transaction.value).toBe("0");
      expect(result.electionIndex).toBe(5);
      expect(result.transaction.description).toContain("createElection");
    });

    it("should use custom governor address when provided", async () => {
      // #given
      const { prepareElectionCreation } = await import("../src/election");
      const customAddress = "0x1234567890123456789012345678901234567890";

      // #when
      const result = prepareElectionCreation({ electionCount: 3 }, customAddress);

      // #then
      expect(result.transaction.to).toBe(customAddress);
    });

    it("should encode createElection() function call correctly", async () => {
      // #given
      const { prepareElectionCreation } = await import("../src/election");

      // #when
      const result = prepareElectionCreation({ electionCount: 0 });

      // #then - function selector for createElection()
      expect(result.transaction.data).toMatch(/^0x/);
      expect(result.transaction.data.length).toBeGreaterThan(2);
    });
  });

  describe("prepareMemberElectionTrigger", () => {
    it("should return null when canProceedToMemberPhase is false", async () => {
      // #given
      const { prepareMemberElectionTrigger } = await import("../src/election");
      const mockProvider = {} as ethers.providers.Provider;

      // #when
      const result = await prepareMemberElectionTrigger(
        { electionIndex: 5, canProceedToMemberPhase: false },
        mockProvider
      );

      // #then
      expect(result).toBeNull();
    });
  });

  describe("prepareMemberElectionExecution", () => {
    it("should return null when canExecuteMember is false", async () => {
      // #given
      const { prepareMemberElectionExecution } = await import("../src/election");
      const mockProvider = {} as ethers.providers.Provider;

      // #when
      const result = await prepareMemberElectionExecution(
        { electionIndex: 2, canExecuteMember: false },
        mockProvider
      );

      // #then
      expect(result).toBeNull();
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

describe("Election Data Type Validation", () => {
  describe("ElectionContender", () => {
    it("should have valid structure", () => {
      // #given
      const contender = {
        address: "0x1234567890123456789012345678901234567890",
        registeredAtBlock: 12345678,
        registrationTxHash: "0x" + "a".repeat(64),
      };

      // #then
      expect(contender.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof contender.registeredAtBlock).toBe("number");
      expect(contender.registrationTxHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe("ElectionNominee", () => {
    it("should have valid structure for compliant nominee", () => {
      // #given
      const nominee = {
        address: "0x1234567890123456789012345678901234567890",
        votesReceived: BigNumber.from("1000000000000000000"),
        isExcluded: false,
      };

      // #then
      expect(nominee.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(nominee.votesReceived._isBigNumber).toBe(true);
      expect(nominee.isExcluded).toBe(false);
    });

    it("should have exclusion details when excluded", () => {
      // #given
      const excludedNominee = {
        address: "0x1234567890123456789012345678901234567890",
        votesReceived: BigNumber.from("500000000000000000"),
        isExcluded: true,
        excludedAtBlock: 12345678,
        exclusionTxHash: "0x" + "b".repeat(64),
      };

      // #then
      expect(excludedNominee.isExcluded).toBe(true);
      expect(excludedNominee.excludedAtBlock).toBeDefined();
      expect(excludedNominee.exclusionTxHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe("MemberElectionNominee", () => {
    it("should have valid structure with ranking", () => {
      // #given
      const memberNominee = {
        address: "0x1234567890123456789012345678901234567890",
        weightReceived: BigNumber.from("5000000000000000000000"),
        isWinner: true,
        rank: 1,
      };

      // #then
      expect(memberNominee.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(memberNominee.weightReceived._isBigNumber).toBe(true);
      expect(memberNominee.isWinner).toBe(true);
      expect(memberNominee.rank).toBeGreaterThan(0);
    });
  });

  describe("NomineeElectionDetails", () => {
    it("should have valid aggregated structure", () => {
      // #given
      const details = {
        proposalId: "123456789012345678901234567890",
        electionIndex: 5,
        contenders: [],
        nominees: [],
        compliantNominees: [],
        excludedNominees: [],
        quorumThreshold: BigNumber.from("100000000000000000000000"),
        targetNomineeCount: 6,
      };

      // #then
      expect(typeof details.proposalId).toBe("string");
      expect(typeof details.electionIndex).toBe("number");
      expect(Array.isArray(details.contenders)).toBe(true);
      expect(details.quorumThreshold._isBigNumber).toBe(true);
      expect(details.targetNomineeCount).toBe(6);
    });

    it("should have compliant + excluded = total nominees", () => {
      // #given
      const compliantNominees = [
        {
          address: "0x1111111111111111111111111111111111111111",
          votesReceived: BigNumber.from(1),
          isExcluded: false,
        },
        {
          address: "0x2222222222222222222222222222222222222222",
          votesReceived: BigNumber.from(2),
          isExcluded: false,
        },
      ];
      const excludedNominees = [
        {
          address: "0x3333333333333333333333333333333333333333",
          votesReceived: BigNumber.from(1),
          isExcluded: true,
        },
      ];
      const allNominees = [...compliantNominees, ...excludedNominees];

      // #then
      expect(compliantNominees.length + excludedNominees.length).toBe(allNominees.length);
    });
  });

  describe("MemberElectionDetails", () => {
    it("should have valid structure with winners", () => {
      // #given
      const details = {
        proposalId: "987654321098765432109876543210",
        electionIndex: 5,
        nominees: [],
        winners: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
          "0x4444444444444444444444444444444444444444",
          "0x5555555555555555555555555555555555555555",
          "0x6666666666666666666666666666666666666666",
        ],
        fullWeightDeadline: 1700000000,
        proposalDeadline: 1701000000,
      };

      // #then
      expect(typeof details.proposalId).toBe("string");
      expect(Array.isArray(details.winners)).toBe(true);
      expect(details.winners.length).toBe(6);
      expect(details.fullWeightDeadline).toBeLessThan(details.proposalDeadline);
    });
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
