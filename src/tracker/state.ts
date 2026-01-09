/**
 * TrackingState - Functional state management for pipeline tracking
 *
 * This module provides a purely functional approach to tracking context:
 * - TrackingState interface defines the immutable state shape
 * - Pure functions transform state and derive values
 * - No classes, no mutation, no hidden state
 *
 * Benefits:
 * - Easy testing: just create plain objects
 * - Transparent: can log/inspect full state anytime
 * - Predictable: same input → same output
 * - Composable: mix and match functions freely
 * - Debuggable: save/restore state snapshots
 */

import { BigNumber, ethers } from "ethers";
import { loggers } from "../utils/logger";
import {
  TrackedStage,
  TrackingCheckpoint,
  TrackingInput,
  StageType,
  Chain,
  CallScheduledData,
  ProposalData,
  ProposalType,
  ProposalState,
  OnProgressCallback,
  ChunkingConfig,
  ProposalCreatedData,
  VotingActiveData,
  ProposalQueuedData,
  TimelockStageData,
  L2ToL1MessageStageData,
} from "../types";
import {
  initializeStagesForPath,
  updateStageInList,
  areAllStagesComplete,
  deserializeCallScheduledDataArray,
} from "../stages/utils";
import { isElectionProposal, detectProposalType } from "../discovery/governor-discovery";
import { DEFAULT_CHUNKING_CONFIG } from "../constants";

const { tracker: logTracker } = loggers;

// Types

/**
 * Providers for multi-chain operations
 */
export interface Providers {
  readonly l2: ethers.providers.Provider;
  readonly l1: ethers.providers.Provider;
  readonly nova: ethers.providers.Provider;
}

/**
 * Options for creating a TrackingState
 */
export interface CreateTrackingStateOptions {
  providers: Providers;
  input: TrackingInput;
  onProgress?: OnProgressCallback;
  chunkingConfig?: ChunkingConfig;
  checkpoint?: TrackingCheckpoint;
  cacheKey?: string;
  /** Bootstrap data for timelock-only tracking */
  callScheduledData?: CallScheduledData[];
}

/**
 * TrackingState - Immutable state for pipeline tracking
 *
 * All values are derived from stages. This interface represents
 * a snapshot of the pipeline at a point in time.
 *
 * @example
 * ```typescript
 * let ctx = createTrackingState({ providers, input });
 * ctx = await addStage(ctx, proposalCreatedStage);
 * const opId = getOperationId(ctx);
 * ```
 */
export interface TrackingState {
  // === Providers ===
  readonly providers: Providers;

  // === Configuration ===
  readonly chunkingConfig: ChunkingConfig;
  readonly onProgress?: OnProgressCallback;
  readonly cacheKey?: string;

  // === Input (immutable) ===
  readonly input: TrackingInput;

  // === Bootstrap data ===
  readonly callScheduledData?: CallScheduledData[];

  // === Stages (source of truth) ===
  readonly stages: TrackedStage[];
  readonly stageIndex: number;
}

// State Creation

/**
 * Create a new TrackingState.
 */
function getAddressForPath(input: TrackingInput): string {
  switch (input.type) {
    case "governor":
      return input.governorAddress;
    case "timelock":
      return input.timelockAddress;
    default:
      return "";
  }
}

export function createTrackingState(options: CreateTrackingStateOptions): TrackingState {
  // Initialize stages based on tracking path
  const includeProposal = options.input.type === "governor";
  const addressForPath = getAddressForPath(options.input);

  const initialStages = initializeStagesForPath(addressForPath, includeProposal);

  let ctx: TrackingState = {
    providers: options.providers,
    chunkingConfig: options.chunkingConfig ?? DEFAULT_CHUNKING_CONFIG,
    onProgress: options.onProgress,
    cacheKey: options.cacheKey,
    input: options.input,
    callScheduledData: options.callScheduledData,
    stages: initialStages,
    stageIndex: 0,
  };

  // Load from checkpoint if provided
  if (options.checkpoint?.cachedData.completedStages?.length) {
    ctx = loadFromCheckpoint(ctx, options.checkpoint);
  }

  return ctx;
}

/**
 * Load stages from a checkpoint.
 */
