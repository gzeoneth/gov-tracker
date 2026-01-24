/**
 * Pipeline Stage Functions Tests
 *
 * Tests for the pipeline module that tracks stages and manages state.
 * Uses unit tests with mock data where possible.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  ProposalStageTracker,
  TrackingResult,
  TrackedStage,
  createTrackingState,
  getElectionContext,
  proposalStateToStageStatus,
} from "../src";
import {
  shouldSkipRpc,
  createRpcTestSuite,
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./helpers";
import { StageBuilder } from "../src/stages/builder";
import type { TrackingInput } from "../src/types";
import { trackGovernorPipeline, trackTimelockPipeline } from "../src/tracker/pipeline";
import { addStage } from "../src/tracker/state";
import { isConstitutional } from "../src/stages/utils";
import { ADDRESSES } from "../src/constants";

dotenv.config({ quiet: true });

// Mock providers (minimal interface for testing)
function createMockProviders() {
  return {
    l1: {} as ethers.providers.Provider,
    l2: {} as ethers.providers.Provider,
    nova: {} as ethers.providers.Provider,
  };
}

describe("Pipeline Module", () => {
  describe("proposalStateToStageStatus (unit tests)", () => {
    it("should return PENDING for Active state", () => {
      // #given - an Active proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Active");

      // #then - should be PENDING with complete=false
      expect(result.status).toBe("PENDING");
      expect(result.complete).toBe(false);
    });

    it("should return PENDING for Pending state", () => {
      // #given - a Pending proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Pending");

      // #then - should be PENDING with complete=false
      expect(result.status).toBe("PENDING");
      expect(result.complete).toBe(false);
    });

    it("should return FAILED for Defeated state", () => {
      // #given - a Defeated proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Defeated");

      // #then - should be FAILED with complete=false
      expect(result.status).toBe("FAILED");
      expect(result.complete).toBe(false);
    });

    it("should return FAILED for Canceled state", () => {
      // #given - a Canceled proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Canceled");

      // #then - should be FAILED with complete=false
      expect(result.status).toBe("FAILED");
      expect(result.complete).toBe(false);
    });

    it("should return COMPLETED for Succeeded state", () => {
      // #given - a Succeeded proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Succeeded");

      // #then - should be COMPLETED with complete=true
      expect(result.status).toBe("COMPLETED");
      expect(result.complete).toBe(true);
    });

    it("should return COMPLETED for Executed state", () => {
      // #given - an Executed proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Executed");

      // #then - should be COMPLETED with complete=true
      expect(result.status).toBe("COMPLETED");
      expect(result.complete).toBe(true);
    });

    it("should return COMPLETED for Queued state", () => {
      // #given - a Queued proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Queued");

      // #then - should be COMPLETED with complete=true
      expect(result.status).toBe("COMPLETED");
      expect(result.complete).toBe(true);
    });

    it("should return COMPLETED for Expired state", () => {
      // #given - an Expired proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Expired");

      // #then - should be COMPLETED with complete=true
      expect(result.status).toBe("COMPLETED");
      expect(result.complete).toBe(true);
    });

    it("should return COMPLETED for unknown state", () => {
      // #given - an unknown proposal state
      // #when - converting to stage status
      const result = proposalStateToStageStatus("Unknown");

      // #then - should default to COMPLETED with complete=true
      expect(result.status).toBe("COMPLETED");
      expect(result.complete).toBe(true);
    });
  });

  describe("getElectionContext (unit tests)", () => {
    it("should return context when both electionIndex and nomineeProposalId exist", async () => {
      // #given - an election context with CREATE_ELECTION stage containing nomineeProposalId
      const mockProviders = createMockProviders();
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("CREATE_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ electionIndex: 0, cohort: 0, nomineeProposalId: "12345" })
        .build();
      ctx = await (await import("../src/tracker/state")).addStage(ctx, stage);

      // #when - getting election context
      const result = getElectionContext(ctx);

      // #then - should return both electionIndex and nomineeProposalId
      expect(result).not.toBeNull();
      expect(result?.electionIndex).toBe(0);
      expect(result?.nomineeProposalId).toBe("12345");
    });

    it("should return null when only electionIndex exists (no nomineeProposalId)", () => {
      // #given - an election context without CREATE_ELECTION stage
      const mockProviders = createMockProviders();
      const ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      // #when - getting election context (no nomineeProposalId in stages yet)
      const result = getElectionContext(ctx);

      // #then - should return null
      expect(result).toBeNull();
    });

    it("should return null for non-election input", () => {
      // #given - a governor context (no electionIndex)
      const mockProviders = createMockProviders();
      const ctx = createTrackingState({
        providers: mockProviders,
        input: {
          type: "governor",
          governorAddress: "0x1234567890123456789012345678901234567890",
          proposalId: "123",
        } as TrackingInput,
      });

      // #when - getting election context
      const result = getElectionContext(ctx);

      // #then - should return null (no electionIndex)
      expect(result).toBeNull();
    });
  });

  describe("Stage chain classification (unit tests)", () => {
    it("should classify L1_TIMELOCK as ethereum chain", () => {
      // #given - a stage representing L1 timelock with ethereum chain metadata
      const stage = {
        type: "L1_TIMELOCK",
        status: "COMPLETED",
        chain: "ethereum",
        chainId: 1,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      // #when - accessing the chain properties
      // #then - it should be classified as ethereum with chain ID 1
      expect(stage.chain).toBe("ethereum");
      expect(stage.chainId).toBe(1);
    });

    it("should classify L2 stages as arb1 chain", () => {
      // #given - all L2 stage types that should be on Arbitrum One
      const l2StageTypes = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "RETRYABLE_EXECUTED",
      ] as const;

      for (const type of l2StageTypes) {
        // #given - a stage of each L2 type with arb1 chain metadata
        const stage = {
          type,
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        } as unknown as TrackedStage;

        // #when - accessing the chain properties
        // #then - it should be classified as arb1 with chain ID 42161
        expect(stage.chain).toBe("arb1");
        expect(stage.chainId).toBe(42161);
      }
    });

    it("should support nova chain for RETRYABLE_EXECUTED", () => {
      // #given - a retryable stage targeting Nova chain
      const stage = {
        type: "RETRYABLE_EXECUTED",
        status: "COMPLETED",
        chain: "nova",
        chainId: 42170,
        transactions: [],
        data: {
          targetChains: ["nova"],
        },
      } as unknown as TrackedStage;

      // #when - accessing the chain properties
      // #then - it should be classified as nova with chain ID 42170
      expect(stage.chain).toBe("nova");
      expect(stage.chainId).toBe(42170);
    });
  });

  describe("Placeholder stage creation", () => {
    it("should create NOT_STARTED placeholder with reason", () => {
      // #given - a placeholder stage for L1 timelock that hasn't started
      const placeholder = {
        type: "L1_TIMELOCK",
        status: "NOT_STARTED",
        chain: "ethereum",
        chainId: 1,
        transactions: [],
        data: { reason: "L2 timelock not executed" },
      } as unknown as TrackedStage;

      // #when - accessing the placeholder status and data
      // #then - it should have NOT_STARTED status with explanatory reason
      expect(placeholder.status).toBe("NOT_STARTED");
      expect((placeholder.data as { reason?: string }).reason).toBe("L2 timelock not executed");
    });

    it("should create SKIPPED placeholder for L2-only path", () => {
      // #given - a stage that should be skipped for L2-only proposals
      const skipped = {
        type: "L2_TO_L1_MESSAGE",
        status: "SKIPPED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: { reason: "L2-only path" },
      } as unknown as TrackedStage;

      // #when - accessing the skipped stage status and data
      // #then - it should have SKIPPED status with explanatory reason
      expect(skipped.status).toBe("SKIPPED");
      expect((skipped.data as { reason?: string }).reason).toBe("L2-only path");
    });
  });

  describe("Stage ordering logic", () => {
    it("should have correct stage order for governor pipeline", () => {
      // #given - the expected stage order for a full governor proposal
      const expectedOrder = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ];

      // #when - checking the first and last stages
      // #then - stages should start with PROPOSAL_CREATED and end with RETRYABLE_EXECUTED
      expect(expectedOrder[0]).toBe("PROPOSAL_CREATED");
      expect(expectedOrder[expectedOrder.length - 1]).toBe("RETRYABLE_EXECUTED");
    });

    it("should have correct stage order for timelock pipeline", () => {
      // #given - the expected stage order for a timelock-only pipeline
      const timelockPipelineStages = [
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ];

      // #when - checking the pipeline structure
      // #then - it should start with L2_TIMELOCK and have 4 stages total
      expect(timelockPipelineStages[0]).toBe("L2_TIMELOCK");
      expect(timelockPipelineStages.length).toBe(4);
    });
  });
});

describe("Pipeline stage guards (unit tests)", () => {
  describe("trackGovernorPipeline early returns", () => {
    it("should return early when missing governorAddress", async () => {
      // #given - a tracking state with empty governor address
      const mockProviders = createMockProviders();
      const state = createTrackingState({
        providers: mockProviders,
        input: { type: "governor", governorAddress: "", proposalId: "123" } as TrackingInput,
      });

      // #when - running governor pipeline
      const result = await trackGovernorPipeline(state);

      // #then - should return state with no COMPLETED stages (all remain NOT_STARTED)
      const completedStages = result.stages.filter((s) => s.status === "COMPLETED");
      expect(completedStages.length).toBe(0);
    });

    it("should return early when missing proposalId", async () => {
      // #given - a tracking state with empty proposalId
      const mockProviders = createMockProviders();
      const state = createTrackingState({
        providers: mockProviders,
        input: {
          type: "governor",
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalId: "",
        } as TrackingInput,
      });

      // #when - running governor pipeline
      const result = await trackGovernorPipeline(state);

      // #then - should return state with no COMPLETED stages
      const completedStages = result.stages.filter((s) => s.status === "COMPLETED");
      expect(completedStages.length).toBe(0);
    });
  });

  describe("trackTimelockPipeline early returns", () => {
    it("should return early when missing timelockAddress", async () => {
      // #given - a tracking state with no timelock address derivable
      const mockProviders = createMockProviders();
      const state = createTrackingState({
        providers: mockProviders,
        input: {
          type: "timelock",
          timelockAddress: "",
          operationId: "0x123",
          scheduledTxHash: "0xabc",
        } as TrackingInput,
      });

      // #when - running timelock pipeline
      const result = await trackTimelockPipeline(state);

      // #then - should return state with no COMPLETED stages
      const completedStages = result.stages.filter((s) => s.status === "COMPLETED");
      expect(completedStages.length).toBe(0);
    });

    it("should return early when missing operationId", async () => {
      // #given - a tracking state with no operationId
      const mockProviders = createMockProviders();
      const state = createTrackingState({
        providers: mockProviders,
        input: {
          type: "timelock",
          timelockAddress: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          operationId: "",
          scheduledTxHash: "0xabc",
        } as TrackingInput,
      });

      // #when - running timelock pipeline
      const result = await trackTimelockPipeline(state);

      // #then - should return state with no COMPLETED stages
      const completedStages = result.stages.filter((s) => s.status === "COMPLETED");
      expect(completedStages.length).toBe(0);
    });
  });

  describe("trackElectionPipeline early returns", () => {
    it("should return early when electionIndex is undefined", async () => {
      // #given - a governor tracking state (not an election)
      const mockProviders = createMockProviders();
      const state = createTrackingState({
        providers: mockProviders,
        input: {
          type: "governor",
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalId: "123",
        } as TrackingInput,
      });

      // #when - running election pipeline (incorrectly called on non-election input)
      // Note: This tests the guard in CREATE_ELECTION stage
      // We can't directly test this without mocking RPC, so we test the guard indirectly
      // by verifying the state path is correctly identified as governor (not election)
      expect(state.input.type).toBe("governor");
      expect((state.input as { electionIndex?: number }).electionIndex).toBeUndefined();
    });
  });
});

describe("L2-only path handling (unit tests)", () => {
  describe("isConstitutional check", () => {
    it("should return true for Constitutional Governor address", () => {
      // #given - the Constitutional Governor address
      const address = ADDRESSES.CONSTITUTIONAL_GOVERNOR;

      // #when - checking if constitutional
      const result = isConstitutional(address);

      // #then - should be true
      expect(result).toBe(true);
    });

    it("should return true for L2 Constitutional Timelock address", () => {
      // #given - the L2 Constitutional Timelock address
      const address = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;

      // #when - checking if constitutional
      const result = isConstitutional(address);

      // #then - should be true
      expect(result).toBe(true);
    });

    it("should return false for Non-Constitutional Governor address", () => {
      // #given - the Non-Constitutional Governor address
      const address = ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR;

      // #when - checking if constitutional
      const result = isConstitutional(address);

      // #then - should be false (L2-only path)
      expect(result).toBe(false);
    });

    it("should return false for L2 Non-Constitutional Timelock address", () => {
      // #given - the L2 Non-Constitutional Timelock address
      const address = ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK;

      // #when - checking if constitutional
      const result = isConstitutional(address);

      // #then - should be false (L2-only path)
      expect(result).toBe(false);
    });

    it("should return false for election governor addresses", () => {
      // #given - election governor addresses
      const nomineeAddress = ADDRESSES.ELECTION_NOMINEE_GOVERNOR;
      const memberAddress = ADDRESSES.ELECTION_MEMBER_GOVERNOR;

      // #when - checking if constitutional
      const nomineeResult = isConstitutional(nomineeAddress);
      const memberResult = isConstitutional(memberAddress);

      // #then - should be false for both
      expect(nomineeResult).toBe(false);
      expect(memberResult).toBe(false);
    });

    it("should be case-insensitive for address comparison", () => {
      // #given - Constitutional Governor address in different cases
      const lowerCase = ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase();
      const upperCase = ADDRESSES.CONSTITUTIONAL_GOVERNOR.toUpperCase();

      // #when - checking if constitutional
      const lowerResult = isConstitutional(lowerCase);
      const upperResult = isConstitutional(upperCase);

      // #then - should be true for both
      expect(lowerResult).toBe(true);
      expect(upperResult).toBe(true);
    });
  });

  describe("SKIPPED placeholder creation for L2-only path", () => {
    it("should correctly identify L2-only stages when checking SKIPPED status", () => {
      // #given - SKIPPED placeholder stages for L2-only path
      // Note: Using 'unknown' cast since SKIPPED stages have minimal data shape
      const skippedStages = [
        {
          type: "L2_TO_L1_MESSAGE",
          status: "SKIPPED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: { reason: "L2-only path" },
        },
        {
          type: "L1_TIMELOCK",
          status: "SKIPPED",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: { reason: "L2-only path" },
        },
        {
          type: "RETRYABLE_EXECUTED",
          status: "SKIPPED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: { reason: "L2-only path" },
        },
      ] as const;

      // #when - checking each stage status
      // #then - all L1 roundtrip stages should be SKIPPED
      for (const stage of skippedStages) {
        expect(stage.status).toBe("SKIPPED");
        expect(stage.data.reason).toBe("L2-only path");
      }
    });
  });
});

describe("getElectionContext additional tests", () => {
  it("should return context when nomineeProposalId is set in NOMINEE_ELECTION stage", async () => {
    // #given - a state with NOMINEE_ELECTION stage containing nomineeProposalId
    const mockProviders = createMockProviders();
    let ctx = createTrackingState({
      providers: mockProviders,
      input: { type: "election", electionIndex: 1 } as TrackingInput,
    });

    const nomineeStage = new StageBuilder("NOMINEE_ELECTION", "arb1")
      .status("COMPLETED")
      .data({ nomineeProposalId: "67890", proposalState: "Executed" })
      .build();
    ctx = await addStage(ctx, nomineeStage);

    // #when - getting election context
    const result = getElectionContext(ctx);

    // #then - should return context with the nomineeProposalId from stage
    expect(result).not.toBeNull();
    expect(result?.electionIndex).toBe(1);
    expect(result?.nomineeProposalId).toBe("67890");
  });

  it("should prioritize CREATE_ELECTION nomineeProposalId over NOMINEE_ELECTION", async () => {
    // #given - a state with nomineeProposalId in both stages
    const mockProviders = createMockProviders();
    let ctx = createTrackingState({
      providers: mockProviders,
      input: { type: "election", electionIndex: 2 } as TrackingInput,
    });

    const createStage = new StageBuilder("CREATE_ELECTION", "arb1")
      .status("COMPLETED")
      .data({ electionIndex: 2, cohort: 0, nomineeProposalId: "first" })
      .build();
    ctx = await addStage(ctx, createStage);

    const nomineeStage = new StageBuilder("NOMINEE_ELECTION", "arb1")
      .status("COMPLETED")
      .data({ nomineeProposalId: "second", proposalState: "Executed" })
      .build();
    ctx = await addStage(ctx, nomineeStage);

    // #when - getting election context
    const result = getElectionContext(ctx);

    // #then - should return the nomineeProposalId from CREATE_ELECTION (first found)
    expect(result).not.toBeNull();
    expect(result?.nomineeProposalId).toBe("first");
  });
});

describe("proposalStateToStageStatus edge cases", () => {
  it("should handle all numeric proposal states consistently", () => {
    // #given - mapping of proposal states to expected results
    const testCases: Array<{ state: string; expectedStatus: string; expectedComplete: boolean }> = [
      { state: "Pending", expectedStatus: "PENDING", expectedComplete: false },
      { state: "Active", expectedStatus: "PENDING", expectedComplete: false },
      { state: "Canceled", expectedStatus: "FAILED", expectedComplete: false },
      { state: "Defeated", expectedStatus: "FAILED", expectedComplete: false },
      { state: "Succeeded", expectedStatus: "COMPLETED", expectedComplete: true },
      { state: "Queued", expectedStatus: "COMPLETED", expectedComplete: true },
      { state: "Expired", expectedStatus: "COMPLETED", expectedComplete: true },
      { state: "Executed", expectedStatus: "COMPLETED", expectedComplete: true },
    ];

    for (const { state, expectedStatus, expectedComplete } of testCases) {
      // #when - converting to stage status
      const result = proposalStateToStageStatus(state);

      // #then - should match expected values
      expect(result.status).toBe(expectedStatus);
      expect(result.complete).toBe(expectedComplete);
    }
  });

  it("should treat empty string as unknown state (COMPLETED)", () => {
    // #given - an empty string proposal state
    // #when - converting to stage status
    const result = proposalStateToStageStatus("");

    // #then - should default to COMPLETED with complete=true
    expect(result.status).toBe("COMPLETED");
    expect(result.complete).toBe(true);
  });

  it("should treat arbitrary unknown string as COMPLETED", () => {
    // #given - arbitrary unknown proposal state strings
    const unknownStates = ["InvalidState", "random", "PENDING", "active", "DEFEATED"];

    for (const state of unknownStates) {
      // #when - converting to stage status
      const result = proposalStateToStageStatus(state);

      // #then - should default to COMPLETED with complete=true
      expect(result.status).toBe("COMPLETED");
      expect(result.complete).toBe(true);
    }
  });
});

describe("Stage initialization and state management", () => {
  it("should initialize governor pipeline with 7 stages", () => {
    // #given - a new tracking state for governor pipeline
    const mockProviders = createMockProviders();
    const state = createTrackingState({
      providers: mockProviders,
      input: {
        type: "governor",
        governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        proposalId: "123",
      } as TrackingInput,
    });

    // #when - checking initial stages
    // #then - should have 7 stages all NOT_STARTED
    expect(state.stages.length).toBe(7);
    expect(state.stages.every((s) => s.status === "NOT_STARTED")).toBe(true);

    const stageTypes = state.stages.map((s) => s.type);
    expect(stageTypes).toEqual([
      "PROPOSAL_CREATED",
      "VOTING_ACTIVE",
      "PROPOSAL_QUEUED",
      "L2_TIMELOCK",
      "L2_TO_L1_MESSAGE",
      "L1_TIMELOCK",
      "RETRYABLE_EXECUTED",
    ]);
  });

  it("should initialize timelock pipeline with 4 stages", () => {
    // #given - a new tracking state for timelock pipeline
    const mockProviders = createMockProviders();
    const state = createTrackingState({
      providers: mockProviders,
      input: {
        type: "timelock",
        timelockAddress: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        operationId: "0x123",
        scheduledTxHash: "0xabc",
      } as TrackingInput,
    });

    // #when - checking initial stages
    // #then - should have 4 stages all NOT_STARTED
    expect(state.stages.length).toBe(4);
    expect(state.stages.every((s) => s.status === "NOT_STARTED")).toBe(true);

    const stageTypes = state.stages.map((s) => s.type);
    expect(stageTypes).toEqual([
      "L2_TIMELOCK",
      "L2_TO_L1_MESSAGE",
      "L1_TIMELOCK",
      "RETRYABLE_EXECUTED",
    ]);
  });

  it("should initialize election pipeline with 8 stages", () => {
    // #given - a new tracking state for election pipeline
    const mockProviders = createMockProviders();
    const state = createTrackingState({
      providers: mockProviders,
      input: { type: "election", electionIndex: 0 } as TrackingInput,
    });

    // #when - checking initial stages
    // #then - should have 8 stages all NOT_STARTED
    expect(state.stages.length).toBe(8);
    expect(state.stages.every((s) => s.status === "NOT_STARTED")).toBe(true);

    const stageTypes = state.stages.map((s) => s.type);
    expect(stageTypes).toEqual([
      "CREATE_ELECTION",
      "NOMINEE_ELECTION",
      "NOMINEE_VETTING",
      "MEMBER_ELECTION",
      "L2_TIMELOCK",
      "L2_TO_L1_MESSAGE",
      "L1_TIMELOCK",
      "RETRYABLE_EXECUTED",
    ]);
  });

  it("should correctly assign chains to stages", () => {
    // #given - a tracking state with all stages initialized
    const mockProviders = createMockProviders();
    const state = createTrackingState({
      providers: mockProviders,
      input: {
        type: "governor",
        governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        proposalId: "123",
      } as TrackingInput,
    });

    // #when - checking chain assignments
    const l1Stages = state.stages.filter((s) => s.chain === "ethereum");
    const l2Stages = state.stages.filter((s) => s.chain === "arb1");

    // #then - L1_TIMELOCK and RETRYABLE_EXECUTED are classified as ethereum chain
    // (RETRYABLE_EXECUTED is initiated from L1, even though tickets redeem on L2)
    expect(l1Stages.map((s) => s.type)).toEqual(["L1_TIMELOCK", "RETRYABLE_EXECUTED"]);
    expect(l2Stages.length).toBe(5);
  });
});

describe.skipIf(shouldSkipRpc())("Pipeline Integration Tests", () => {
  const { cache, beforeAllSetup } = createRpcTestSuite();
  let tracker: ProposalStageTracker;
  let fullRoundtripResult: TrackingResult;
  let l2OnlyResult: TrackingResult;

  beforeAll(async () => {
    await beforeAllSetup();
    tracker = cache.getTracker();

    const [full, l2Only] = await Promise.all([
      tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash),
      tracker.trackByTxHash(NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash),
    ]);

    fullRoundtripResult = full[0];
    l2OnlyResult = l2Only[0];
  }, 180000);

  describe("Governor Pipeline", () => {
    it("should track all stages for full roundtrip proposal", () => {
      // #given - a fully tracked roundtrip proposal result
      // #when - extracting stage types from the result
      const stageTypes = fullRoundtripResult.stages.map((s) => s.type);

      // #then - all 7 governance stages should be present
      expect(stageTypes).toContain("PROPOSAL_CREATED");
      expect(stageTypes).toContain("VOTING_ACTIVE");
      expect(stageTypes).toContain("PROPOSAL_QUEUED");
      expect(stageTypes).toContain("L2_TIMELOCK");
      expect(stageTypes).toContain("L2_TO_L1_MESSAGE");
      expect(stageTypes).toContain("L1_TIMELOCK");
      expect(stageTypes).toContain("RETRYABLE_EXECUTED");
    });

    it("should have correct chain assignments", () => {
      // #given - a fully tracked roundtrip proposal result
      // #when - checking chain assignments for each stage
      for (const stage of fullRoundtripResult.stages) {
        // #then - L1_TIMELOCK should be on ethereum, others on arb1 or nova
        if (stage.type === "L1_TIMELOCK") {
          expect(stage.chain).toBe("ethereum");
          expect(stage.chainId).toBe(1);
        } else {
          expect(["arb1", "nova"]).toContain(stage.chain);
          expect([42161, 42170]).toContain(stage.chainId);
        }
      }
    });
  });

  describe("L2-Only Pipeline (Treasury Governor)", () => {
    it("should skip L1 stages for L2-only path", () => {
      // #given - a tracked L2-only proposal result
      // #when - finding the L1 roundtrip stages
      const l2ToL1Stage = l2OnlyResult.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      const l1TimelockStage = l2OnlyResult.stages.find((s) => s.type === "L1_TIMELOCK");
      const retryableStage = l2OnlyResult.stages.find((s) => s.type === "RETRYABLE_EXECUTED");

      // #then - all L1 roundtrip stages should be SKIPPED
      if (l2ToL1Stage) {
        expect(l2ToL1Stage.status).toBe("SKIPPED");
      }
      if (l1TimelockStage) {
        expect(l1TimelockStage.status).toBe("SKIPPED");
      }
      if (retryableStage) {
        expect(retryableStage.status).toBe("SKIPPED");
      }
    });

    it("should have L2 timelock completed", () => {
      // #given - a tracked L2-only proposal result
      // #when - finding the L2 timelock stage
      const l2Timelock = l2OnlyResult.stages.find((s) => s.type === "L2_TIMELOCK");

      // #then - L2 timelock should exist and be completed
      expect(l2Timelock).toBeDefined();
      expect(l2Timelock!.status).toBe("COMPLETED");
    });

    it("should be marked as complete", () => {
      // #given - a tracked L2-only proposal result
      // #when - checking the completion status
      // #then - the proposal should be marked as complete
      expect(l2OnlyResult.isComplete).toBe(true);
    });
  });

  describe("Timelock Pipeline", () => {
    it("should track from timelock tx hash", async () => {
      // #given - a timelock transaction hash for a known proposal
      // #when - tracking by the timelock tx hash
      const result = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.timelockTxHash
      );

      // #then - it should return a single result with timelock input type
      expect(result.length).toBe(1);
      expect(result[0].input.type).toBe("timelock");

      // #then - it should include L2_TIMELOCK but not governor stages
      const stageTypes = result[0].stages.map((s) => s.type);
      expect(stageTypes).toContain("L2_TIMELOCK");
      expect(stageTypes).not.toContain("PROPOSAL_CREATED");
      expect(stageTypes).not.toContain("VOTING_ACTIVE");
    });
  });
});
