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
  initializeStagesForTrackingPath,
  updateStageInList,
  areAllStagesComplete,
  deserializeCallScheduledDataArray,
  TrackingPath,
  splitStages,
  hasTimelockProgress,
} from "../stages/utils";
import { isElectionProposal, detectProposalType } from "../discovery/governor-discovery";
import { DEFAULT_CHUNKING_CONFIG } from "../constants";
import {
  CreateElectionData,
  NomineeElectionData,
  NomineeVettingData,
  MemberElectionData,
  CohortType,
} from "../types";

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
  /** Parent checkpoint (proposal/election stages) */
  checkpoint?: TrackingCheckpoint;
  /** Linked timelock checkpoint for modular caching */
  linkedTimelockCheckpoint?: TrackingCheckpoint;
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

  // === Modular caching ===
  /**
   * Key to the linked timelock operation checkpoint.
   * For elections: link to tx:{memberExecuteTxHash}:op:{operationId}
   * For proposals: link to tx:{queueTxHash}:op:{operationId}
   * This enables modular caching where timelock stages are stored separately.
   */
  readonly timelockOpKey?: string;
}

// State Creation

/**
 * Determine tracking path from input type
 */
export function getTrackingPathFromInput(input: TrackingInput): TrackingPath {
  switch (input.type) {
    case "governor":
      return "governor";
    case "timelock":
      return "timelock";
    case "election":
      return "election";
    case "discovery":
      // Discovery inputs don't have stages, but default to timelock for safety
      return "timelock";
  }
}

export function createTrackingState(options: CreateTrackingStateOptions): TrackingState {
  // Initialize stages based on tracking path
  const path = getTrackingPathFromInput(options.input);
  const initialStages = initializeStagesForTrackingPath(path);

  // Get timelockOpKey from parent checkpoint metadata if present
  const timelockOpKey = options.checkpoint?.metadata?.timelockOpKey;

  let ctx: TrackingState = {
    providers: options.providers,
    chunkingConfig: options.chunkingConfig ?? DEFAULT_CHUNKING_CONFIG,
    onProgress: options.onProgress,
    cacheKey: options.cacheKey,
    input: options.input,
    callScheduledData: options.callScheduledData,
    stages: initialStages,
    stageIndex: 0,
    timelockOpKey,
  };

  // Load from parent checkpoint (non-timelock stages)
  if (options.checkpoint?.cachedData.completedStages?.length) {
    ctx = loadFromCheckpoint(ctx, options.checkpoint);
  }

  // Load from linked timelock checkpoint (timelock stages)
  if (options.linkedTimelockCheckpoint?.cachedData.completedStages?.length) {
    ctx = loadFromCheckpoint(ctx, options.linkedTimelockCheckpoint);
    logTracker("RESUME: merged linked timelock checkpoint");
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
    stageData<MemberElectionData>(ctx, "MEMBER_ELECTION")?.timelockAddress ??
    stageData<TimelockStageData>(ctx, "L2_TIMELOCK")?.timelockAddress
  );
}

export function getOperationId(ctx: TrackingState): string | undefined {
  if (ctx.input.type === "timelock") return ctx.input.operationId;
  return (
    stageData<ProposalQueuedData>(ctx, "PROPOSAL_QUEUED")?.operationId ??
    stageData<MemberElectionData>(ctx, "MEMBER_ELECTION")?.operationId ??
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

/**
 * Create a full checkpoint with all stages (legacy behavior).
 * For modular caching, use createModularCheckpoints instead.
 */
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
    metadata: {
      errorCount: 0,
      lastTrackedAt: Date.now(),
      timelockOpKey: ctx.timelockOpKey,
    },
  };
}

/**
 * Result of modular checkpoint creation.
 */
export interface ModularCheckpoints {
  /** Parent checkpoint (proposal/election stages only) */
  parentCheckpoint: TrackingCheckpoint;
  /** Timelock checkpoint (timelock stages only), null if no timelock progress */
  timelockCheckpoint: TrackingCheckpoint | null;
  /** Cache key for the timelock checkpoint */
  timelockOpKey: string | null;
}

