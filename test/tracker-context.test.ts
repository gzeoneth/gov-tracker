/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for TrackingContext - Pure functional state management
 *
 * These tests verify the TrackingContext module's pure functions without RPC calls.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ethers, BigNumber } from "ethers";
import {
  createTrackingContext,
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
  toResult,
  Providers,
} from "../src/tracker/context";
import { StageBuilder } from "../src/stages/stage-builder";
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

describe("TrackingContext", () => {
  let mockProviders: Providers;

  beforeEach(() => {
    mockProviders = createMockProviders();
  });

  describe("createTrackingContext", () => {
    it("should create context for governor input", () => {
      const input = createGovernorInput();
      const ctx = createTrackingContext({
        providers: mockProviders,
        input,
      });

      expect(ctx.input).toBe(input);
      expect(ctx.providers).toBe(mockProviders);
      expect(ctx.stages.length).toBe(7); // All 7 stages for governor
      expect(ctx.stageIndex).toBe(0);
    });

    it("should create context for timelock input", () => {
      const input = createTimelockInput();
      const ctx = createTrackingContext({
        providers: mockProviders,
        input,
      });

      expect(ctx.input).toBe(input);
      // Timelock path should not include PROPOSAL_CREATED and VOTING_ACTIVE
      expect(ctx.stages.some((s) => s.type === "PROPOSAL_CREATED")).toBe(false);
      expect(ctx.stages.some((s) => s.type === "VOTING_ACTIVE")).toBe(false);
    });

    it("should initialize all stages to NOT_STARTED", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(ctx.stages.every((s) => s.status === "NOT_STARTED")).toBe(true);
    });

    it("should use default chunking config", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(ctx.chunkingConfig).toBeDefined();
    });

    it("should use custom chunking config when provided", () => {
      const customConfig = {
        l1ChunkSize: 500,
        l2ChunkSize: 50000,
        novaChunkSize: 1000,
        delayBetweenChunks: 0,
      };
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
        chunkingConfig: customConfig,
      });

      expect(ctx.chunkingConfig).toEqual(customConfig);
    });

    it("should store onProgress callback", () => {
      const onProgress = vi.fn();
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
        onProgress,
      });

      expect(ctx.onProgress).toBe(onProgress);
    });

    it("should store cacheKey", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
        cacheKey: "test-cache-key",
      });

      expect(ctx.cacheKey).toBe("test-cache-key");
    });

    it("should store callScheduledData bootstrap data", () => {
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

      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      expect(ctx.callScheduledData).toEqual(mockData);
    });

    it("should load stages from checkpoint", () => {
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

      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
        checkpoint,
      });

      const stage = ctx.stages.find((s) => s.type === "PROPOSAL_CREATED");
      expect(stage?.status).toBe("COMPLETED");
      expect(ctx.stageIndex).toBe(1);
    });
  });

  describe("addStage", () => {
    it("should update stage in context", async () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const newStage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "12345" })
        .build();

      const newCtx = await addStage(ctx, newStage);

      const stage = newCtx.stages.find((s) => s.type === "PROPOSAL_CREATED");
      expect(stage?.status).toBe("COMPLETED");
      expect(newCtx.stageIndex).toBe(1);
    });

    it("should call onProgress callback", async () => {
      const onProgress = vi.fn();
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
        onProgress,
      });

      const newStage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();

      await addStage(ctx, newStage);

      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: newStage,
          isComplete: false,
        })
      );
    });

    it("should not mutate original context", async () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const originalStageIndex = ctx.stageIndex;

      const newStage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();

      await addStage(ctx, newStage);

      // Original should be unchanged
      expect(ctx.stageIndex).toBe(originalStageIndex);
    });
  });

  describe("isStageCompleted", () => {
    it("should return true for COMPLETED stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      ctx = await addStage(ctx, stage);

      expect(isStageCompleted(ctx, "PROPOSAL_CREATED")).toBe(true);
    });

    it("should return true for SKIPPED stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1").skip("L2-only path").build();
      ctx = await addStage(ctx, stage);

      expect(isStageCompleted(ctx, "L2_TO_L1_MESSAGE")).toBe(true);
    });

    it("should return false for PENDING stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage);

      expect(isStageCompleted(ctx, "PROPOSAL_CREATED")).toBe(false);
    });

    it("should return false for NOT_STARTED stage", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(isStageCompleted(ctx, "PROPOSAL_CREATED")).toBe(false);
    });
  });

  describe("getCompletedStage", () => {
    it("should return completed stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      ctx = await addStage(ctx, stage);

      const result = getCompletedStage(ctx, "PROPOSAL_CREATED");
      expect(result).toBeDefined();
      expect(result?.status).toBe("COMPLETED");
    });

    it("should return skipped stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L1_TIMELOCK", "ethereum").skip("test").build();
      ctx = await addStage(ctx, stage);

      const result = getCompletedStage(ctx, "L1_TIMELOCK");
      expect(result).toBeDefined();
      expect(result?.status).toBe("SKIPPED");
    });

    it("should return undefined for pending stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage);

      expect(getCompletedStage(ctx, "PROPOSAL_CREATED")).toBeUndefined();
    });
  });

  describe("getCachedStage", () => {
    it("should return stage regardless of status", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage);

      const result = getCachedStage(ctx, "PROPOSAL_CREATED");
      expect(result).toBeDefined();
      expect(result?.status).toBe("PENDING");
    });
  });

  describe("isComplete", () => {
    it("should return false when stages are not complete", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(isComplete(ctx)).toBe(false);
    });

    it("should return true when all stages are complete", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // Mark all stages as completed
      for (const stage of ctx.stages) {
        const completed = new StageBuilder(stage.type, stage.chain).status("COMPLETED").build();
        ctx = await addStage(ctx, completed);
      }

      expect(isComplete(ctx)).toBe(true);
    });

    it("should return true when mix of COMPLETED and SKIPPED", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      // Mark some as completed, some as skipped
      for (let i = 0; i < ctx.stages.length; i++) {
        const stage = ctx.stages[i];
        const builder = new StageBuilder(stage.type, stage.chain);
        const updated =
          i % 2 === 0 ? builder.status("COMPLETED").build() : builder.skip("test").build();
        ctx = await addStage(ctx, updated);
      }

      expect(isComplete(ctx)).toBe(true);
    });
  });

  describe("getGovernorAddress", () => {
    it("should return governor address for governor input", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(getGovernorAddress(ctx)).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
    });

    it("should return undefined for timelock input", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput(),
      });

      expect(getGovernorAddress(ctx)).toBeUndefined();
    });
  });

  describe("getProposalId", () => {
    it("should return proposalId for governor input", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput({ proposalId: "67890" } as any),
      });

      expect(getProposalId(ctx)).toBe("67890");
    });

    it("should return undefined for timelock input", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput(),
      });

      expect(getProposalId(ctx)).toBeUndefined();
    });
  });

  describe("getTimelockAddress", () => {
    it("should return timelockAddress from timelock input", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput(),
      });

      expect(getTimelockAddress(ctx)).toBe(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK);
    });

    it("should return timelockAddress from PROPOSAL_QUEUED stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_QUEUED", "arb1")
        .status("COMPLETED")
        .data({ timelockAddress: "0x9999999999999999999999999999999999999999" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getTimelockAddress(ctx)).toBe("0x9999999999999999999999999999999999999999");
    });

    it("should fallback to L2_TIMELOCK stage data", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ timelockAddress: "0x8888888888888888888888888888888888888888" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getTimelockAddress(ctx)).toBe("0x8888888888888888888888888888888888888888");
    });
  });

  describe("getOperationId", () => {
    it("should return operationId from timelock input", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput({ operationId: "0xdeadbeef" } as any),
      });

      expect(getOperationId(ctx)).toBe("0xdeadbeef");
    });

    it("should return operationId from PROPOSAL_QUEUED stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_QUEUED", "arb1")
        .status("COMPLETED")
        .data({ operationId: "0xfeedbeef" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getOperationId(ctx)).toBe("0xfeedbeef");
    });
  });

  describe("getCallScheduledData", () => {
    it("should return bootstrap callScheduledData", () => {
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

      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      expect(getCallScheduledData(ctx)).toEqual(mockData);
    });
  });

  describe("getFirstCallScheduledData", () => {
    it("should return first item from callScheduledData", () => {
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

      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      const first = getFirstCallScheduledData(ctx);
      expect(first?.target).toBe("0x1111111111111111111111111111111111111111");
    });
  });

  describe("getQueueBlockNumber", () => {
    it("should return blockNumber from first callScheduledData", () => {
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

      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createTimelockInput(),
        callScheduledData: mockData,
      });

      expect(getQueueBlockNumber(ctx)).toBe(54321);
    });

    it("should return undefined when no callScheduledData", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(getQueueBlockNumber(ctx)).toBeUndefined();
    });
  });

  describe("getProposalData", () => {
    it("should return undefined for NOT_STARTED stage", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(getProposalData(ctx)).toBeUndefined();
    });

    it("should return proposal data from COMPLETED stage", async () => {
      let ctx = createTrackingContext({
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

      const result = getProposalData(ctx);
      expect(result).toBeDefined();
      expect(result?.proposalId).toBe("12345");
      expect(result?.proposer).toBe("0x1111111111111111111111111111111111111111");
      expect(result?.creationBlock).toBe(50);
      expect(result?.creationTxHash).toBe("0xabc");
    });
  });

  describe("getProposalType", () => {
    it("should detect CONSTITUTIONAL from governor address", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR } as any),
      });

      expect(getProposalType(ctx)).toBe("CONSTITUTIONAL");
    });

    it("should detect NON_CONSTITUTIONAL from governor address", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput({
          governorAddress: ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
        } as any),
      });

      expect(getProposalType(ctx)).toBe("NON_CONSTITUTIONAL");
    });

    it("should return proposalType from stage data if available", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalType: "ELECTION_NOMINEE" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getProposalType(ctx)).toBe("ELECTION_NOMINEE");
    });
  });

  describe("getIsElection", () => {
    it("should return false for CONSTITUTIONAL", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR } as any),
      });

      expect(getIsElection(ctx)).toBe(false);
    });

    it("should return true for ELECTION_NOMINEE", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.ELECTION_NOMINEE_GOVERNOR } as any),
      });

      expect(getIsElection(ctx)).toBe(true);
    });

    it("should return true for ELECTION_MEMBER", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.ELECTION_MEMBER_GOVERNOR } as any),
      });

      expect(getIsElection(ctx)).toBe(true);
    });
  });

  describe("getProposalState", () => {
    it("should return undefined when no voting data", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(getProposalState(ctx)).toBeUndefined();
    });

    it("should return proposalState from VOTING_ACTIVE stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ proposalState: "Succeeded" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getProposalState(ctx)).toBe("Succeeded");
    });
  });

  describe("getVotingEndBlock", () => {
    it("should return deadline from VOTING_ACTIVE stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ deadline: "50000" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getVotingEndBlock(ctx)).toBe(50000);
    });

    it("should use extendedDeadline if greater than deadline", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ deadline: "50000", extendedDeadline: "60000" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getVotingEndBlock(ctx)).toBe(60000);
    });

    it("should ignore extendedDeadline if not greater than deadline", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .status("COMPLETED")
        .data({ deadline: "50000", extendedDeadline: "40000" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getVotingEndBlock(ctx)).toBe(50000);
    });
  });

  describe("getL2ExecutionTxHash", () => {
    it("should return undefined when L2_TIMELOCK not complete", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(getL2ExecutionTxHash(ctx)).toBeUndefined();
    });

    it("should return execution tx hash from COMPLETED L2_TIMELOCK", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("COMPLETED")
        .tx("0xqueue", 100, "arb1", 42161, { description: "queued" })
        .tx("0xexecute", 200, "arb1", 42161, { description: "executed" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getL2ExecutionTxHash(ctx)).toBe("0xexecute");
    });
  });

  describe("getFirstExecutableBlock", () => {
    it("should return firstExecutableBlock from L2_TO_L1_MESSAGE stage", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .status("PENDING")
        .data({ firstExecutableBlock: 21000000 })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getFirstExecutableBlock(ctx)).toBe(21000000);
    });
  });

  describe("getOutboxExecutionTx", () => {
    it("should return undefined when L2_TO_L1_MESSAGE not complete", () => {
      const ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      expect(getOutboxExecutionTx(ctx)).toBeUndefined();
    });

    it("should return L1 transaction from COMPLETED L2_TO_L1_MESSAGE", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .status("COMPLETED")
        .tx("0xl2tx", 1000, "arb1", 42161)
        .tx("0xl1tx", 21000000, "ethereum", 1)
        .build();
      ctx = await addStage(ctx, stage);

      const result = getOutboxExecutionTx(ctx);
      expect(result).toEqual({ hash: "0xl1tx", blockNumber: 21000000 });
    });
  });

  describe("getL1ExecutionTxHash", () => {
    it("should return execution tx hash from COMPLETED L1_TIMELOCK", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L1_TIMELOCK", "ethereum")
        .status("COMPLETED")
        .tx("0xqueue", 21000000, "ethereum", 1, { description: "queued" })
        .tx("0xexecute", 21001000, "ethereum", 1, { description: "executed" })
        .build();
      ctx = await addStage(ctx, stage);

      expect(getL1ExecutionTxHash(ctx)).toBe("0xexecute");
    });
  });

  describe("createCheckpoint", () => {
    it("should create checkpoint with completed stages", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage1 = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();
      const stage2 = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();
      ctx = await addStage(ctx, stage1);
      ctx = await addStage(ctx, stage2);

      const checkpoint = createCheckpoint(ctx);

      expect(checkpoint.version).toBe(1);
      expect(checkpoint.input).toBe(ctx.input);
      expect(checkpoint.lastProcessedStage).toBe("VOTING_ACTIVE");
      expect(checkpoint.cachedData.completedStages?.length).toBe(2);
    });

    it("should include pending stages for resume data", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput(),
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ operationId: "0xtest", eta: 1700000000 })
        .build();
      ctx = await addStage(ctx, stage);

      const checkpoint = createCheckpoint(ctx);

      // PENDING stages should be included for resume
      const cached = checkpoint.cachedData.completedStages?.find((s) => s.type === "L2_TIMELOCK");
      expect(cached).toBeDefined();
      expect(cached?.status).toBe("PENDING");
    });
  });

  describe("toResult", () => {
    it("should generate complete tracking result", async () => {
      let ctx = createTrackingContext({
        providers: mockProviders,
        input: createGovernorInput({ governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR } as any),
      });

      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({
          proposalId: "12345",
          proposer: "0x1111111111111111111111111111111111111111",
          description: "Test",
          targets: ["0x2222222222222222222222222222222222222222"],
          values: ["0"],
          signatures: [""],
          calldatas: ["0x"],
          startBlock: "100",
          endBlock: "200",
          proposalType: "CONSTITUTIONAL",
        })
        .tx("0xabc", 50, "arb1", 42161)
        .build();
      ctx = await addStage(ctx, stage);

      const result = toResult(ctx);

      expect(result.input).toBe(ctx.input);
      expect(result.stages).toBe(ctx.stages);
      expect(result.checkpoint).toBeDefined();
      expect(result.isComplete).toBe(false);
      expect(result.proposalType).toBe("CONSTITUTIONAL");
      expect(result.proposalData).toBeDefined();
      expect(result.isElection).toBe(false);
    });
  });
});
