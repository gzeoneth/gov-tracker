/**
 * Shared utilities for stage tracking
 *
 * Common patterns and helpers used across all stage modules
 */

import { BigNumber, ethers } from "ethers";
import {
  CallScheduledData,
  ChainType,
  PrepareResult,
  SerializedCallScheduledData,
  StageStatus,
  StageType,
  TrackedStage,
} from "../types";
import { TIMELOCK_ABI } from "../abis";
import { ADDRESSES } from "../constants";
import { isAddressIn } from "../utils/chain";
import { queryWithRetry } from "../utils/rpc-utils";

// ============================================================================
// Serialization Utilities
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
// Stage Creation and Management
// ============================================================================

/**
 * Create a new tracked stage with default values
 */
function createStage(
  type: StageType,
  chain: ChainType,
  status: StageStatus = "NOT_STARTED"
): TrackedStage {
  return {
    type,
    status,
    chain,
    transactions: [],
    data: {},
    executable: false,
  };
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
 * Get all stages for a governor path
 *
 * Always returns all 7 stages to ensure consistent stage arrays.
 * For L2-only paths (Treasury Governor), the L2→L1 and L1 stages
 * will be marked as SKIPPED during tracking.
 */
export function getStagesForPath(
  _governorAddress: string,
  includeProposalStages: boolean = true
): StageType[] {
  const proposalStages: StageType[] = includeProposalStages
    ? ["PROPOSAL_CREATED", "VOTING_ACTIVE", "PROPOSAL_QUEUED"]
    : [];

  // Always return all 7 stages - L2-only paths mark extra stages as SKIPPED
  return [
    ...proposalStages,
    "L2_TIMELOCK",
    "L2_TO_L1_MESSAGE",
    "L1_TIMELOCK",
    "RETRYABLE_EXECUTED",
  ];
}

/**
 * Initialize all stages for a path
 */
export function initializeStagesForPath(
  governorAddress: string,
  includeProposalStages: boolean = true
): TrackedStage[] {
  const stageTypes = getStagesForPath(governorAddress, includeProposalStages);

  return stageTypes.map((type) => {
    // L1_TIMELOCK and RETRYABLE_EXECUTED are L1 stages
    // L2_TO_L1_MESSAGE is cross-chain but logically completes on L1
    const chain: ChainType = type === "L1_TIMELOCK" || type === "RETRYABLE_EXECUTED" ? "L1" : "L2";

    return createStage(type, chain, "NOT_STARTED");
  });
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
 * Get block timestamp from provider
 */
export async function getBlockTimestamp(
  blockNumber: number,
  provider: ethers.providers.Provider
): Promise<number> {
  const block = await queryWithRetry(() => provider.getBlock(blockNumber));
  if (!block) {
    throw new Error(`Block ${blockNumber} not found`);
  }
  return block.timestamp;
}

/**
 * Find first READY stage that's executable
 */
export function findExecutableStage(stages: TrackedStage[]): TrackedStage | null {
  return stages.find((s) => s.status === "READY" && s.executable === true) ?? null;
}

/** Timelock stage types (consolidated stages that require execution) */
export const TIMELOCK_STAGE_TYPES = ["L2_TIMELOCK", "L1_TIMELOCK"] as const;

/**
 * Check if a stage type is a timelock stage
 */
export function isTimelockStage(type: StageType | string): boolean {
  return (TIMELOCK_STAGE_TYPES as readonly string[]).includes(type);
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
  const counts = stages.reduce(
    (acc, s) => {
      acc[s.status]++;
      return acc;
    },
    { COMPLETED: 0, PENDING: 0, READY: 0, FAILED: 0, SKIPPED: 0, NOT_STARTED: 0 }
  );

  return {
    total: stages.length,
    completed: counts.COMPLETED,
    pending: counts.PENDING,
    ready: counts.READY,
    failed: counts.FAILED,
    skipped: counts.SKIPPED,
  };
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
  // Check stages that contain operationId (in order of likelihood)
  const stageTypes: StageType[] = ["PROPOSAL_QUEUED", "L2_TIMELOCK"];

  for (const type of stageTypes) {
    const stage = stages.find((s) => s.type === type);
    const opId = stage?.data?.operationId;
    if (typeof opId === "string" && opId.length > 0) {
      return opId;
    }
  }

  return undefined;
}

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
  const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
  const isReady = await queryWithRetry(() => timelock.isOperationReady(operationId));
  if (isReady) return null; // Ready - no error

  const isDone = await queryWithRetry(() => timelock.isOperationDone(operationId));
  if (isDone) {
    return failPrepare("Operation already executed");
  }
  return failPrepare("Operation is not ready for execution");
}
