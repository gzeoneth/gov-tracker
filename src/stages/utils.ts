/**
 * Stage Utilities
 *
 * Consolidated utilities for stage tracking, serialization, and timelock operations.
 * Previously split between stages/base.ts and utils/stage-helpers.ts.
 */

import { BigNumber, ethers } from "ethers";
import {
  CallScheduledData,
  Chain,
  chainToChainId,
  getStageData,
  OperationState,
  PrepareResult,
  ProposalState,
  SerializedCallScheduledData,
  StageStatus,
  StageType,
  TimelockStageData,
  TimelockState,
  TrackedStage,
} from "../types";
import { timelockInterface } from "../abis";
import { ADDRESSES } from "../constants";
import { isAddressIn } from "../utils/chain";
import { queryWithRetry } from "../utils/rpc-utils";
import { multicall, buildCallInput } from "../utils/multicall";
import { StageBuilder } from "./builder";
import { findCallExecutedEvent } from "../discovery/timelock-discovery";

// ============================================================================
// Section 1: Serialization Utilities
// ============================================================================

const CALL_SCHEDULED_BIGNUM_FIELDS = ["index", "value", "delay"] as const;

/** Generic serializer: converts BigNumber fields to strings for JSON storage. */
export function serialize<T>(data: T, bigNumFields: readonly string[]): T {
  const result = {} as T;
  for (const key of Object.keys(data as object)) {
    const val = (data as Record<string, unknown>)[key];
    (result as Record<string, unknown>)[key] =
      bigNumFields.includes(key) &&
      val &&
      typeof (val as { toString?: unknown }).toString === "function"
        ? (val as { toString: () => string }).toString()
        : val;
  }
  return result;
}

/** Generic deserializer: converts string fields back to BigNumber. */
export function deserialize<T>(data: T, bigNumFields: readonly string[]): T {
  const result = {} as T;
  for (const key of Object.keys(data as object)) {
    const val = (data as Record<string, unknown>)[key];
    (result as Record<string, unknown>)[key] =
      bigNumFields.includes(key) && typeof val === "string" ? BigNumber.from(val) : val;
  }
  return result;
}

/** Serialize CallScheduledData for JSON storage. */
export const serializeCallScheduledData = (data: CallScheduledData): SerializedCallScheduledData =>
  serialize(data, CALL_SCHEDULED_BIGNUM_FIELDS) as unknown as SerializedCallScheduledData;

/** Deserialize CallScheduledData from JSON storage. */
export const deserializeCallScheduledData = (
  data: SerializedCallScheduledData
): CallScheduledData =>
  deserialize(data, CALL_SCHEDULED_BIGNUM_FIELDS) as unknown as CallScheduledData;

/** Serialize/deserialize arrays. */
export const serializeCallScheduledDataArray = (data: CallScheduledData[]) =>
  data.map(serializeCallScheduledData);
export const deserializeCallScheduledDataArray = (data: SerializedCallScheduledData[]) =>
  data.map(deserializeCallScheduledData);

// ============================================================================
// Section 2: Stage Creation and Management
// ============================================================================

/**
 * Create a new tracked stage with default values.
 * Used for initializing placeholder stages that will be filled in later.
 */
function createStage(
  type: StageType,
  chain: Chain,
  status: StageStatus = "NOT_STARTED"
): TrackedStage {
  const chainId = chainToChainId(chain);
  // Assertion needed: we create placeholder stages with empty data that get
  // replaced by properly-built stages. TypeScript can't track this flow.
  return {
    type,
    status,
    chain,
    chainId,
    transactions: [],
    data: {},
    executable: false,
  } as TrackedStage;
}

/** Common timelock stages shared by all paths (single source of truth) */
const COMMON_TIMELOCK_STAGES: readonly StageType[] = [
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
] as const;

/** Full proposal stages (from governor proposal) */
const FULL_PROPOSAL_STAGES: readonly StageType[] = [
  "PROPOSAL_CREATED",
  "VOTING_ACTIVE",
  "PROPOSAL_QUEUED",
  ...COMMON_TIMELOCK_STAGES,
] as const;