/**
 * Create modular checkpoints - splits parent and timelock stages.
 *
 * This enables:
 * - Independent timelock tracking/resumption
 * - Clear separation between proposal/election and timelock lifecycle
 * - Efficient caching with minimal duplication
 *
 * @param ctx - The tracking state
 * @param parentCacheKey - Cache key for the parent checkpoint (e.g., "election:0" or "tx:0x...")
 */
export function createModularCheckpoints(
  ctx: TrackingState,
  parentCacheKey: string
): ModularCheckpoints {
  const allCompletedStages = ctx.stages.filter((s) => s.status !== "NOT_STARTED");
  const { parentStages, timelockStages } = splitStages(allCompletedStages);

  // Determine timelockOpKey from state or derive from data
  const timelockOpKey = ctx.timelockOpKey ?? null;

  // Parent checkpoint - only contains parent stages
  const parentLastStage =
    [...parentStages].reverse().find((s) => s.status !== "NOT_STARTED")?.type ?? null;
  const parentCheckpoint: TrackingCheckpoint = {
    version: 1,
    createdAt: Date.now(),
    input: ctx.input,
    lastProcessedStage: parentLastStage,
    lastProcessedBlock: { l1: 0, l2: 0, nova: 0 },
    cachedData: { completedStages: parentStages },
    metadata: {
      errorCount: 0,
      lastTrackedAt: Date.now(),
      timelockOpKey: timelockOpKey ?? undefined,
    },
  };

  // Timelock checkpoint - only contains timelock stages
  let timelockCheckpoint: TrackingCheckpoint | null = null;
  if (timelockStages.length > 0 && hasTimelockProgress(ctx.stages)) {
    const timelockLastStage =
      [...timelockStages].reverse().find((s) => s.status !== "NOT_STARTED")?.type ?? null;

    // Create timelock input from ctx
    const timelockInput = deriveTimelockInput(ctx);

    timelockCheckpoint = {
      version: 1,
      createdAt: Date.now(),
      input: timelockInput,
      lastProcessedStage: timelockLastStage,
      lastProcessedBlock: { l1: 0, l2: 0, nova: 0 },
      cachedData: { completedStages: timelockStages },
      metadata: {
        errorCount: 0,
        lastTrackedAt: Date.now(),
        sourceCheckpoint: parentCacheKey,
      },
    };
  }

  return {
    parentCheckpoint,
    timelockCheckpoint,
    timelockOpKey,
  };
}

/**
 * Derive timelock input from tracking state.
 * Used when creating timelock checkpoints for modular caching.
 */
function deriveTimelockInput(ctx: TrackingState): TrackingInput {
  const operationId = getOperationId(ctx);
  const timelockAddress = getTimelockAddress(ctx);
  const scheduledTxHash = deriveScheduledTxHash(ctx);

  if (operationId && timelockAddress && scheduledTxHash) {
    return {
      type: "timelock",
      timelockAddress,
      operationId,
      scheduledTxHash,
    };
  }

  // Fallback to original input if we can't derive timelock input
  return ctx.input;
}

/**
 * Derive the scheduled tx hash from tracking state.
 * For proposals: queue tx hash from PROPOSAL_QUEUED
 * For elections: member execute tx hash from MEMBER_ELECTION
 */
