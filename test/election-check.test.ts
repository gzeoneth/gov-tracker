/**
 * Tests for CLI election check utilities
 *
 * Tests formatElectionStatus function.
 * No RPC calls needed - pure unit tests.
 */

import { describe, expect, it } from "vitest";
import { formatElectionStatus } from "../src/cli/lib/election-check";
import { ElectionStatus, ElectionProposalStatus } from "../src/index";

describe("Election Check Utilities", () => {
  describe("formatElectionStatus", () => {
    const baseStatus: ElectionStatus = {
      electionCount: 3,
      cohort: 0,
      nextElectionTimestamp: 1700000000,
      currentL1Timestamp: 1699990000,
      canCreateElection: false,
      secondsUntilElection: 10000,
      timeUntilElection: "2 hours 46 minutes",
    };

    it("should format basic election status", () => {
      const output = formatElectionStatus(baseStatus);

      expect(output).toContain("=== Security Council Election Status ===");
      expect(output).toContain("Election Count: 3");
      expect(output).toContain("Cohort: First (0)");
      expect(output).toContain("Next Election:");
      expect(output).toContain("Current L1 Time:");
      expect(output).toContain("Can Create Election: NO");
      expect(output).toContain("Time Until Election: 2 hours 46 minutes");
    });

    it("should show cohort 1 correctly", () => {
      const status: ElectionStatus = { ...baseStatus, cohort: 1 };
      const output = formatElectionStatus(status);

      expect(output).toContain("Cohort: Second (1)");
    });

    it("should show YES when election can be created", () => {
      const status: ElectionStatus = { ...baseStatus, canCreateElection: true };
      const output = formatElectionStatus(status);

      expect(output).toContain("Can Create Election: YES");
      expect(output).not.toContain("Time Until Election:");
    });

    it("should format election proposal status when provided", () => {
      const electionStatus: ElectionProposalStatus = {
        electionIndex: 2,
        phase: "NOMINEE_SELECTION",
        cohort: 0,
        compliantNomineeCount: 4,
        targetNomineeCount: 6,
        nomineeProposalId: "123456789",
        nomineeProposalState: "Active",
        memberProposalId: null,
        memberProposalState: null,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
      };

      const output = formatElectionStatus(baseStatus, electionStatus);

      expect(output).toContain("=== Election #2 Status ===");
      expect(output).toContain("Phase: NOMINEE_SELECTION");
      expect(output).toContain("Compliant Nominees: 4/6");
      expect(output).toContain("Nominee Proposal: 123456789");
      expect(output).toContain("Nominee State: Active");
      expect(output).toContain("Can Proceed to Member Phase: NO");
    });

    it("should include member proposal info when available", () => {
      const electionStatus: ElectionProposalStatus = {
        electionIndex: 2,
        phase: "MEMBER_ELECTION",
        cohort: 0,
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        nomineeProposalId: null,
        nomineeProposalState: null,
        memberProposalId: "987654321",
        memberProposalState: "Succeeded",
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
      };

      const output = formatElectionStatus(baseStatus, electionStatus);

      expect(output).toContain("Member Proposal: 987654321");
      expect(output).toContain("Member State: Succeeded");
    });

    it("should show vetting period info when in vetting", () => {
      const electionStatus: ElectionProposalStatus = {
        electionIndex: 2,
        phase: "VETTING_PERIOD",
        cohort: 0,
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        nomineeProposalId: null,
        nomineeProposalState: null,
        memberProposalId: null,
        memberProposalState: null,
        isInVettingPeriod: true,
        vettingDeadline: 24000000,
        canProceedToMemberPhase: true,
      };

      const output = formatElectionStatus(baseStatus, electionStatus);

      expect(output).toContain("In Vetting Period: YES (deadline block 24000000)");
      expect(output).toContain("Can Proceed to Member Phase: YES");
    });

    it("should not show vetting period when not in vetting", () => {
      const electionStatus: ElectionProposalStatus = {
        electionIndex: 2,
        phase: "MEMBER_ELECTION",
        cohort: 0,
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        nomineeProposalId: null,
        nomineeProposalState: null,
        memberProposalId: null,
        memberProposalState: null,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
      };

      const output = formatElectionStatus(baseStatus, electionStatus);

      expect(output).not.toContain("In Vetting Period:");
    });

    it("should format all fields together correctly", () => {
      const status: ElectionStatus = {
        electionCount: 5,
        cohort: 1,
        nextElectionTimestamp: 1710000000,
        currentL1Timestamp: 1709000000,
        canCreateElection: true,
        secondsUntilElection: 0,
        timeUntilElection: "0",
      };

      const electionStatus: ElectionProposalStatus = {
        electionIndex: 4,
        phase: "NOMINEE_SELECTION",
        cohort: 1,
        compliantNomineeCount: 3,
        targetNomineeCount: 6,
        nomineeProposalId: "111",
        nomineeProposalState: "Pending",
        memberProposalId: "222",
        memberProposalState: "Queued",
        isInVettingPeriod: true,
        vettingDeadline: 25000000,
        canProceedToMemberPhase: false,
      };

      const output = formatElectionStatus(status, electionStatus);

      expect(output).toContain("Election Count: 5");
      expect(output).toContain("Cohort: Second (1)");
      expect(output).toContain("Can Create Election: YES");
      expect(output).toContain("=== Election #4 Status ===");
      expect(output).toContain("Phase: NOMINEE_SELECTION");
      expect(output).toContain("Compliant Nominees: 3/6");
      expect(output).toContain("Nominee Proposal: 111");
      expect(output).toContain("Member Proposal: 222");
      expect(output).toContain("In Vetting Period: YES");
    });
  });
});
