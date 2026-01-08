/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mocked tests for checkAndExecuteElection execution paths
 *
 * These tests use vi.mock() to test execution paths that require mocking.
 * Separated from RPC tests to avoid mock conflicts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { ElectionStatus, ElectionProposalStatus } from "../src/index";
import { ProviderBundle } from "../src/cli/lib/cli";

// Mock createTracker
vi.mock("../src/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/index")>();
  return {
    ...actual,
    createTracker: vi.fn(),
  };
});

// Mock executeTransaction
vi.mock("../src/cli/lib/cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cli/lib/cli")>();
  return {
    ...actual,
    executeTransaction: vi.fn(),
  };
});

// Import after mocking
import { checkAndExecuteElection } from "../src/cli/lib/election-check";
import { createTracker } from "../src/index";
import { executeTransaction } from "../src/cli/lib/cli";

describe("checkAndExecuteElection (Mocked)", () => {
  const mockProviders: ProviderBundle = {
    l1Provider: {} as ethers.providers.JsonRpcProvider,
    l2Provider: {} as ethers.providers.JsonRpcProvider,
    novaProvider: {} as ethers.providers.JsonRpcProvider,
  };

  const baseStatus: ElectionStatus = {
    electionCount: 3,
    cohort: 0,
    nextElectionTimestamp: 1700000000,
    currentL1Timestamp: 1699990000,
    canCreateElection: false,
    secondsUntilElection: 10000,
    timeUntilElection: "2 hours 46 minutes",
  };

  const currentElection: ElectionProposalStatus = {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should execute createElection when canCreate is true and write mode enabled", async () => {
    // #given tracker returns canCreate=true with prepared transaction
    const mockCheckElection = vi.fn().mockResolvedValue({
      status: { ...baseStatus, canCreateElection: true },
      canCreate: true,
      prepared: {
        createElection: {
          to: "0x1234",
          data: "0xabcd",
          value: "0",
          chain: "arb1",
          chainId: 42161,
          description: "createElection()",
        },
      },
      currentElection: null,
      canTriggerMember: false,
    });
    vi.mocked(createTracker).mockReturnValue({ checkElection: mockCheckElection } as any);
    vi.mocked(executeTransaction).mockResolvedValue({ success: true, txHash: "0xtxhash" });

    const mockSigner = {} as ethers.Wallet;

    // #when executing with write=true
    const result = await checkAndExecuteElection(mockProviders, mockSigner, {
      write: true,
      verbose: false,
    });

    // #then should execute createElection and set electionCreated=true
    expect(executeTransaction).toHaveBeenCalled();
    expect(result.electionCreated).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should handle failed createElection execution", async () => {
    // #given tracker returns canCreate=true
    const mockCheckElection = vi.fn().mockResolvedValue({
      status: { ...baseStatus, canCreateElection: true },
      canCreate: true,
      prepared: {
        createElection: {
          to: "0x1234",
          data: "0xabcd",
          value: "0",
          chain: "arb1",
          chainId: 42161,
          description: "createElection()",
        },
      },
      currentElection: null,
      canTriggerMember: false,
    });
    vi.mocked(createTracker).mockReturnValue({ checkElection: mockCheckElection } as any);
    vi.mocked(executeTransaction).mockResolvedValue({
      success: false,
      error: "Transaction reverted",
    });

    const mockSigner = {} as ethers.Wallet;

    // #when executing with write=true but transaction fails
    const result = await checkAndExecuteElection(mockProviders, mockSigner, {
      write: true,
      verbose: false,
    });

    // #then should add error and not set electionCreated
    expect(result.electionCreated).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Failed to create election");
  });

  it("should execute triggerMember when canTriggerMember is true and write mode enabled", async () => {
    // #given tracker returns canTriggerMember=true with prepared transaction
    const mockCheckElection = vi.fn().mockResolvedValue({
      status: baseStatus,
      canCreate: false,
      prepared: {
        triggerMember: {
          to: "0x5678",
          data: "0xefgh",
          value: "0",
          chain: "arb1",
          chainId: 42161,
          description: "triggerMember()",
        },
      },
      currentElection: currentElection,
      canTriggerMember: true,
    });
    vi.mocked(createTracker).mockReturnValue({ checkElection: mockCheckElection } as any);
    vi.mocked(executeTransaction).mockResolvedValue({ success: true, txHash: "0xtxhash2" });

    const mockSigner = {} as ethers.Wallet;

    // #when executing with write=true
    const result = await checkAndExecuteElection(mockProviders, mockSigner, {
      write: true,
      verbose: false,
    });

    // #then should execute triggerMember and set memberElectionTriggered=true
    expect(executeTransaction).toHaveBeenCalled();
    expect(result.memberElectionTriggered).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should handle failed triggerMember execution", async () => {
    // #given tracker returns canTriggerMember=true
    const mockCheckElection = vi.fn().mockResolvedValue({
      status: baseStatus,
      canCreate: false,
      prepared: {
        triggerMember: {
          to: "0x5678",
          data: "0xefgh",
          value: "0",
          chain: "arb1",
          chainId: 42161,
          description: "triggerMember()",
        },
      },
      currentElection: currentElection,
      canTriggerMember: true,
    });
    vi.mocked(createTracker).mockReturnValue({ checkElection: mockCheckElection } as any);
    vi.mocked(executeTransaction).mockResolvedValue({
      success: false,
      error: "Gas too low",
    });

    const mockSigner = {} as ethers.Wallet;

    // #when executing with write=true but transaction fails
    const result = await checkAndExecuteElection(mockProviders, mockSigner, {
      write: true,
      verbose: false,
    });

    // #then should add error and not set memberElectionTriggered
    expect(result.memberElectionTriggered).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Failed to trigger member election");
  });

  it("should log vetting period info in verbose mode", async () => {
    // #given tracker returns current election in vetting period
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const electionInVetting: ElectionProposalStatus = {
      ...currentElection,
      isInVettingPeriod: true,
      vettingDeadline: 25000000,
    };
    const mockCheckElection = vi.fn().mockResolvedValue({
      status: baseStatus,
      canCreate: false,
      prepared: {},
      currentElection: electionInVetting,
      canTriggerMember: false,
    });
    vi.mocked(createTracker).mockReturnValue({ checkElection: mockCheckElection } as any);

    // #when checking with verbose=true
    const result = await checkAndExecuteElection(mockProviders, null, {
      write: false,
      verbose: true,
    });

    // #then should log vetting period info
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("vetting period"));
    expect(result.currentElectionStatus?.isInVettingPeriod).toBe(true);

    consoleSpy.mockRestore();
  });

  it("should log dry run info when verbose without write mode", async () => {
    // #given tracker returns canCreate=true
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockCheckElection = vi.fn().mockResolvedValue({
      status: { ...baseStatus, canCreateElection: true },
      canCreate: true,
      prepared: {
        createElection: {
          to: "0x1234",
          data: "0xabcd",
          value: "0",
          chain: "arb1",
          chainId: 42161,
          description: "createElection()",
        },
      },
      currentElection: null,
      canTriggerMember: false,
    });
    vi.mocked(createTracker).mockReturnValue({ checkElection: mockCheckElection } as any);

    // #when checking with verbose=true but write=false
    await checkAndExecuteElection(mockProviders, null, {
      write: false,
      verbose: true,
    });

    // #then should log dry run info (formatDryRun output)
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should log time until election in verbose mode when not ready", async () => {
    // #given tracker returns canCreate=false
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockCheckElection = vi.fn().mockResolvedValue({
      status: baseStatus,
      canCreate: false,
      prepared: {},
      currentElection: null,
      canTriggerMember: false,
    });
    vi.mocked(createTracker).mockReturnValue({ checkElection: mockCheckElection } as any);

    // #when checking with verbose=true
    await checkAndExecuteElection(mockProviders, null, {
      write: false,
      verbose: true,
    });

    // #then should log time until election
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Time until election"));

    consoleSpy.mockRestore();
  });
});