function deriveScheduledTxHash(ctx: TrackingState): string | undefined {
  // From PROPOSAL_QUEUED stage
  const queuedStage = findStage(ctx, "PROPOSAL_QUEUED");
  if (queuedStage?.status === "COMPLETED") {
    const execTxn = queuedStage.transactions?.find((t) => t.description === "queued");
    if (execTxn?.hash) return execTxn.hash;
  }

  // From MEMBER_ELECTION stage (for elections)
  const memberStage = findStage(ctx, "MEMBER_ELECTION");
  if (memberStage?.status === "COMPLETED") {
    const execTxn = memberStage.transactions?.find((t) => t.description === "executed");
    if (execTxn?.hash) return execTxn.hash;
  }

  // From L2_TIMELOCK stage
  const l2Stage = findStage(ctx, "L2_TIMELOCK");
  if (l2Stage) {
    const scheduleTxn = l2Stage.transactions?.find((t) => t.description === "scheduled");
    if (scheduleTxn?.hash) return scheduleTxn.hash;
  }

  return undefined;
}

/**
 * Update timelockOpKey in tracking state.
 * Called when timelock tracking begins (after PROPOSAL_QUEUED or MEMBER_ELECTION).
 */
export function setTimelockOpKey(ctx: TrackingState, timelockOpKey: string): TrackingState {
  return { ...ctx, timelockOpKey };
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

// Election-specific getters

/** Get election index from election input */
export const getElectionIndex = (ctx: TrackingState): number | undefined =>
  ctx.input.type === "election" ? ctx.input.electionIndex : undefined;

/** Get nominee proposal ID from CREATE_ELECTION or NOMINEE_ELECTION stage */
export function getNomineeProposalId(ctx: TrackingState): string | undefined {
  const createData = stageData<CreateElectionData>(ctx, "CREATE_ELECTION");
  if (createData?.nomineeProposalId) return createData.nomineeProposalId;
  const nomineeData = stageData<NomineeElectionData>(ctx, "NOMINEE_ELECTION");
  return nomineeData?.nomineeProposalId;
}

/** Get member proposal ID from NOMINEE_VETTING or MEMBER_ELECTION stage */
export function getMemberProposalId(ctx: TrackingState): string | undefined {
  const vettingData = stageData<NomineeVettingData>(ctx, "NOMINEE_VETTING");
  if (vettingData?.memberProposalId) return vettingData.memberProposalId;
  const memberData = stageData<MemberElectionData>(ctx, "MEMBER_ELECTION");
  return memberData?.memberProposalId;
}

/** Get election cohort from CREATE_ELECTION stage */
export function getElectionCohort(ctx: TrackingState): CohortType | undefined {
  const createData = stageData<CreateElectionData>(ctx, "CREATE_ELECTION");
  return createData?.cohort;
}

/** Get compliant nominee count from NOMINEE_ELECTION or NOMINEE_VETTING stage */
export function getCompliantNomineeCount(ctx: TrackingState): number | undefined {
  const nomineeData = stageData<NomineeElectionData>(ctx, "NOMINEE_ELECTION");
  if (nomineeData?.compliantNomineeCount !== undefined) return nomineeData.compliantNomineeCount;
  const vettingData = stageData<NomineeVettingData>(ctx, "NOMINEE_VETTING");
  return vettingData?.compliantNomineeCount;
}

/** Get target nominee count from NOMINEE_ELECTION stage */
export function getTargetNomineeCount(ctx: TrackingState): number | undefined {
  const nomineeData = stageData<NomineeElectionData>(ctx, "NOMINEE_ELECTION");
  return nomineeData?.targetNomineeCount;
}

/** Get vetting deadline from NOMINEE_VETTING stage */
export function getVettingDeadline(ctx: TrackingState): number | undefined {
  const vettingData = stageData<NomineeVettingData>(ctx, "NOMINEE_VETTING");
  return vettingData?.vettingDeadline;
}

/** Get timelock operation ID from election flow (MEMBER_ELECTION stage) */
export function getElectionTimelockOperationId(ctx: TrackingState): string | undefined {
  // For elections, operation ID comes from MEMBER_ELECTION stage after execution
  const memberData = stageData<MemberElectionData>(ctx, "MEMBER_ELECTION");
  if (memberData?.operationId) return memberData.operationId;

  // Fall back to timelock stages
  return getOperationId(ctx);
}
