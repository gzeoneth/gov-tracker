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
  const chainId = chainToChainId(chain) ?? 0;
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

/** Common timelock stages shared by all paths */
const COMMON_TIMELOCK_STAGES: StageType[] = [
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
];

/** Full proposal stages (from governor proposal) */
const FULL_PROPOSAL_STAGES: StageType[] = [
  "PROPOSAL_CREATED",
  "VOTING_ACTIVE",
  "PROPOSAL_QUEUED",
  ...COMMON_TIMELOCK_STAGES,
];

/** Timelock-only stages (direct timelock entry) */
const TIMELOCK_ONLY_STAGES: StageType[] = COMMON_TIMELOCK_STAGES;

/** Election stages (full election lifecycle) */
const ELECTION_STAGES: StageType[] = [
  "CREATE_ELECTION",
  "NOMINEE_ELECTION",
  "NOMINEE_VETTING",
  "MEMBER_ELECTION",
  ...COMMON_TIMELOCK_STAGES,
];

/**
 * Tracking path types for stage initialization
 */
export type TrackingPath = "governor" | "timelock" | "election";

/**
 * Get stage types for a tracking path.
 * @param path - The tracking path type: "governor", "timelock", or "election"
 */
export function getStagesForTrackingPath(path: TrackingPath): StageType[] {
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

/** All timelock path stages for modular caching (full path, not just executable) */
const TIMELOCK_PATH_STAGES: Set<StageType> = new Set([
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
]);

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
 * Get the current active stage (first non-completed stage)
 */
export function getCurrentStage(stages: TrackedStage[]): TrackedStage | null {
  for (const stage of stages) {
    if (stage.status !== "COMPLETED" && stage.status !== "SKIPPED" && stage.status !== "FAILED") {
      return stage;
    }
  }
  return null;
}

/**
 * Check if all stages are complete
 */
export function areAllStagesComplete(stages: TrackedStage[]): boolean {
  return stages.every(
    (s) => s.status === "COMPLETED" || s.status === "SKIPPED" || s.status === "FAILED"
  );
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
  let completed = 0,
    pending = 0,
    ready = 0,
    failed = 0,
    skipped = 0;

  for (const stage of stages) {
    switch (stage.status) {
      case "COMPLETED":
        completed++;
        break;
      case "PENDING":
        pending++;
        break;
      case "READY":
        ready++;
        break;
      case "FAILED":
        failed++;
        break;
      case "SKIPPED":
        skipped++;
        break;
    }
  }

  return { total: stages.length, completed, pending, ready, failed, skipped };
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

  const isReady = results[0] as boolean;
  const isDone = results[1] as boolean;

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
    const chainId = chainToChainId(chain) ?? 0;
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