function loadFromCheckpoint(ctx: TrackingState, checkpoint: TrackingCheckpoint): TrackingState {
  const completedStages = checkpoint.cachedData.completedStages;
  if (!completedStages?.length) return ctx;

  logTracker("RESUME: loading %d completed stages from checkpoint", completedStages.length);

  let stages = ctx.stages;
  for (const stage of completedStages) {
    stages = updateStageInList(stages, stage);
  }

  return { ...ctx, stages, stageIndex: completedStages.length };
}

// Stage Management

/**
 * Add or update a stage. Returns new context.
 */
export async function addStage(ctx: TrackingState, stage: TrackedStage): Promise<TrackingState> {
  const newStages = updateStageInList(ctx.stages, stage);
  const newCtx: TrackingState = {
    ...ctx,
    stages: newStages,
    stageIndex: ctx.stageIndex + 1,
  };

  await emitProgress(newCtx, stage);
  return newCtx;
}

// Stage lookup helper (defined early for use in stage management functions)
const findStage = (ctx: TrackingState, type: StageType) => ctx.stages.find((s) => s.type === type);

/** Check if a stage is completed (COMPLETED or SKIPPED). */
export function isStageCompleted(ctx: TrackingState, type: StageType): boolean {
  const s = findStage(ctx, type);
  return s?.status === "COMPLETED" || s?.status === "SKIPPED";
}

/** Get a completed stage for zero-RPC resume. */
export function getCompletedStage(ctx: TrackingState, type: StageType): TrackedStage | undefined {
  const s = findStage(ctx, type);
  return s?.status === "COMPLETED" || s?.status === "SKIPPED" ? s : undefined;
}

/** Get a cached stage (any status). */
export function getCachedStage(ctx: TrackingState, type: StageType): TrackedStage | undefined {
  return findStage(ctx, type);
}

/**
 * Check if all stages are complete.
 */
export function isComplete(ctx: TrackingState): boolean {
  return areAllStagesComplete(ctx.stages);
}

// Stage data helpers
const stageData = <T>(ctx: TrackingState, type: StageType) =>
  findStage(ctx, type)?.data as T | undefined;
const execTx = (s: TrackedStage | undefined) =>
  s?.transactions?.find((tx) => tx.description === "executed");
const chainTx = (s: TrackedStage | undefined, chain: Chain) =>
  s?.transactions?.find((tx) => tx.chain === chain);

// Derived Getters - Input-based
export const getGovernorAddress = (ctx: TrackingState) =>
  ctx.input.type === "governor" ? ctx.input.governorAddress : undefined;
export const getProposalId = (ctx: TrackingState) =>
  ctx.input.type === "governor" ? ctx.input.proposalId : undefined;

// Derived Getters - Multi-source lookups
export function getTimelockAddress(ctx: TrackingState): string | undefined {
  if (ctx.input.type === "timelock") return ctx.input.timelockAddress;
  return (
    stageData<ProposalQueuedData>(ctx, "PROPOSAL_QUEUED")?.timelockAddress ??
    stageData<TimelockStageData>(ctx, "L2_TIMELOCK")?.timelockAddress
  );
}

export function getOperationId(ctx: TrackingState): string | undefined {
  if (ctx.input.type === "timelock") return ctx.input.operationId;
  return (
    stageData<ProposalQueuedData>(ctx, "PROPOSAL_QUEUED")?.operationId ??
    stageData<TimelockStageData>(ctx, "L2_TIMELOCK")?.operationId
  );
}

export function getCallScheduledData(ctx: TrackingState): CallScheduledData[] | undefined {
  if (ctx.callScheduledData) return ctx.callScheduledData;
  const qData = stageData<ProposalQueuedData>(ctx, "PROPOSAL_QUEUED")?.callScheduledData;
  if (qData?.length) return deserializeCallScheduledDataArray(qData);
  const l2Data = stageData<TimelockStageData>(ctx, "L2_TIMELOCK")?.callScheduledData;
  return l2Data?.length ? deserializeCallScheduledDataArray(l2Data) : undefined;
}

export const getFirstCallScheduledData = (ctx: TrackingState) => getCallScheduledData(ctx)?.[0];
export const getQueueBlockNumber = (ctx: TrackingState) =>
  getFirstCallScheduledData(ctx)?.blockNumber;