/** Timelock-only stages (direct timelock entry) */
const TIMELOCK_ONLY_STAGES: readonly StageType[] = COMMON_TIMELOCK_STAGES;

/** Election stages (full election lifecycle) */
const ELECTION_STAGES: readonly StageType[] = [
  "CREATE_ELECTION",
  "NOMINEE_ELECTION",
  "NOMINEE_VETTING",
  "MEMBER_ELECTION",
  ...COMMON_TIMELOCK_STAGES,
] as const;

/**
 * Tracking path types for stage initialization
 */
export type TrackingPath = "governor" | "timelock" | "election";

/**
 * Get stage types for a tracking path.
 * @param path - The tracking path type: "governor", "timelock", or "election"
 */
export function getStagesForTrackingPath(path: TrackingPath): readonly StageType[] {
  switch (path) {
    case "governor":
      return FULL_PROPOSAL_STAGES;
    case "timelock":
      return TIMELOCK_ONLY_STAGES;
    case "election":
      return ELECTION_STAGES;
  }
}

/**
 * Initialize all stages for a tracking path
 * @param path - The tracking path type: "governor", "timelock", or "election"
 */
/** L1 stages (execute on Ethereum mainnet) */
const L1_STAGES = new Set<StageType>(["L1_TIMELOCK", "RETRYABLE_EXECUTED"]);

/** Get chain for a stage type (L1 stages run on ethereum, others on arb1) */
export const getChainForStage = (type: StageType): Chain =>
  L1_STAGES.has(type) ? "ethereum" : "arb1";

export function initializeStagesForTrackingPath(path: TrackingPath): TrackedStage[] {
  return getStagesForTrackingPath(path).map((type) =>
    createStage(type, getChainForStage(type), "NOT_STARTED")
  );
}

// ============================================================================
// Modular Caching: Stage Splitting
// ============================================================================

/** Timelock path stages as a Set (derived from COMMON_TIMELOCK_STAGES) */
const TIMELOCK_PATH_STAGES: ReadonlySet<StageType> = new Set(COMMON_TIMELOCK_STAGES);

/**
 * Check if a stage type is part of the timelock path (for modular caching).
 * Includes all stages after proposal/election execution: L2_TIMELOCK → RETRYABLE_EXECUTED
 */
export function isTimelockPathStage(type: StageType): boolean {
  return TIMELOCK_PATH_STAGES.has(type);
}

/**
 * Split stages into parent and timelock stages for modular caching.
 *
 * Parent stages:
 * - Governor: PROPOSAL_CREATED, VOTING_ACTIVE, PROPOSAL_QUEUED
 * - Election: CREATE_ELECTION, NOMINEE_ELECTION, NOMINEE_VETTING, MEMBER_ELECTION
 *
 * Timelock stages: L2_TIMELOCK, L2_TO_L1_MESSAGE, L1_TIMELOCK, RETRYABLE_EXECUTED
 */
export function splitStages(stages: TrackedStage[]): {
  parentStages: TrackedStage[];
  timelockStages: TrackedStage[];
} {
  const parentStages = stages.filter((s) => !isTimelockPathStage(s.type));
  const timelockStages = stages.filter((s) => isTimelockPathStage(s.type));
  return { parentStages, timelockStages };
}

/**
 * Canonical stage ordering for normalization.
 * Matches the natural flow: election/governor → timelock path.
 */
const STAGE_ORDER: Record<StageType, number> = {
  // Election path
  CREATE_ELECTION: 0,
  NOMINEE_ELECTION: 1,
  NOMINEE_VETTING: 2,
  MEMBER_ELECTION: 3,
  // Governor path
  PROPOSAL_CREATED: 10,
  VOTING_ACTIVE: 11,
  PROPOSAL_QUEUED: 12,
  // Shared timelock path
  L2_TIMELOCK: 20,
  L2_TO_L1_MESSAGE: 21,
  L1_TIMELOCK: 22,
  RETRYABLE_EXECUTED: 23,
};

