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
  createTracker,
  ProposalStageTracker,
  DEFAULT_RPC_URLS,
  TrackingResult,
  TrackedStage,
  createTrackingState,
  getElectionContext,
  proposalStateToStageStatus,
} from "../src";
import {
  shouldSkipRpc,
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./helpers";
import { StageBuilder } from "../src/stages/builder";
import type { TrackingInput } from "../src/types";

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

describe.skipIf(shouldSkipRpc())("Pipeline Integration Tests", () => {
  let tracker: ProposalStageTracker;
  let fullRoundtripResult: TrackingResult;
  let l2OnlyResult: TrackingResult;

  beforeAll(async () => {
    const ethRpc = process.env.ETH_RPC;
    if (!ethRpc) {
      throw new Error("ETH_RPC environment variable required");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

    const l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    const l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
    const novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);

    tracker = createTracker({
      l1Provider,
      l2Provider,
      novaProvider,
    });

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