/** Proposal data from PROPOSAL_CREATED stage */
export function getProposalData(ctx: TrackingState): ProposalData | undefined {
  const s = findStage(ctx, "PROPOSAL_CREATED");
  if (!s || s.status === "NOT_STARTED") return undefined;
  const data = s.data as ProposalCreatedData;
  const tx = s.transactions?.[0];
  if (
    !data.proposalId ||
    !data.startBlock ||
    !data.endBlock ||
    !data.proposer ||
    !data.targets ||
    !data.values ||
    !data.signatures ||
    !data.calldatas ||
    !tx
  )
    return undefined;
  return {
    proposalId: data.proposalId,
    proposer: data.proposer,
    description: data.description,
    targets: data.targets,
    values: data.values.map((v) => BigNumber.from(v)),
    signatures: data.signatures,
    calldatas: data.calldatas,
    startBlock: BigNumber.from(data.startBlock),
    endBlock: BigNumber.from(data.endBlock),
    creationBlock: tx.blockNumber,
    creationTxHash: tx.hash,
  };
}

export function getProposalType(ctx: TrackingState): ProposalType | undefined {
  const data = stageData<ProposalCreatedData>(ctx, "PROPOSAL_CREATED");
  if (data?.proposalType) return data.proposalType as ProposalType;
  const addr = getGovernorAddress(ctx);
  return addr ? detectProposalType(addr) : undefined;
}

export const getIsElection = (ctx: TrackingState) => {
  const type = getProposalType(ctx);
  return type ? isElectionProposal(type) : false;
};

export const getProposalState = (ctx: TrackingState) =>
  stageData<VotingActiveData>(ctx, "VOTING_ACTIVE")?.proposalState as ProposalState | undefined;

export function getVotingEndBlock(ctx: TrackingState): number | undefined {
  const data = stageData<VotingActiveData>(ctx, "VOTING_ACTIVE");
  if (!data?.deadline) return undefined;
  const deadline = parseInt(data.deadline, 10);
  const extended = data.extendedDeadline ? parseInt(data.extendedDeadline, 10) : 0;
  return extended > deadline ? extended : deadline;
}

export function getL2ExecutionTxHash(ctx: TrackingState): string | undefined {
  const s = findStage(ctx, "L2_TIMELOCK");
  return s?.status === "COMPLETED" ? execTx(s)?.hash : undefined;
}

export const getFirstExecutableBlock = (ctx: TrackingState) =>
  stageData<L2ToL1MessageStageData>(ctx, "L2_TO_L1_MESSAGE")?.firstExecutableBlock;

export function getOutboxExecutionTx(
  ctx: TrackingState
): { hash: string; blockNumber: number } | undefined {
  const s = findStage(ctx, "L2_TO_L1_MESSAGE");
  if (s?.status !== "COMPLETED") return undefined;
  const tx = chainTx(s, "ethereum");
  return tx ? { hash: tx.hash, blockNumber: tx.blockNumber } : undefined;
}

export function getL1ExecutionTxHash(ctx: TrackingState): string | undefined {
  const s = findStage(ctx, "L1_TIMELOCK");
  return s?.status === "COMPLETED" ? execTx(s)?.hash : undefined;
}

// Checkpoint & Result

export function createCheckpoint(ctx: TrackingState): TrackingCheckpoint {
  const completedStages = ctx.stages.filter((s) => s.status !== "NOT_STARTED");
  const lastProcessedStage =
    [...ctx.stages].reverse().find((s) => s.status !== "NOT_STARTED")?.type ?? null;
  return {
    version: 1,
    createdAt: Date.now(),
    input: ctx.input,
    lastProcessedStage,
    lastProcessedBlock: { l1: 0, l2: 0, nova: 0 },
    cachedData: { completedStages },
    metadata: { errorCount: 0, lastTrackedAt: Date.now() },
  };
}

async function emitProgress(ctx: TrackingState, s: TrackedStage): Promise<void> {
  if (!ctx.onProgress) return;
  const idx = ctx.stages.findIndex((x) => x.type === s.type);
  await ctx.onProgress({
    stage: s,
    stages: ctx.stages,
    currentIndex: idx >= 0 ? idx : ctx.stageIndex,
    totalStages: ctx.stages.length,
    isComplete: isComplete(ctx),
  });
}

export function toResult(ctx: TrackingState) {
  return {
    input: ctx.input,
    stages: ctx.stages,
    checkpoint: createCheckpoint(ctx),
    isComplete: isComplete(ctx),
    proposalType: getProposalType(ctx),
    proposalData: getProposalData(ctx),
    currentState: getProposalState(ctx),
    isElection: getIsElection(ctx),
  };
}