/**
 * Merge stages from different sources into a single array.
 *
 * Useful for combining stages from a governor proposal checkpoint
 * with its linked timelock checkpoint into a unified timeline.
 *
 * When duplicates exist (same type), prefers the stage with more progress:
 * 1. Higher status priority (COMPLETED > READY > PENDING > NOT_STARTED)
 * 2. More transactions recorded
 *
 * @param primaryStages - Primary stage array (typically from governor/election)
 * @param secondaryStages - Secondary stages to merge (typically from timelock)
 * @returns Merged array with duplicates resolved
 */
export function mergeStages(
  primaryStages: TrackedStage[],
  secondaryStages: TrackedStage[]
): TrackedStage[] {
  const STATUS_PRIORITY: Record<StageStatus, number> = {
    COMPLETED: 5,
    FAILED: 4,
    CANCELED: 4,
    READY: 3,
    PENDING: 2,
    SKIPPED: 1,
    NOT_STARTED: 0,
  };

  const stageMap = new Map<StageType, TrackedStage>();

  // Add primary stages first
  for (const stage of primaryStages) {
    stageMap.set(stage.type, stage);
  }

  // Merge secondary stages, keeping the one with more progress
  for (const stage of secondaryStages) {
    const existing = stageMap.get(stage.type);
    if (!existing) {
      stageMap.set(stage.type, stage);
      continue;
    }

    const existingPriority = STATUS_PRIORITY[existing.status];
    const newPriority = STATUS_PRIORITY[stage.status];

    // Prefer higher status, or more transactions if same status
    if (
      newPriority > existingPriority ||
      (newPriority === existingPriority && stage.transactions.length > existing.transactions.length)
    ) {
      stageMap.set(stage.type, stage);
    }
  }

  return Array.from(stageMap.values());
}

/**
 * Normalize stages into canonical pipeline order.
 *
 * Sorts stages by their natural execution order in the governance pipeline.
 * Useful after merging stages from multiple sources.
 *
 * @param stages - Array of stages in any order
 * @returns Stages sorted in canonical order
 */
export function normalizeTimeline(stages: TrackedStage[]): TrackedStage[] {
  return [...stages].sort((a, b) => STAGE_ORDER[a.type] - STAGE_ORDER[b.type]);
}

/**
 * Check if stages have any timelock progress (for determining if we need linked checkpoint).
 * Returns true if any timelock path stage has been started.
 */
export function hasTimelockProgress(stages: TrackedStage[]): boolean {
  return stages.some((s) => isTimelockPathStage(s.type) && s.status !== "NOT_STARTED");
}

/**
 * Find a stage by type in a list of stages
 */
export function findStage(stages: TrackedStage[], type: StageType): TrackedStage | undefined {
  return stages.find((s) => s.type === type);
}

/**
 * Update a stage in a list of stages
 */
export function updateStageInList(
  stages: TrackedStage[],
  updatedStage: TrackedStage
): TrackedStage[] {
  return stages.map((s) => (s.type === updatedStage.type ? updatedStage : s));
}

// ============================================================================
// Section 3: Stage Querying and Status
// ============================================================================

/**
 * Check if status is terminal (COMPLETED, SKIPPED, or FAILED)
 */
export function isStageTerminal(status: StageStatus | undefined): boolean {
  return status === "COMPLETED" || status === "SKIPPED" || status === "FAILED";
}

/**
 * Check if status represents successful completion (COMPLETED or SKIPPED)
 */
export function isStageSuccess(status: StageStatus | undefined): boolean {
  return status === "COMPLETED" || status === "SKIPPED";
}

/**
 * Get the current active stage (first non-completed stage)
 */
export function getCurrentStage(stages: TrackedStage[]): TrackedStage | null {
  for (const stage of stages) {
    if (!isStageTerminal(stage.status)) {
      return stage;
    }
  }
  return null;
}

/**
 * Check if all stages are complete
 */
export function areAllStagesComplete(stages: TrackedStage[]): boolean {
  return stages.every((s) => isStageTerminal(s.status));
}

/**
 * Find first READY stage that's executable
 */
export function findExecutableStage(stages: TrackedStage[]): TrackedStage | null {
  return stages.find((s) => s.status === "READY" && s.executable === true) ?? null;
}

/**
 * Find all READY executable stages
 */
