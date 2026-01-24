/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for TrackingState - Pure functional state management
 *
 * These tests verify the TrackingState module's pure functions without RPC calls.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ethers, BigNumber } from "ethers";
import {
  createTrackingState,
  addStage,
  isStageCompleted,
  getCompletedStage,
  getCachedStage,
  isComplete,
  getGovernorAddress,
  getProposalId,
  getTimelockAddress,
  getOperationId,
  getCallScheduledData,
  getFirstCallScheduledData,
  getQueueBlockNumber,
  getProposalData,
  getProposalType,
  getIsElection,
  getProposalState,
  getVotingEndBlock,
  getL2ExecutionTxHash,
  getFirstExecutableBlock,
  getOutboxExecutionTx,
  getL1ExecutionTxHash,
  createCheckpoint,
  createModularCheckpoints,
  setTimelockOpKey,
  getElectionIndex,
  getNomineeProposalId,
  getMemberProposalId,
  getElectionCohort,
  getCompliantNomineeCount,
  getTargetNomineeCount,
  getVettingDeadline,
  getElectionTimelockOperationId,
  getTrackingPathFromInput,
  Providers,
} from "../src/tracker/state";
import { StageBuilder } from "../src/stages/builder";
import { ADDRESSES } from "../src/constants";
import type {
  TrackedStage,
  TrackingInput,
  TrackingCheckpoint,
  CallScheduledData,
} from "../src/types";

// Mock providers (minimal interface for testing)
function createMockProviders(): Providers {
  return {
    l1: {} as ethers.providers.Provider,
    l2: {} as ethers.providers.Provider,
    nova: {} as ethers.providers.Provider,
  };
}

// Helper to create a governor input
function createGovernorInput(overrides: Partial<TrackingInput> = {}): TrackingInput {
  return {
    type: "governor",
    governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
    proposalId: "12345",
    ...overrides,
  } as TrackingInput;
}

// Helper to create a timelock input
function createTimelockInput(overrides: Partial<TrackingInput> = {}): TrackingInput {
  return {
    type: "timelock",
    timelockAddress: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
    operationId: "0xabc123",
    ...overrides,
  } as TrackingInput;
}

