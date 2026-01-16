/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mocked unit tests for src/election/status.ts
 *
 * Tests election status functions with mocked contract calls.
 * No real RPC calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BigNumber } from "ethers";
import type { ProposalState } from "../src/types";

// Mock external dependencies before importing the module under test
vi.mock("../src/utils/rpc-utils", () => ({
  queryWithRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../src/utils/timing", () => ({
  getL1BlockNumberFromL2: vi.fn(),
}));

vi.mock("../src/utils/multicall", () => ({
  multicall: vi.fn(),
  buildCallInput: vi.fn((targetAddr: string, _iface: unknown, method: string, args: unknown[]) => ({
    targetAddr,
    method,
    args,
  })),
}));

vi.mock("../src/election/contracts", () => ({
  getNomineeGovernor: vi.fn(),
}));

// Import the module under test after mocking
import {
  getElectionCount,
  determineElectionPhase,
  checkElectionStatus,
  hasVettingPeriod,
} from "../src/election/status";
import { queryWithRetry } from "../src/utils/rpc-utils";
import { getL1BlockNumberFromL2 } from "../src/utils/timing";
import { multicall } from "../src/utils/multicall";
import { getNomineeGovernor } from "../src/election/contracts";

describe("election/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getElectionCount", () => {
    it("should return election count from multicall", async () => {
      // #given
      const mockL2Provider = {} as any;
      const electionCount = BigNumber.from(5);
      vi.mocked(multicall).mockResolvedValueOnce([electionCount]);

      // #when
      const result = await getElectionCount(mockL2Provider);

      // #then
      expect(result).toBe(5);
      expect(multicall).toHaveBeenCalledTimes(1);
    });

    it("should return zero for no elections", async () => {
      // #given
      const mockL2Provider = {} as any;
      const electionCount = BigNumber.from(0);
      vi.mocked(multicall).mockResolvedValueOnce([electionCount]);

      // #when
      const result = await getElectionCount(mockL2Provider);

      // #then
      expect(result).toBe(0);
    });

    it("should use custom governor address when provided", async () => {
      // #given
      const mockL2Provider = {} as any;
      const customGovernor = "0xCustomGovernor";
      const electionCount = BigNumber.from(3);
      vi.mocked(multicall).mockResolvedValueOnce([electionCount]);

      // #when
      const result = await getElectionCount(mockL2Provider, customGovernor);

      // #then
      expect(result).toBe(3);
    });

    it("should make only one multicall (lightweight)", async () => {
      // #given
      const mockL2Provider = {} as any;
      const electionCount = BigNumber.from(10);
      vi.mocked(multicall).mockResolvedValueOnce([electionCount]);

      // #when
      await getElectionCount(mockL2Provider);

      // #then - verify it's lightweight (single multicall, no L1 block fetch)
      expect(multicall).toHaveBeenCalledTimes(1);
      expect(getL1BlockNumberFromL2).not.toHaveBeenCalled();
      expect(queryWithRetry).not.toHaveBeenCalled();
    });
  });

  describe("determineElectionPhase", () => {
    it("should return COMPLETED when member proposal is Executed", () => {
      // #given
      const nomineeProposalState: ProposalState = "Active";
      const memberProposalId = "12345";
      const memberProposalState: ProposalState = "Executed";
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("COMPLETED");
    });

    it("should return PENDING_EXECUTION when member proposal is Succeeded", () => {
      // #given
      const nomineeProposalState: ProposalState = "Executed";
      const memberProposalId = "12345";
      const memberProposalState: ProposalState = "Succeeded";
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("PENDING_EXECUTION");
    });

    it("should return PENDING_EXECUTION when member proposal is Queued", () => {
      // #given
      const nomineeProposalState: ProposalState = "Executed";
      const memberProposalId = "12345";
      const memberProposalState: ProposalState = "Queued";
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("PENDING_EXECUTION");
    });

    it("should return MEMBER_ELECTION when member proposal exists but not Succeeded/Queued/Executed", () => {
      // #given
      const nomineeProposalState: ProposalState = "Executed";
      const memberProposalId = "12345";
      const memberProposalState: ProposalState = "Active";
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("MEMBER_ELECTION");
    });

    it("should return MEMBER_ELECTION when member proposal is Pending", () => {
      // #given
      const nomineeProposalState: ProposalState = "Executed";
      const memberProposalId = "12345";
      const memberProposalState: ProposalState = "Pending";
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("MEMBER_ELECTION");
    });

    it("should return PENDING_EXECUTION when nominee proposal is Executed but no member proposal", () => {
      // #given
      const nomineeProposalState: ProposalState = "Executed";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("PENDING_EXECUTION");
    });

    it("should return VETTING_PERIOD when in vetting period", () => {
      // #given
      const nomineeProposalState: ProposalState = "Active";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = true;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("VETTING_PERIOD");
    });

    it("should return NOMINEE_SELECTION when nominee proposal is Active", () => {
      // #given
      const nomineeProposalState: ProposalState = "Active";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("NOMINEE_SELECTION");
    });

    it("should return CONTENDER_SUBMISSION when nominee proposal is Pending", () => {
      // #given
      const nomineeProposalState: ProposalState = "Pending";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("CONTENDER_SUBMISSION");
    });

    it("should return PENDING_EXECUTION when nominee proposal is Succeeded", () => {
      // #given
      const nomineeProposalState: ProposalState = "Succeeded";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("PENDING_EXECUTION");
    });

    it("should return NOT_STARTED when no proposal state", () => {
      // #given
      const nomineeProposalState: ProposalState | null = null;
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("NOT_STARTED");
    });

    it("should return NOT_STARTED when nominee proposal is Defeated", () => {
      // #given
      const nomineeProposalState: ProposalState = "Defeated";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("NOT_STARTED");
    });

    it("should return NOT_STARTED when nominee proposal is Canceled", () => {
      // #given
      const nomineeProposalState: ProposalState = "Canceled";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("NOT_STARTED");
    });

    it("should return NOT_STARTED when nominee proposal is Expired", () => {
      // #given
      const nomineeProposalState: ProposalState = "Expired";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("NOT_STARTED");
    });

    it("should return NOT_STARTED when nominee proposal is Queued", () => {
      // #given - Queued state is an unusual state for nominee election, treated as NOT_STARTED
      const nomineeProposalState: ProposalState = "Queued";
      const memberProposalId: string | null = null;
      const memberProposalState: ProposalState | null = null;
      const isInVettingPeriod = false;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("NOT_STARTED");
    });

    it("should prioritize COMPLETED over vetting period", () => {
      // #given - member executed takes precedence even if vetting flag is true
      const nomineeProposalState: ProposalState = "Executed";
      const memberProposalId = "12345";
      const memberProposalState: ProposalState = "Executed";
      const isInVettingPeriod = true;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("COMPLETED");
    });

    it("should prioritize MEMBER_ELECTION over vetting period when member proposal exists", () => {
      // #given - member election phase takes precedence over vetting
      const nomineeProposalState: ProposalState = "Executed";
      const memberProposalId = "12345";
      const memberProposalState: ProposalState = "Active";
      const isInVettingPeriod = true;

      // #when
      const result = determineElectionPhase(
        nomineeProposalState,
        memberProposalId,
        memberProposalState,
        isInVettingPeriod
      );

      // #then
      expect(result).toBe("MEMBER_ELECTION");
    });
  });

  describe("hasVettingPeriod", () => {
    it("should return true when governor has nomineeVetter function", async () => {
      // #given
      const mockGovernor = {
        nomineeVetter: vi.fn().mockResolvedValue("0x1234567890abcdef"),
      };
      vi.mocked(getNomineeGovernor).mockReturnValue(mockGovernor as any);

      const mockProvider = {} as any;

      // #when
      const result = await hasVettingPeriod("0xGovernorAddress", mockProvider);

      // #then
      expect(result).toBe(true);
      expect(getNomineeGovernor).toHaveBeenCalledWith("0xGovernorAddress", mockProvider);
    });

    it("should return false when governor does not have nomineeVetter function", async () => {
      // #given
      const mockGovernor = {
        nomineeVetter: vi.fn().mockRejectedValue(new Error("function not found")),
      };
      vi.mocked(getNomineeGovernor).mockReturnValue(mockGovernor as any);

      const mockProvider = {} as any;

      // #when
      const result = await hasVettingPeriod("0xGovernorAddress", mockProvider);

      // #then
      expect(result).toBe(false);
    });

    it("should return false when nomineeVetter call reverts", async () => {
      // #given
      const mockGovernor = {
        nomineeVetter: vi.fn().mockRejectedValue(new Error("CALL_EXCEPTION")),
      };
      vi.mocked(getNomineeGovernor).mockReturnValue(mockGovernor as any);

      const mockProvider = {} as any;

      // #when
      const result = await hasVettingPeriod("0xGovernorAddress", mockProvider);

      // #then
      expect(result).toBe(false);
    });
  });

  describe("checkElectionStatus", () => {
    it("should return election status when election can be created", async () => {
      // #given
      const mockL2Provider = {} as any;
      const mockL1Provider = {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1700000100,
        }),
      } as any;

      const l1BlockNumber = BigNumber.from(18500000);
      const electionCount = BigNumber.from(3);
      const nextElectionTimestamp = BigNumber.from(1700000000);
      const cohort = 0;

      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(l1BlockNumber);
      vi.mocked(multicall)
        .mockResolvedValueOnce([electionCount])
        .mockResolvedValueOnce([nextElectionTimestamp, cohort]);
      vi.mocked(queryWithRetry).mockImplementation((fn) => fn());

      // #when
      const result = await checkElectionStatus(mockL2Provider, mockL1Provider);

      // #then
      expect(result.electionCount).toBe(3);
      expect(result.cohort).toBe(0);
      expect(result.nextElectionTimestamp).toBe(1700000000);
      expect(result.currentL1Timestamp).toBe(1700000100);
      expect(result.canCreateElection).toBe(true);
      expect(result.secondsUntilElection).toBe(0);
    });

    it("should return election status when election cannot be created yet", async () => {
      // #given
      const mockL2Provider = {} as any;
      const mockL1Provider = {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1699990000,
        }),
      } as any;

      const l1BlockNumber = BigNumber.from(18500000);
      const electionCount = BigNumber.from(5);
      const nextElectionTimestamp = BigNumber.from(1700000000);
      const cohort = 1;

      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(l1BlockNumber);
      vi.mocked(multicall)
        .mockResolvedValueOnce([electionCount])
        .mockResolvedValueOnce([nextElectionTimestamp, cohort]);
      vi.mocked(queryWithRetry).mockImplementation((fn) => fn());

      // #when
      const result = await checkElectionStatus(mockL2Provider, mockL1Provider);

      // #then
      expect(result.electionCount).toBe(5);
      expect(result.cohort).toBe(1);
      expect(result.canCreateElection).toBe(false);
      expect(result.secondsUntilElection).toBe(10000);
    });

    it("should throw when L1 block is not found", async () => {
      // #given
      const mockL2Provider = {} as any;
      const mockL1Provider = {
        getBlock: vi.fn().mockResolvedValue(null),
      } as any;

      const l1BlockNumber = BigNumber.from(18500000);
      const electionCount = BigNumber.from(3);

      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(l1BlockNumber);
      vi.mocked(multicall).mockResolvedValueOnce([electionCount]);
      vi.mocked(queryWithRetry).mockImplementation((fn) => fn());

      // #when / #then
      await expect(checkElectionStatus(mockL2Provider, mockL1Provider)).rejects.toThrow(
        "L1 block 18500000 not found"
      );
    });

    it("should use custom nominee governor address when provided", async () => {
      // #given
      const customGovernorAddress = "0xCustomGovernorAddress";
      const mockL2Provider = {} as any;
      const mockL1Provider = {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1700000100,
        }),
      } as any;

      const l1BlockNumber = BigNumber.from(18500000);
      const electionCount = BigNumber.from(1);
      const nextElectionTimestamp = BigNumber.from(1700000000);
      const cohort = 0;

      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(l1BlockNumber);
      vi.mocked(multicall)
        .mockResolvedValueOnce([electionCount])
        .mockResolvedValueOnce([nextElectionTimestamp, cohort]);
      vi.mocked(queryWithRetry).mockImplementation((fn) => fn());

      // #when
      const result = await checkElectionStatus(
        mockL2Provider,
        mockL1Provider,
        customGovernorAddress
      );

      // #then
      expect(result.electionCount).toBe(1);
      expect(result.canCreateElection).toBe(true);
    });

    it("should calculate timeUntilElection correctly", async () => {
      // #given
      const mockL2Provider = {} as any;
      const mockL1Provider = {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1699913600,
        }),
      } as any;

      const l1BlockNumber = BigNumber.from(18500000);
      const electionCount = BigNumber.from(2);
      const nextElectionTimestamp = BigNumber.from(1700000000);
      const cohort = 0;

      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(l1BlockNumber);
      vi.mocked(multicall)
        .mockResolvedValueOnce([electionCount])
        .mockResolvedValueOnce([nextElectionTimestamp, cohort]);
      vi.mocked(queryWithRetry).mockImplementation((fn) => fn());

      // #when
      const result = await checkElectionStatus(mockL2Provider, mockL1Provider);

      // #then
      expect(result.secondsUntilElection).toBe(86400);
      expect(result.timeUntilElection).toContain("d");
    });

    it("should handle zero seconds until election", async () => {
      // #given - timestamp exactly at election time
      const mockL2Provider = {} as any;
      const mockL1Provider = {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1700000000,
        }),
      } as any;

      const l1BlockNumber = BigNumber.from(18500000);
      const electionCount = BigNumber.from(4);
      const nextElectionTimestamp = BigNumber.from(1700000000);
      const cohort = 1;

      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(l1BlockNumber);
      vi.mocked(multicall)
        .mockResolvedValueOnce([electionCount])
        .mockResolvedValueOnce([nextElectionTimestamp, cohort]);
      vi.mocked(queryWithRetry).mockImplementation((fn) => fn());

      // #when
      const result = await checkElectionStatus(mockL2Provider, mockL1Provider);

      // #then
      expect(result.secondsUntilElection).toBe(0);
      expect(result.canCreateElection).toBe(true);
    });

    it("should handle election count of zero", async () => {
      // #given - first ever election
      const mockL2Provider = {} as any;
      const mockL1Provider = {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1700000100,
        }),
      } as any;

      const l1BlockNumber = BigNumber.from(18500000);
      const electionCount = BigNumber.from(0);
      const nextElectionTimestamp = BigNumber.from(1700000000);
      const cohort = 0;

      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(l1BlockNumber);
      vi.mocked(multicall)
        .mockResolvedValueOnce([electionCount])
        .mockResolvedValueOnce([nextElectionTimestamp, cohort]);
      vi.mocked(queryWithRetry).mockImplementation((fn) => fn());

      // #when
      const result = await checkElectionStatus(mockL2Provider, mockL1Provider);

      // #then
      expect(result.electionCount).toBe(0);
      expect(result.canCreateElection).toBe(true);
    });
  });
});