export function findAllExecutableStages(stages: TrackedStage[]): TrackedStage[] {
  return stages.filter((s) => s.status === "READY" && s.executable === true);
}

/**
 * Check if a tracking result has any stage ready for execution.
 *
 * This is a convenience wrapper around findExecutableStage() that returns
 * a boolean, useful for filtering or conditional logic.
 *
 * @param stages - Array of tracked stages (typically from TrackingResult.stages)
 * @returns true if any stage is ready for execution
 */
export function needsAction(stages: TrackedStage[]): boolean {
  return findExecutableStage(stages) !== null;
}

/**
 * Get summary of stage statuses (single pass)
 */
export function getTrackingStatusSummary(stages: TrackedStage[]): {
  total: number;
  completed: number;
  pending: number;
  ready: number;
  failed: number;
  skipped: number;
} {
  const counts = { completed: 0, pending: 0, ready: 0, failed: 0, skipped: 0 };
  const statusKey: Record<string, keyof typeof counts> = {
    COMPLETED: "completed",
    PENDING: "pending",
    READY: "ready",
    FAILED: "failed",
    SKIPPED: "skipped",
  };
  for (const { status } of stages) {
    const key = statusKey[status];
    if (key) counts[key]++;
  }
  return { total: stages.length, ...counts };
}

/**
 * Lifecycle phase representing where a proposal or timelock operation is now.
 *
 * Phases describe what's currently happening:
 * - `voting` - Active voting period
 * - `queued` - Passed voting, entering timelock execution
 * - `l2_delay` - Waiting for L2 timelock delay
 * - `bridging` - L2→L1 message in transit
 * - `l1_delay` - Waiting for L1 timelock delay
 * - `finalizing` - Retryable tickets pending execution
 * - `executed` - Complete
 * - `failed` - Failed at some stage
 * - `unknown` - Cannot determine phase
 */
export type LifecyclePhase =
  | "voting"
  | "queued"
  | "l2_delay"
  | "bridging"
  | "l1_delay"
  | "finalizing"
  | "executed"
  | "failed"
  | "unknown";

/**
 * Get the current lifecycle phase from tracked stages.
 *
 * @param stages - Array of tracked stages
 * @returns The current lifecycle phase
 *
 * @example
 * ```typescript
 * const phase = getLifecyclePhase(result.stages);
 * if (phase === "l1_delay") {
 *   console.log("Waiting for L1 timelock delay...");
 * }
 * ```
 */
export function getLifecyclePhase(stages: TrackedStage[]): LifecyclePhase {
  if (stages.length === 0) return "unknown";

  if (stages.some((s) => s.status === "FAILED")) return "failed";
  if (areAllStagesComplete(stages)) return "executed";

  const stageMap = new Map(stages.map((s) => [s.type, s]));
  const isComplete = (type: StageType) => isStageSuccess(stageMap.get(type)?.status);
  const isWaiting = (type: StageType) => {
    const status = stageMap.get(type)?.status;
    return status === "PENDING" || status === "READY" || status === "NOT_STARTED";
  };

  // Governor path
  if (stageMap.has("VOTING_ACTIVE") && isWaiting("VOTING_ACTIVE")) return "voting";
  if (stageMap.has("PROPOSAL_QUEUED") && isWaiting("PROPOSAL_QUEUED")) return "queued";

  // Timelock path
  if (stageMap.has("L2_TIMELOCK") && isWaiting("L2_TIMELOCK")) return "l2_delay";
  if (stageMap.has("L2_TO_L1_MESSAGE") && isWaiting("L2_TO_L1_MESSAGE")) return "bridging";
  if (stageMap.has("L1_TIMELOCK") && isWaiting("L1_TIMELOCK")) return "l1_delay";
  if (stageMap.has("RETRYABLE_EXECUTED") && isWaiting("RETRYABLE_EXECUTED")) return "finalizing";

  // L2-only path: L2 timelock complete, remaining stages skipped
  if (isComplete("L2_TIMELOCK") && stageMap.get("L2_TO_L1_MESSAGE")?.status === "SKIPPED") {
    return "executed";
  }

  return "unknown";
}