describe("TrackingState", () => {
  let mockProviders: Providers;

  beforeEach(() => {
    mockProviders = createMockProviders();
  });

  describe("createTrackingState", () => {
    it("should create context for governor input", () => {
      // #given - a governor input with proposal ID
      const input = createGovernorInput();

      // #when - creating a tracking context
      const ctx = createTrackingState({
        providers: mockProviders,
        input,
      });

      // #then - context should be initialized with all 7 governance stages
      expect(ctx.input).toBe(input);
      expect(ctx.providers).toBe(mockProviders);
      expect(ctx.stages.length).toBe(7); // All 7 stages for governor
      expect(ctx.stageIndex).toBe(0);
    });

    it("should create context for timelock input", () => {
      // #given - a timelock input with operation ID
      const input = createTimelockInput();

      // #when - creating a tracking context
      const ctx = createTrackingState({
        providers: mockProviders,
        input,
      });

      // #then - context should skip early governance stages
      expect(ctx.input).toBe(input);
      // Timelock path should not include PROPOSAL_CREATED and VOTING_ACTIVE
      expect(ctx.stages.some((s) => s.type === "PROPOSAL_CREATED")).toBe(false);
      expect(ctx.stages.some((s) => s.type === "VOTING_ACTIVE")).toBe(false);
    });

    it("should initialize all stages to NOT_STARTED", () => {
      // #given - a governor input
      const input = createGovernorInput();

      // #when - creating a tracking context
      const ctx = createTrackingState({
        providers: mockProviders,
        input,
      });

      // #then - all stages should be NOT_STARTED
      expect(ctx.stages.every((s) => s.status === "NOT_STARTED")).toBe(true);
    });

    it("should use default chunking config", () => {
      // #given - a governor input without custom chunking config

      // #when - creating a tracking context
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #then - default chunking config should be applied
      expect(ctx.chunkingConfig).toBeDefined();
    });

    it("should use custom chunking config when provided", () => {
      // #given - a custom chunking configuration
      const customConfig = {
        l1ChunkSize: 500,
        l2ChunkSize: 50000,
        novaChunkSize: 1000,
        delayBetweenChunks: 0,
      };

      // #when - creating a tracking context with custom config
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
        chunkingConfig: customConfig,
      });

      // #then - custom config should be stored
      expect(ctx.chunkingConfig).toEqual(customConfig);
    });

    it("should store onProgress callback", () => {
      // #given - an onProgress callback
      const onProgress = vi.fn();

      // #when - creating a tracking context with callback
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
        onProgress,
      });

      // #then - callback should be stored in context
      expect(ctx.onProgress).toBe(onProgress);
    });

    it("should store cacheKey", () => {
      // #given - a cache key string

      // #when - creating a tracking context with cache key
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
        cacheKey: "test-cache-key",
      });

      // #then - cache key should be stored in context
      expect(ctx.cacheKey).toBe("test-cache-key");
    });

    it("should store callScheduledData bootstrap data", () => {
      // #given - pre-populated CallScheduledData for bootstrapping
      const mockData: CallScheduledData[] = [
        {
          operationId: "0x123",
          index: BigNumber.from(0),
          target: "0x1111111111111111111111111111111111111111",
          value: BigNumber.from(0),
          data: "0x",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(86400),
          txHash: "0xabc",
          blockNumber: 1000,
          logIndex: 0,
          timelockAddress: "0x0000000000000000000000000000000000000000",
        },
      ];

      // #when - creating a tracking context with bootstrap data
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      // #then - bootstrap data should be stored in context
      expect(ctx.callScheduledData).toEqual(mockData);
    });

    it("should load stages from checkpoint", () => {
      // #given - a checkpoint with a completed PROPOSAL_CREATED stage
      const completedStage: TrackedStage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "12345" })
        .tx("0xabc", 100, "arb1", 42161)
        .build();

      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: createGovernorInput(),
        lastProcessedStage: "PROPOSAL_CREATED",
        lastProcessedBlock: { l1: 0, l2: 100, nova: 0 },
        cachedData: { completedStages: [completedStage] },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      // #when - creating a tracking context from checkpoint
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
        checkpoint,
      });

      // #then - stage should be restored and index advanced
      const stage = ctx.stages.find((s) => s.type === "PROPOSAL_CREATED");
      expect(stage?.status).toBe("COMPLETED");
      expect(ctx.stageIndex).toBe(1);
    });
  });

  describe("addStage", () => {
    it("should update stage in context", async () => {
      // #given - a fresh tracking context
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const newStage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "12345" })
        .build();

      // #when - adding a completed stage
      const newCtx = await addStage(ctx, newStage);

      // #then - stage should be updated and index incremented
      const stage = newCtx.stages.find((s) => s.type === "PROPOSAL_CREATED");
      expect(stage?.status).toBe("COMPLETED");
      expect(newCtx.stageIndex).toBe(1);
    });

    it("should call onProgress callback", async () => {
      // #given - a context with an onProgress callback
      const onProgress = vi.fn();
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
        onProgress,
      });

      const newStage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();

      // #when - adding a stage
      await addStage(ctx, newStage);

      // #then - callback should be invoked with stage progress
      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: newStage,
          isComplete: false,
        })
      );
    });

    it("should not mutate original context", async () => {
      // #given - a fresh tracking context
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const originalStageIndex = ctx.stageIndex;

      const newStage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();

      // #when - adding a stage
      await addStage(ctx, newStage);

      // #then - original context should remain unchanged (immutability)
      expect(ctx.stageIndex).toBe(originalStageIndex);
    });
  });

  describe("isStageCompleted", () => {
    it("should return true for COMPLETED stage", async () => {
      // #given - a context with a completed stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      ctx = await addStage(ctx, stage);

      // #when - checking if stage is completed
      const result = isStageCompleted(ctx, "PROPOSAL_CREATED");

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return true for SKIPPED stage", async () => {
      // #given - a context with a skipped stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1").skip("L2-only path").build();
      ctx = await addStage(ctx, stage);

      // #when - checking if skipped stage is completed
      const result = isStageCompleted(ctx, "L2_TO_L1_MESSAGE");

      // #then - should return true (skipped counts as completed)
      expect(result).toBe(true);
    });

    it("should return false for PENDING stage", async () => {
      // #given - a context with a pending stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage);

      // #when - checking if pending stage is completed
      const result = isStageCompleted(ctx, "PROPOSAL_CREATED");

      // #then - should return false
      expect(result).toBe(false);
    });

    it("should return false for NOT_STARTED stage", () => {
      // #given - a fresh context with no stage updates
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - checking if NOT_STARTED stage is completed
      const result = isStageCompleted(ctx, "PROPOSAL_CREATED");

      // #then - should return false
      expect(result).toBe(false);
    });
  });

  describe("getCompletedStage", () => {
    it("should return completed stage", async () => {
      // #given - a context with a completed stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      ctx = await addStage(ctx, stage);

      // #when - getting the completed stage
      const result = getCompletedStage(ctx, "PROPOSAL_CREATED");

      // #then - should return the stage
      expect(result).toBeDefined();
      expect(result?.status).toBe("COMPLETED");
    });

    it("should return skipped stage", async () => {
      // #given - a context with a skipped stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L1_TIMELOCK", "ethereum").skip("test").build();
      ctx = await addStage(ctx, stage);

      // #when - getting the skipped stage
      const result = getCompletedStage(ctx, "L1_TIMELOCK");

      // #then - should return the skipped stage
      expect(result).toBeDefined();
      expect(result?.status).toBe("SKIPPED");
    });

    it("should return undefined for pending stage", async () => {
      // #given - a context with a pending stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage);

      // #when - getting the pending stage as completed
      const result = getCompletedStage(ctx, "PROPOSAL_CREATED");

      // #then - should return undefined (pending is not completed)
      expect(result).toBeUndefined();
    });
  });

  describe("getCachedStage", () => {
    it("should return stage regardless of status", async () => {
      // #given - a context with a pending stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage);

      // #when - getting cached stage (any status)
      const result = getCachedStage(ctx, "PROPOSAL_CREATED");

      // #then - should return the stage regardless of status
      expect(result).toBeDefined();
      expect(result?.status).toBe("PENDING");
    });
  });

  describe("isComplete", () => {
    it("should return false when stages are not complete", () => {
      // #given - a fresh context with NOT_STARTED stages
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - checking if all stages are complete
      const result = isComplete(ctx);

      // #then - should return false
      expect(result).toBe(false);
    });

    it("should return true when all stages are complete", async () => {
      // #given - a context where all stages are marked COMPLETED
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      for (const stage of ctx.stages) {
        const completed = new StageBuilder(stage.type, stage.chain).status("COMPLETED").build();
        ctx = await addStage(ctx, completed);
      }

      // #when - checking if all stages are complete
      const result = isComplete(ctx);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return true when mix of COMPLETED and SKIPPED", async () => {
      // #given - a context with alternating COMPLETED and SKIPPED stages
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      for (let i = 0; i < ctx.stages.length; i++) {
        const stage = ctx.stages[i];
        const builder = new StageBuilder(stage.type, stage.chain);
        const updated =
          i % 2 === 0 ? builder.status("COMPLETED").build() : builder.skip("test").build();
        ctx = await addStage(ctx, updated);
      }

      // #when - checking if all stages are complete
      const result = isComplete(ctx);

      // #then - should return true (SKIPPED counts as complete)
      expect(result).toBe(true);
    });
  });

  describe("getGovernorAddress", () => {
    it("should return governor address for governor input", () => {
      // #given - a context with governor input
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - getting governor address
      const result = getGovernorAddress(ctx);

      // #then - should return the governor address
      expect(result).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
    });

    it("should return undefined for timelock input", () => {
      // #given - a context with timelock input (no governor)
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput(),
      });

      // #when - getting governor address
      const result = getGovernorAddress(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });
  });

  describe("getProposalId", () => {
    it("should return proposalId for governor input", () => {
      // #given - a context with governor input containing proposalId
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput({ proposalId: "67890" } as any),
      });

      // #when - getting proposal ID
      const result = getProposalId(ctx);

      // #then - should return the proposal ID
      expect(result).toBe("67890");
    });

    it("should return undefined for timelock input", () => {
      // #given - a context with timelock input (no proposalId)
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput(),
      });

      // #when - getting proposal ID
      const result = getProposalId(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });
  });

  describe("getTimelockAddress", () => {
    it("should return timelockAddress from timelock input", () => {
      // #given - a context with timelock input
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput(),
      });

      // #when - getting timelock address
      const result = getTimelockAddress(ctx);

      // #then - should return the timelock address from input
      expect(result).toBe(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK);
    });

    it("should return timelockAddress from PROPOSAL_QUEUED stage", async () => {
      // #given - a context with PROPOSAL_QUEUED stage containing timelockAddress
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_QUEUED", "arb1")
        .status("COMPLETED")
        .data({ timelockAddress: "0x9999999999999999999999999999999999999999" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting timelock address
      const result = getTimelockAddress(ctx);

      // #then - should return the timelock address from stage data
      expect(result).toBe("0x9999999999999999999999999999999999999999");
    });

    it("should fallback to L2_TIMELOCK stage data", async () => {
      // #given - a context with only L2_TIMELOCK stage containing timelockAddress
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ timelockAddress: "0x8888888888888888888888888888888888888888" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting timelock address
      const result = getTimelockAddress(ctx);

      // #then - should fall back to L2_TIMELOCK stage data
      expect(result).toBe("0x8888888888888888888888888888888888888888");
    });
  });

  describe("getOperationId", () => {
    it("should return operationId from timelock input", () => {
      // #given - a context with timelock input containing operationId
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput({ operationId: "0xdeadbeef" } as any),
      });

      // #when - getting operation ID
      const result = getOperationId(ctx);

      // #then - should return the operation ID from input
      expect(result).toBe("0xdeadbeef");
    });

    it("should return operationId from PROPOSAL_QUEUED stage", async () => {
      // #given - a context with PROPOSAL_QUEUED stage containing operationId
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_QUEUED", "arb1")
        .status("COMPLETED")
        .data({ operationId: "0xfeedbeef" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting operation ID
      const result = getOperationId(ctx);

      // #then - should return the operation ID from stage data
      expect(result).toBe("0xfeedbeef");
    });
  });

  describe("getCallScheduledData", () => {
    it("should return bootstrap callScheduledData", () => {
      // #given - a context with bootstrap callScheduledData
      const mockData: CallScheduledData[] = [
        {
          operationId: "0x123",
          index: BigNumber.from(0),
          target: "0x1111111111111111111111111111111111111111",
          value: BigNumber.from(0),
          data: "0x",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(86400),
          txHash: "0xabc",
          blockNumber: 1000,
          logIndex: 0,
          timelockAddress: "0x0000000000000000000000000000000000000000",
        },
      ];

      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      // #when - getting callScheduledData
      const result = getCallScheduledData(ctx);

      // #then - should return the bootstrap data
      expect(result).toEqual(mockData);
    });
  });

  describe("getFirstCallScheduledData", () => {
    it("should return first item from callScheduledData", () => {
      // #given - a context with multiple callScheduledData entries
      const mockData: CallScheduledData[] = [
        {
          operationId: "0x123",
          index: BigNumber.from(0),
          target: "0x1111111111111111111111111111111111111111",
          value: BigNumber.from(0),
          data: "0x",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(86400),
          txHash: "0xabc",
          blockNumber: 1000,
          logIndex: 0,
          timelockAddress: "0x0000000000000000000000000000000000000000",
        },
        {
          operationId: "0x123",
          index: BigNumber.from(1),
          target: "0x2222222222222222222222222222222222222222",
          value: BigNumber.from(0),
          data: "0x",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(86400),
          txHash: "0xabc",
          blockNumber: 1000,
          logIndex: 1,
          timelockAddress: "0x0000000000000000000000000000000000000000",
        },
      ];

      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      // #when - getting first callScheduledData
      const first = getFirstCallScheduledData(ctx);

      // #then - should return the first entry
      expect(first?.target).toBe("0x1111111111111111111111111111111111111111");
    });
  });

  describe("getQueueBlockNumber", () => {
    it("should return blockNumber from first callScheduledData", () => {
      // #given - a context with callScheduledData containing blockNumber
      const mockData: CallScheduledData[] = [
        {
          operationId: "0x123",
          index: BigNumber.from(0),
          target: "0x1111111111111111111111111111111111111111",
          value: BigNumber.from(0),
          data: "0x",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(86400),
          txHash: "0xabc",
          blockNumber: 54321,
          logIndex: 0,
          timelockAddress: "0x0000000000000000000000000000000000000000",
        },
      ];

      const ctx = createTrackingState({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      // #when - getting queue block number
      const result = getQueueBlockNumber(ctx);

      // #then - should return the block number from first entry
      expect(result).toBe(54321);
    });

    it("should return undefined when no callScheduledData", () => {
      // #given - a context without callScheduledData
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - getting queue block number
      const result = getQueueBlockNumber(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });
  });

  describe("getProposalData", () => {
    it("should return undefined for NOT_STARTED stage", () => {
      // #given - a fresh context with NOT_STARTED stages
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - getting proposal data
      const result = getProposalData(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });

    it("should return proposal data from COMPLETED stage", async () => {
      // #given - a context with COMPLETED PROPOSAL_CREATED stage with full data
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({
          proposalId: "12345",
          proposer: "0x1111111111111111111111111111111111111111",
          description: "Test proposal",
          targets: ["0x2222222222222222222222222222222222222222"],
          values: ["0"],
          signatures: [""],
          calldatas: ["0x"],
          startBlock: "100",
          endBlock: "200",
        })
        .tx("0xabc", 50, "arb1", 42161)
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting proposal data
      const result = getProposalData(ctx);

      // #then - should return full proposal data
      expect(result).toBeDefined();
      expect(result?.proposalId).toBe("12345");
      expect(result?.proposer).toBe("0x1111111111111111111111111111111111111111");
      expect(result?.creationBlock).toBe(50);
      expect(result?.creationTxHash).toBe("0xabc");
    });

    it("should return undefined when required fields are missing", async () => {
      // #given - a context with stage missing required fields
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({
          proposalId: "12345",
          proposer: "0x1111111111111111111111111111111111111111",
          // Missing startBlock, endBlock, targets, values, signatures, calldatas
        })
        .tx("0xabc", 50, "arb1", 42161)
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting proposal data
      const result = getProposalData(ctx);

      // #then - should return undefined due to missing fields
      expect(result).toBeUndefined();
    });

    it("should return undefined when transaction is missing", async () => {
      // #given - a context with stage data but no transaction
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({
          proposalId: "12345",
          proposer: "0x1111111111111111111111111111111111111111",
          description: "Test proposal",
          targets: ["0x2222222222222222222222222222222222222222"],
          values: ["0"],
          signatures: [""],
          calldatas: ["0x"],
          startBlock: "100",
          endBlock: "200",
        })
        // No .tx() call - missing transaction
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting proposal data
      const result = getProposalData(ctx);

      // #then - should return undefined due to missing transaction
      expect(result).toBeUndefined();
    });
  });

  describe("getProposalType", () => {
    it("should detect CONSTITUTIONAL from governor address", () => {
      // #given - a context with constitutional governor address
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR } as any),
      });

      // #when - getting proposal type
      const result = getProposalType(ctx);

      // #then - should return CONSTITUTIONAL
      expect(result).toBe("CONSTITUTIONAL");
    });

    it("should detect NON_CONSTITUTIONAL from governor address", () => {
      // #given - a context with non-constitutional governor address
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput({
          governorAddress: ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
        } as any),
      });

      // #when - getting proposal type
      const result = getProposalType(ctx);

      // #then - should return NON_CONSTITUTIONAL
      expect(result).toBe("NON_CONSTITUTIONAL");
    });

    it("should return proposalType from stage data if available", async () => {
      // #given - a context with proposalType in stage data
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalType: "ELECTION_NOMINEE" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting proposal type
      const result = getProposalType(ctx);

      // #then - should return type from stage data
      expect(result).toBe("ELECTION_NOMINEE");
    });
  });

  describe("getIsElection", () => {
    it("should return false for CONSTITUTIONAL", () => {
      // #given - a context with constitutional governor
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR } as any),
      });

      // #when - checking if election
      const result = getIsElection(ctx);

      // #then - should return false
      expect(result).toBe(false);
    });

    it("should return true for ELECTION_NOMINEE", () => {
      // #given - a context with nominee election governor
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.ELECTION_NOMINEE_GOVERNOR } as any),
      });

      // #when - checking if election
      const result = getIsElection(ctx);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return true for ELECTION_MEMBER", () => {
      // #given - a context with member election governor
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.ELECTION_MEMBER_GOVERNOR } as any),
      });

      // #when - checking if election
      const result = getIsElection(ctx);

      // #then - should return true
      expect(result).toBe(true);
    });
  });

  describe("getProposalState", () => {
    it("should return undefined when no voting data", () => {
      // #given - a fresh context without voting data
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - getting proposal state
      const result = getProposalState(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });

    it("should return proposalState from VOTING_ACTIVE stage", async () => {
      // #given - a context with VOTING_ACTIVE stage containing proposalState
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ proposalState: "Succeeded" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting proposal state
      const result = getProposalState(ctx);

      // #then - should return the proposal state
      expect(result).toBe("Succeeded");
    });
  });

  describe("getVotingEndBlock", () => {
    it("should return deadline from VOTING_ACTIVE stage", async () => {
      // #given - a context with VOTING_ACTIVE stage containing deadline
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ deadline: "50000" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting voting end block
      const result = getVotingEndBlock(ctx);

      // #then - should return the deadline
      expect(result).toBe(50000);
    });

    it("should use extendedDeadline if greater than deadline", async () => {
      // #given - a context with extendedDeadline greater than deadline
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ deadline: "50000", extendedDeadline: "60000" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting voting end block
      const result = getVotingEndBlock(ctx);

      // #then - should return the extended deadline
      expect(result).toBe(60000);
    });

    it("should ignore extendedDeadline if not greater than deadline", async () => {
      // #given - a context with extendedDeadline less than deadline
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ deadline: "50000", extendedDeadline: "40000" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting voting end block
      const result = getVotingEndBlock(ctx);

      // #then - should return the original deadline
      expect(result).toBe(50000);
    });
  });

  describe("getL2ExecutionTxHash", () => {
    it("should return undefined when L2_TIMELOCK not complete", () => {
      // #given - a fresh context without L2_TIMELOCK stage
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - getting L2 execution tx hash
      const result = getL2ExecutionTxHash(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });

    it("should return execution tx hash from COMPLETED L2_TIMELOCK", async () => {
      // #given - a context with COMPLETED L2_TIMELOCK stage with multiple transactions
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("COMPLETED")
        .tx("0xqueue", 100, "arb1", 42161, { description: "queued" })
        .tx("0xexecute", 200, "arb1", 42161, { description: "executed" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting L2 execution tx hash
      const result = getL2ExecutionTxHash(ctx);

      // #then - should return the execution (second) tx hash
      expect(result).toBe("0xexecute");
    });
  });

  describe("getFirstExecutableBlock", () => {
    it("should return firstExecutableBlock from L2_TO_L1_MESSAGE stage", async () => {
      // #given - a context with L2_TO_L1_MESSAGE stage containing firstExecutableBlock
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .status("PENDING")
        .data({ firstExecutableBlock: 21000000 })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting first executable block
      const result = getFirstExecutableBlock(ctx);

      // #then - should return the first executable block number
      expect(result).toBe(21000000);
    });
  });

  describe("getOutboxExecutionTx", () => {
    it("should return undefined when L2_TO_L1_MESSAGE not complete", () => {
      // #given - a fresh context without L2_TO_L1_MESSAGE stage
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - getting outbox execution tx
      const result = getOutboxExecutionTx(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });

    it("should return L1 transaction from COMPLETED L2_TO_L1_MESSAGE", async () => {
      // #given - a context with COMPLETED L2_TO_L1_MESSAGE with L1 transaction
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .status("COMPLETED")
        .tx("0xl2tx", 1000, "arb1", 42161)
        .tx("0xl1tx", 21000000, "ethereum", 1)
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting outbox execution tx
      const result = getOutboxExecutionTx(ctx);

      // #then - should return the L1 transaction details
      expect(result).toEqual({ hash: "0xl1tx", blockNumber: 21000000 });
    });
  });

  describe("getL1ExecutionTxHash", () => {
    it("should return execution tx hash from COMPLETED L1_TIMELOCK", async () => {
      // #given - a context with COMPLETED L1_TIMELOCK with multiple transactions
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L1_TIMELOCK", "ethereum")
        .status("COMPLETED")
        .tx("0xqueue", 21000000, "ethereum", 1, { description: "queued" })
        .tx("0xexecute", 21001000, "ethereum", 1, { description: "executed" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting L1 execution tx hash
      const result = getL1ExecutionTxHash(ctx);

      // #then - should return the execution (second) tx hash
      expect(result).toBe("0xexecute");
    });
  });

  describe("createCheckpoint", () => {
    it("should create checkpoint with completed stages", async () => {
      // #given - a context with multiple stages in different states
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage1 = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      const stage2 = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage1);
      ctx = await addStage(ctx, stage2);

      // #when - creating a checkpoint
      const checkpoint = createCheckpoint(ctx);

      // #then - checkpoint should contain stage data
      expect(checkpoint.version).toBe(1);
      expect(checkpoint.input).toBe(ctx.input);
      expect(checkpoint.lastProcessedStage).toBe("VOTING_ACTIVE");
      expect(checkpoint.cachedData.completedStages?.length).toBe(2);
    });

    it("should include pending stages for resume data", async () => {
      // #given - a context with a PENDING stage containing data
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ operationId: "0xtest", eta: 1700000000 })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - creating a checkpoint
      const checkpoint = createCheckpoint(ctx);

      // #then - pending stage should be included for resume capability
      const cached = checkpoint.cachedData.completedStages?.find((s) => s.type === "L2_TIMELOCK");
      expect(cached).toBeDefined();
      expect(cached?.status).toBe("PENDING");
    });
  });

  describe("getTimelockAddress - multi-source fallback", () => {
    it("should fallback to MEMBER_ELECTION stage data (election path)", async () => {
      // #given - an election context with MEMBER_ELECTION stage containing timelockAddress
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("MEMBER_ELECTION", "arb1")
        .status("COMPLETED")
        .data({
          memberProposalId: "123",
          proposalState: "Executed",
          winnersCount: 6,
          timelockAddress: "0x7777777777777777777777777777777777777777",
        })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting timelock address
      const result = getTimelockAddress(ctx);

      // #then - should return the timelock address from MEMBER_ELECTION stage
      expect(result).toBe("0x7777777777777777777777777777777777777777");
    });
  });

  describe("getOperationId - multi-source fallback", () => {
    it("should fallback to MEMBER_ELECTION stage data (election path)", async () => {
      // #given - an election context with MEMBER_ELECTION stage containing operationId
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("MEMBER_ELECTION", "arb1")
        .status("COMPLETED")
        .data({
          memberProposalId: "123",
          proposalState: "Executed",
          winnersCount: 6,
          operationId: "0xelection_op_id",
        })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting operation ID
      const result = getOperationId(ctx);

      // #then - should return the operation ID from MEMBER_ELECTION stage
      expect(result).toBe("0xelection_op_id");
    });

    it("should fallback to L2_TIMELOCK stage data", async () => {
      // #given - a context with only L2_TIMELOCK stage containing operationId
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ operationId: "0xl2_timelock_op_id" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting operation ID
      const result = getOperationId(ctx);

      // #then - should return the operation ID from L2_TIMELOCK stage
      expect(result).toBe("0xl2_timelock_op_id");
    });
  });

  describe("getVotingEndBlock - extended deadline", () => {
    it("should return extendedDeadline when greater than deadline", async () => {
      // #given - a context with VOTING_ACTIVE stage with extended deadline
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({
          proposalState: "Succeeded",
          deadline: "100",
          extendedDeadline: "200",
        })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting voting end block
      const result = getVotingEndBlock(ctx);

      // #then - should return the extended deadline (higher value)
      expect(result).toBe(200);
    });

    it("should return deadline when extendedDeadline is undefined", async () => {
      // #given - a context with VOTING_ACTIVE stage without extended deadline
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({
          proposalState: "Succeeded",
          deadline: "150",
        })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting voting end block
      const result = getVotingEndBlock(ctx);

      // #then - should return the deadline
      expect(result).toBe(150);
    });

    it("should return undefined when no deadline", async () => {
      // #given - a context with VOTING_ACTIVE stage without deadline
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("PENDING")
        .data({ proposalState: "Active" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting voting end block
      const result = getVotingEndBlock(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });
  });

  describe("getProposalData - missing fields", () => {
    it("should return undefined when missing startBlock", async () => {
      // #given - a context with PROPOSAL_CREATED stage missing startBlock
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({
          proposalId: "123",
          endBlock: "100",
          proposer: "0x1234567890123456789012345678901234567890",
          targets: [],
          values: [],
          signatures: [],
          calldatas: [],
        })
        .tx("0xhash", 1000, "arb1", 42161)
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting proposal data
      const result = getProposalData(ctx);

      // #then - should return undefined (missing startBlock)
      expect(result).toBeUndefined();
    });

    it("should return undefined when missing transaction", async () => {
      // #given - a context with PROPOSAL_CREATED stage missing transaction
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({
          proposalId: "123",
          startBlock: "50",
          endBlock: "100",
          proposer: "0x1234567890123456789012345678901234567890",
          targets: [],
          values: [],
          signatures: [],
          calldatas: [],
        })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting proposal data
      const result = getProposalData(ctx);

      // #then - should return undefined (missing transaction)
      expect(result).toBeUndefined();
    });
  });

  describe("getTrackingPathFromInput", () => {
    it("should return timelock for discovery input", () => {
      // #given - a discovery input type
      const input: TrackingInput = {
        type: "discovery",
        governorAddresses: [],
        timelockAddresses: [],
      } as any;

      // #when - getting tracking path
      const result = getTrackingPathFromInput(input);

      // #then - should default to timelock for discovery inputs
      expect(result).toBe("timelock");
    });

    it("should return election for election input", () => {
      // #given - an election input type
      const input: TrackingInput = { type: "election", electionIndex: 0 } as any;

      // #when - getting tracking path
      const result = getTrackingPathFromInput(input);

      // #then - should return election
      expect(result).toBe("election");
    });
  });

  describe("createModularCheckpoints", () => {
    it("should create parent checkpoint with timelockOpKey", async () => {
      // #given - a context with completed parent stages and timelockOpKey
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });
      ctx = setTimelockOpKey(ctx, "tx:0xabc:op:0xdef");

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      ctx = await addStage(ctx, stage);

      // #when - creating modular checkpoints
      const result = createModularCheckpoints(ctx, "test:key");

      // #then - parent checkpoint should contain timelockOpKey
      expect(result.parentCheckpoint).toBeDefined();
      expect(result.parentCheckpoint.metadata?.timelockOpKey).toBe("tx:0xabc:op:0xdef");
      expect(result.timelockOpKey).toBe("tx:0xabc:op:0xdef");
    });

    it("should return null timelock checkpoint when no timelock progress", async () => {
      // #given - a context with only parent stages (no timelock progress)
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      ctx = await addStage(ctx, stage);

      // #when - creating modular checkpoints
      const result = createModularCheckpoints(ctx, "test:key");

      // #then - timelock checkpoint should be null
      expect(result.timelockCheckpoint).toBeNull();
    });

    it("should create timelock checkpoint when timelock stages have progress", async () => {
      // #given - a context with timelock progress
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1")
        .status("COMPLETED")
        .data({
          operationId: "0xop123",
          timelockAddress: "0x1234567890123456789012345678901234567890",
        })
        .tx("0xqueue", 100, "arb1", 42161, { description: "queued" })
        .build();
      ctx = await addStage(ctx, proposalQueued);

      const l2Timelock = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ operationId: "0xop123", eta: 1700000000 })
        .build();
      ctx = await addStage(ctx, l2Timelock);

      // #when - creating modular checkpoints
      const result = createModularCheckpoints(ctx, "test:key");

      // #then - timelock checkpoint should be created
      expect(result.timelockCheckpoint).not.toBeNull();
      expect(result.timelockCheckpoint?.metadata?.sourceCheckpoint).toBe("test:key");
    });

    it("should fallback to original input when timelock data incomplete", async () => {
      // #given - a context with timelock stages but missing operationId/timelockAddress
      let ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // L2_TIMELOCK stage without required derivation data
      const l2Timelock = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ eta: 1700000000 }) // missing operationId and timelockAddress
        .build();
      ctx = await addStage(ctx, l2Timelock);

      // #when - creating modular checkpoints
      const result = createModularCheckpoints(ctx, "test:key");

      // #then - timelock checkpoint should use original input as fallback
      expect(result.timelockCheckpoint).not.toBeNull();
      expect(result.timelockCheckpoint?.input.type).toBe("governor");
    });
  });

  describe("setTimelockOpKey", () => {
    it("should update timelockOpKey in context", () => {
      // #given - a fresh context without timelockOpKey
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });
      expect(ctx.timelockOpKey).toBeUndefined();

      // #when - setting timelockOpKey
      const newCtx = setTimelockOpKey(ctx, "tx:0xabc:op:0xdef");

      // #then - new context should have timelockOpKey
      expect(newCtx.timelockOpKey).toBe("tx:0xabc:op:0xdef");
      expect(ctx.timelockOpKey).toBeUndefined(); // original unchanged
    });
  });

  describe("getElectionIndex", () => {
    it("should return election index for election input", () => {
      // #given - an election context
      const ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 5 } as TrackingInput,
      });

      // #when - getting election index
      const result = getElectionIndex(ctx);

      // #then - should return the election index
      expect(result).toBe(5);
    });

    it("should return undefined for non-election input", () => {
      // #given - a governor context
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // #when - getting election index
      const result = getElectionIndex(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });
  });

  describe("getNomineeProposalId", () => {
    it("should return from CREATE_ELECTION stage", async () => {
      // #given - a context with CREATE_ELECTION stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("CREATE_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ nomineeProposalId: "nom123" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting nominee proposal ID
      const result = getNomineeProposalId(ctx);

      // #then - should return from CREATE_ELECTION
      expect(result).toBe("nom123");
    });

    it("should fallback to NOMINEE_ELECTION stage", async () => {
      // #given - a context with only NOMINEE_ELECTION stage containing nomineeProposalId
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("NOMINEE_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ nomineeProposalId: "nom456" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting nominee proposal ID
      const result = getNomineeProposalId(ctx);

      // #then - should fallback to NOMINEE_ELECTION
      expect(result).toBe("nom456");
    });
  });

  describe("getMemberProposalId", () => {
    it("should return from NOMINEE_VETTING stage", async () => {
      // #given - a context with NOMINEE_VETTING stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("NOMINEE_VETTING", "arb1")
        .status("COMPLETED")
        .data({ memberProposalId: "mem123" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting member proposal ID
      const result = getMemberProposalId(ctx);

      // #then - should return from NOMINEE_VETTING
      expect(result).toBe("mem123");
    });

    it("should fallback to MEMBER_ELECTION stage", async () => {
      // #given - a context with only MEMBER_ELECTION stage containing memberProposalId
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("MEMBER_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ memberProposalId: "mem456" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting member proposal ID
      const result = getMemberProposalId(ctx);

      // #then - should fallback to MEMBER_ELECTION
      expect(result).toBe("mem456");
    });
  });

  describe("getElectionCohort", () => {
    it("should return cohort from CREATE_ELECTION stage", async () => {
      // #given - a context with CREATE_ELECTION stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("CREATE_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ cohort: 0 })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting election cohort
      const result = getElectionCohort(ctx);

      // #then - should return cohort
      expect(result).toBe(0);
    });

    it("should return undefined when no CREATE_ELECTION stage", () => {
      // #given - a fresh election context
      const ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      // #when - getting election cohort
      const result = getElectionCohort(ctx);

      // #then - should return undefined
      expect(result).toBeUndefined();
    });
  });

  describe("getCompliantNomineeCount", () => {
    it("should return from NOMINEE_ELECTION stage", async () => {
      // #given - a context with NOMINEE_ELECTION stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("NOMINEE_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ compliantNomineeCount: 12 })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting compliant nominee count
      const result = getCompliantNomineeCount(ctx);

      // #then - should return from NOMINEE_ELECTION
      expect(result).toBe(12);
    });

    it("should fallback to NOMINEE_VETTING stage", async () => {
      // #given - a context with only NOMINEE_VETTING stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("NOMINEE_VETTING", "arb1")
        .status("COMPLETED")
        .data({ compliantNomineeCount: 8 })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting compliant nominee count
      const result = getCompliantNomineeCount(ctx);

      // #then - should fallback to NOMINEE_VETTING
      expect(result).toBe(8);
    });
  });

  describe("getTargetNomineeCount", () => {
    it("should return from NOMINEE_ELECTION stage", async () => {
      // #given - a context with NOMINEE_ELECTION stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("NOMINEE_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ targetNomineeCount: 6 })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting target nominee count
      const result = getTargetNomineeCount(ctx);

      // #then - should return target nominee count
      expect(result).toBe(6);
    });
  });

  describe("getVettingDeadline", () => {
    it("should return from NOMINEE_VETTING stage", async () => {
      // #given - a context with NOMINEE_VETTING stage
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("NOMINEE_VETTING", "arb1")
        .status("COMPLETED")
        .data({ vettingDeadline: 1700000000 })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting vetting deadline
      const result = getVettingDeadline(ctx);

      // #then - should return vetting deadline
      expect(result).toBe(1700000000);
    });
  });

  describe("getElectionTimelockOperationId", () => {
    it("should return from MEMBER_ELECTION stage", async () => {
      // #given - a context with MEMBER_ELECTION stage containing operationId
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("MEMBER_ELECTION", "arb1")
        .status("COMPLETED")
        .data({ operationId: "0xelection_op" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting election timelock operation ID
      const result = getElectionTimelockOperationId(ctx);

      // #then - should return from MEMBER_ELECTION
      expect(result).toBe("0xelection_op");
    });

    it("should fallback to getOperationId", async () => {
      // #given - a context with L2_TIMELOCK stage (no MEMBER_ELECTION operationId)
      let ctx = createTrackingState({
        providers: mockProviders,
        input: { type: "election", electionIndex: 0 } as TrackingInput,
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("COMPLETED")
        .data({ operationId: "0xl2_op" })
        .build();
      ctx = await addStage(ctx, stage);

      // #when - getting election timelock operation ID
      const result = getElectionTimelockOperationId(ctx);

      // #then - should fallback to L2_TIMELOCK operationId
      expect(result).toBe("0xl2_op");
    });
  });

  describe("createTrackingState - linkedTimelockCheckpoint", () => {
    it("should merge linked timelock checkpoint stages", async () => {
      // #given - a parent checkpoint and a linked timelock checkpoint
      const parentCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: createGovernorInput(),
        lastProcessedStage: "PROPOSAL_QUEUED",
        lastProcessedBlock: { l1: 0, l2: 100, nova: 0 },
        cachedData: {
          completedStages: [
            new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
          ],
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), timelockOpKey: "tx:0x:op:0x" },
      };

      const timelockCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: createTimelockInput(),
        lastProcessedStage: "L2_TIMELOCK",
        lastProcessedBlock: { l1: 0, l2: 200, nova: 0 },
        cachedData: {
          completedStages: [
            new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").data({ eta: 123 }).build(),
          ],
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      // #when - creating context with linked timelock checkpoint
      const ctx = createTrackingState({
        providers: mockProviders,
        input: createGovernorInput(),
        checkpoint: parentCheckpoint,
        linkedTimelockCheckpoint: timelockCheckpoint,
      });

      // #then - both stages should be restored
      const proposalCreated = ctx.stages.find((s) => s.type === "PROPOSAL_CREATED");
      const l2Timelock = ctx.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(proposalCreated?.status).toBe("COMPLETED");
      expect(l2Timelock?.status).toBe("PENDING");
      expect(ctx.timelockOpKey).toBe("tx:0x:op:0x");
    });
  });
});
