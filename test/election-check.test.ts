/**
 * Tests for CLI election check utilities
 *
 * Tests formatElectionStatus function.
 * No RPC calls needed - pure unit tests.
 *
 * RPC tests for checkAndExecuteElection function.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { formatElectionStatus } from "../src/cli/lib/election-check";
import { ProviderBundle } from "../src/cli/lib/cli";
import { ElectionStatus, ElectionProposalStatus, DEFAULT_RPC_URLS } from "../src/index";
import { shouldSkipRpc } from "./helpers";

dotenv.config({ quiet: true });

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
        canExecuteMember: false,
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
        canExecuteMember: true,
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
        canExecuteMember: false,
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
        canExecuteMember: false,
      };

      const output = formatElectionStatus(baseStatus, electionStatus);

      expect(output).not.toContain("In Vetting Period:");
    });

    it("should format completed election status correctly", () => {
      // #given a completed election
      const electionStatus: ElectionProposalStatus = {
        electionIndex: 0,
        phase: "COMPLETED",
        cohort: 0,
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        nomineeProposalId: "123456789",
        nomineeProposalState: "Executed",
        memberProposalId: "987654321",
        memberProposalState: "Executed",
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: false,
      };

      // #when formatting
      const output = formatElectionStatus(baseStatus, electionStatus);

      // #then should show COMPLETED phase with no actions available
      expect(output).toContain("Phase: COMPLETED");
      expect(output).toContain("Member State: Executed");
      expect(output).toContain("Can Proceed to Member Phase: NO");
    });

    it("should format PENDING_EXECUTION phase with canExecuteMember true", () => {
      // #given an election in PENDING_EXECUTION phase
      const electionStatus: ElectionProposalStatus = {
        electionIndex: 1,
        phase: "PENDING_EXECUTION",
        cohort: 1,
        compliantNomineeCount: 6,
        targetNomineeCount: 6,
        nomineeProposalId: "111",
        nomineeProposalState: "Executed",
        memberProposalId: "222",
        memberProposalState: "Succeeded",
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        canExecuteMember: true,
      };

      // #when formatting
      const output = formatElectionStatus(baseStatus, electionStatus);

      // #then should show executable action
      expect(output).toContain("Phase: PENDING_EXECUTION");
      expect(output).toContain("Member State: Succeeded");
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
        canExecuteMember: false,
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

/**
 * RPC tests for checkAndExecuteElection
 */
describe.skipIf(shouldSkipRpc())(
  "checkAndExecuteElection (RPC)",
  {
    timeout: 180000, // 3 minutes - election tracking queries L1, L2, and Nova
  },
  () => {
    // Import checkAndExecuteElection dynamically to avoid mock conflicts
    let checkAndExecuteElection: typeof import("../src/cli/lib/election-check").checkAndExecuteElection;
    let providers: ProviderBundle;

    beforeAll(async () => {
      const module = await import("../src/cli/lib/election-check");
      checkAndExecuteElection = module.checkAndExecuteElection;

      const ethRpc = process.env.ETH_RPC;
      if (!ethRpc) {
        throw new Error("ETH_RPC required for election check tests");
      }
      const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
      const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

      providers = {
        l1Provider: new ethers.providers.JsonRpcProvider(ethRpc),
        l2Provider: new ethers.providers.JsonRpcProvider(arbRpc),
        novaProvider: new ethers.providers.JsonRpcProvider(novaRpc),
      };
    });

    it("should return election status without write mode", async () => {
      // #when checking election status without write mode
      const result = await checkAndExecuteElection(providers, null, {
        write: false,
        verbose: false,
      });

      // #then should return valid status with no errors
      expect(result.status).toBeDefined();
      expect(result.status.electionCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should include current election status when elections exist", async () => {
      // #when checking election status
      const result = await checkAndExecuteElection(providers, null, {
        write: false,
        verbose: false,
      });

      // #then if elections exist, should include current election status
      if (result.status.electionCount > 0) {
        expect(result.currentElectionStatus).toBeDefined();
        expect(result.currentElectionStatus?.phase).toBeDefined();
      }
    });

    it("should not execute transactions when signer is null", async () => {
      // #when checking with no signer
      const result = await checkAndExecuteElection(providers, null, {
        write: true, // write is true but signer is null
        verbose: false,
      });

      // #then should not execute (no electionCreated or memberElectionTriggered)
      expect(result.electionCreated).toBeUndefined();
      expect(result.memberElectionTriggered).toBeUndefined();
    });

    it("should handle verbose mode", async () => {
      // #when checking with verbose mode
      const result = await checkAndExecuteElection(providers, null, {
        write: false,
        verbose: true,
      });

      // #then should still return valid status
      expect(result.status).toBeDefined();
    });
  }
);