/**
 * Extract the operationId from tracked stages.
 *
 * The operationId links a governor proposal to its timelock operation.
 * It can be found in PROPOSAL_QUEUED or L2_TIMELOCK stages.
 *
 * @param stages - Array of tracked stages
 * @returns The operationId if found, undefined otherwise
 */
export function extractOperationId(stages: TrackedStage[]): string | undefined {
  // Check stages that contain operationId (PROPOSAL_QUEUED is most common)
  for (const stage of stages) {
    if (stage.type === "PROPOSAL_QUEUED" || stage.type === "L2_TIMELOCK") {
      const opId = stage.data.operationId;
      if (typeof opId === "string" && opId.length > 0) {
        return opId;
      }
    }
  }
  return undefined;
}

// ============================================================================
// Section 4: Governance Logic
// ============================================================================

/**
 * Check if a proposal is Constitutional (requires L1 round-trip).
 *
 * Constitutional proposals (from Constitutional Governor) go through:
 * L2 Timelock (8 days) → L2→L1 Message → L1 Timelock (3 days) → Retryables
 *
 * Non-Constitutional proposals (from Non-Constitutional Governor) are L2-only:
 * L2 Timelock (3 days) → L2 Execution
 *
 * Also works with timelock addresses for direct timelock entry.
 *
 * @see https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal
 */
export function isConstitutional(governorOrTimelockAddress: string): boolean {
  return isAddressIn(governorOrTimelockAddress, [
    ADDRESSES.CONSTITUTIONAL_GOVERNOR,
    ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  ]);
}

/**
 * Derive the OZ Governor `ProposalState` from a list of tracked stages.
 *
 * The `VOTING_ACTIVE` stage captures `proposalState` as a snapshot when voting
 * ends — so it freezes at `"Queued"` once the proposal is queued and never
 * advances to `"Executed"` even after the timelock finishes. This helper
 * supersedes that snapshot for post-voting progression by reading the actual
 * stage statuses.
 *
 * The caller should pass the merged stage set (parent + linked timelock) so
 * that the full lifecycle is visible.
 *
 * @param stages - Merged tracked stages (parent + any linked timelock stages)
 * @param fallback - State to return when stages can't determine the phase yet
 *                   (typically the voting snapshot). Used for pre-queue phases
 *                   (`Pending` / `Active`) which live only in the voting data.
 * @returns The best-known `ProposalState` or the fallback.
 */
export function deriveProposalState(
  stages: TrackedStage[],
  fallback?: ProposalState
): ProposalState | undefined {
  if (stages.length === 0) return fallback;

  const byType = new Map(stages.map((s) => [s.type, s]));
  const statusOf = (t: StageType) => byType.get(t)?.status;
  const isSuccess = (t: StageType) => isStageSuccess(statusOf(t));

  if (isSuccess("RETRYABLE_EXECUTED")) return "Executed";
  if (isSuccess("L2_TIMELOCK") && statusOf("L2_TO_L1_MESSAGE") === "SKIPPED") return "Executed";
  if (stages.some((s) => s.status === "CANCELED")) return "Canceled";
  if (statusOf("VOTING_ACTIVE") === "FAILED") return "Defeated";
  if (isSuccess("PROPOSAL_QUEUED")) return "Queued";
  if (isSuccess("VOTING_ACTIVE")) return "Succeeded";

  return fallback;
}

/** Timelock stage types (consolidated stages that require execution) */
export const TIMELOCK_STAGE_TYPES = ["L2_TIMELOCK", "L1_TIMELOCK"] as const;

/**
 * Check if a stage type is a timelock stage
 */
export function isTimelockStage(type: StageType | string): boolean {
  return (TIMELOCK_STAGE_TYPES as readonly string[]).includes(type);
}

// ============================================================================
// Section 5: Block & Timing Utilities
// ============================================================================

// Block timestamp cache - timestamps are immutable so cache indefinitely
// Uses WeakMap keyed by provider so cache is GC'd when provider is dereferenced
const blockTimestampCache = new WeakMap<ethers.providers.Provider, Map<number, number>>();

/**
 * Get block timestamp from provider with caching.
 * Block timestamps are immutable, so we cache them indefinitely to avoid redundant RPC calls.
 */
export async function getBlockTimestamp(
  blockNumber: number,
  provider: ethers.providers.Provider
): Promise<number> {
  let providerCache = blockTimestampCache.get(provider);
  if (!providerCache) {
    providerCache = new Map();
    blockTimestampCache.set(provider, providerCache);
  }

  const cached = providerCache.get(blockNumber);
  if (cached !== undefined) {
    return cached;
  }

  const block = await queryWithRetry(() => provider.getBlock(blockNumber));
  if (!block) {
    throw new Error(`Block ${blockNumber} not found`);
  }

  providerCache.set(blockNumber, block.timestamp);
  return block.timestamp;
}

/**
 * Calculate ETA from CallScheduled event data
 *
 * ETA = block timestamp + delay seconds
 * This works even when operation is done (contract returns _DONE_TIMESTAMP=1)
 */
export async function calculateEtaFromScheduledData(
  blockNumber: number,
  delaySeconds: number,
  provider: ethers.providers.Provider
): Promise<number> {
  const timestamp = await getBlockTimestamp(blockNumber, provider);
  return timestamp + delaySeconds;
}

// ============================================================================
// Section 6: Preparation Helpers
// ============================================================================

/**
 * Create a failed PrepareResult with an error message.
 * Reduces boilerplate for the common pattern: { success: false, error: "..." }
 */
export function failPrepare(error: string): PrepareResult {
  return { success: false, error };
}

/**
 * Check if a timelock operation is ready for execution.
 * Returns null if ready, or an error result if not ready or already executed.
 */
export async function checkOperationReady(
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider
): Promise<PrepareResult | null> {
  // Batch both state checks into a single RPC request
  const results = await multicall(provider, [
    buildCallInput<boolean>(timelockAddress, timelockInterface, "isOperationReady", [operationId]),
    buildCallInput<boolean>(timelockAddress, timelockInterface, "isOperationDone", [operationId]),
  ]);

  const isReady = (results[0] as boolean | undefined) ?? false;
  const isDone = (results[1] as boolean | undefined) ?? false;

  if (isReady) return null; // Ready - no error
  if (isDone) {
    return failPrepare("Operation already executed");
  }
  return failPrepare("Operation is not ready for execution");
}

// ============================================================================
// Section 7: Timelock Execution Helpers
// ============================================================================

/** Execution payload data for timelock operations. */
export interface TimelockExecutionPayload {
  timelockAddress: string;
  operationId: string;
  callScheduledData: CallScheduledData[];
  isSecurityCouncilOperation?: boolean;
  securityCouncilMembers?: string[];
  securityCouncilNonce?: string;
}

/**
 * Extract timelock execution payload from a stage.
 */
export function createTimelockStageData(stage: TrackedStage): TimelockExecutionPayload | null {
  let stageData: TimelockStageData | null = null;
  for (const stageType of TIMELOCK_STAGE_TYPES) {
    stageData = getStageData(stage, stageType);
    if (stageData) break;
  }

  if (!stageData?.timelockAddress || !stageData?.operationId) {
    return null;
  }

  if (!stageData.callScheduledData?.length) {
    return null;
  }

  const callScheduledData = deserializeCallScheduledDataArray(stageData.callScheduledData);

  const payload: TimelockExecutionPayload = {
    timelockAddress: stageData.timelockAddress,
    operationId: stageData.operationId,
    callScheduledData,
  };

  if (stageData.isSecurityCouncilOperation) {
    payload.isSecurityCouncilOperation = true;
    payload.securityCouncilMembers = stageData.securityCouncilMembers;
    payload.securityCouncilNonce = stageData.securityCouncilNonce;
  }

  return payload;
}

/** Collect all CallScheduledData from a timelock state. */
export function collectAllScheduledData(timelockState: TimelockState): CallScheduledData[] {
  return (
    timelockState.allScheduledData ??
    (timelockState.scheduledData ? [timelockState.scheduledData] : [])
  );
}

/** Calculate ETA for a timelock operation. */
export async function calculateTimelockEta(
  timelockState: TimelockState,
  operationState: OperationState,
  provider: ethers.providers.Provider
): Promise<number | undefined> {
  if (timelockState.scheduledData) {
    return calculateEtaFromScheduledData(
      timelockState.scheduledData.blockNumber,
      timelockState.scheduledData.delay.toNumber(),
      provider
    );
  }
  const contractTimestamp = operationState.timestamp.toNumber();
  return !operationState.isDone && contractTimestamp > 1 ? contractTimestamp : undefined;
}

/** Build serialized execution payload data for stage storage. */
export function buildExecutionPayloadData(
  timelockAddress: string,
  operationId: string,
  allScheduledData: CallScheduledData[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = { timelockAddress, operationId };
  if (allScheduledData.length > 0) {
    payload.callScheduledData = serializeCallScheduledDataArray(allScheduledData);
  }
  return payload;
}

// ============================================================================
// Section 8: Validation Helpers
// ============================================================================

export interface PrepareValidationOptions {
  prepareCompleted?: boolean;
  expectedTypes?: StageType[];
}

/** Validate stage for preparation. Returns error or null if valid. */
export function validateStageForPrepare(
  stage: TrackedStage,
  options: PrepareValidationOptions = {}
): PrepareResult | null {
  if (!options.prepareCompleted && stage.status !== "READY") {
    return failPrepare(`Stage is not ready. Current status: ${stage.status}`);
  }
  if (options.expectedTypes?.length && !options.expectedTypes.includes(stage.type)) {
    return failPrepare(
      `Unexpected stage type: ${stage.type}. Expected: ${options.expectedTypes.join(", ")}`
    );
  }
  return null;
}

export interface BulkPrepareResult<T extends Chain = Chain> {
  total: number;
  results: PrepareResult[];
  targetChain: T;
}

export interface SimpleBulkResult {
  total: number;
  results: PrepareResult[];
}

export function bulkPrepareError<T extends Chain>(
  error: string,
  targetChain: T
): BulkPrepareResult<T> {
  return { total: 0, results: [{ success: false, error }], targetChain };
}

export function simpleBulkError(error: string): SimpleBulkResult {
  return { total: 0, results: [{ success: false, error }] };
}

export function validateStageForBulkPrepare<T extends Chain>(
  stage: TrackedStage,
  targetChain: T,
  options: PrepareValidationOptions = {}
): BulkPrepareResult<T> | null {
  const error = validateStageForPrepare(stage, options);
  return error ? { total: 0, results: [error], targetChain } : null;
}

export function validateStageForSimpleBulk(
  stage: TrackedStage,
  options: PrepareValidationOptions = {}
): SimpleBulkResult | null {
  const error = validateStageForPrepare(stage, options);
  return error ? { total: 0, results: [error] } : null;
}

// ============================================================================
// Section 9: Execution Search Helper
// ============================================================================

/** Search for timelock execution event and complete stage. */
export async function searchAndCompleteTimelockExecution(
  stage: TrackedStage,
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider,
  chain: Chain,
  fromBlock: number,
  toBlock?: number,
  queueTimestamp?: number
): Promise<{ stage: TrackedStage; executionTxHash: string | null; executionBlock: number | null }> {
  const event = await findCallExecutedEvent(timelockAddress, operationId, provider, {
    startBlock: fromBlock,
    endBlock: toBlock,
  });

  const builder = new StageBuilder(stage.type, stage.chain)
    .data(stage.data)
    .transactions(stage.transactions);

  if (stage.timing) builder.timing(stage.timing);

  if (event) {
    const execTimestamp = await getBlockTimestamp(event.blockNumber, provider);
    const chainId = chainToChainId(chain);
    builder
      .status("COMPLETED")
      .tx(event.txHash, event.blockNumber, chain, chainId, {
        timestamp: execTimestamp,
        description: "executed",
      })
      .timing({ startedAt: queueTimestamp ?? execTimestamp })
      .data({ operationId });
    return {
      stage: builder.build(),
      executionTxHash: event.txHash,
      executionBlock: event.blockNumber,
    };
  }

  return {
    stage: builder
      .status("COMPLETED")
      .data({ operationId, note: "Execution confirmed by state, event not found" })
      .build(),
    executionTxHash: null,
    executionBlock: null,
  };
}
