/**
 * Checkpoint Helper Utilities
 *
 * Shared functions for working with TrackingCheckpoint objects
 * across proposals, timelocks, and elections.
 */

import type { TrackingCheckpoint, TrackerStats } from "../types";
import { areAllStagesComplete } from "../stages/utils";
import { isElectionGovernor } from "../constants";
import { isGasEstimationError } from "../utils/rpc-utils";

export const DEFAULT_ERROR_THRESHOLD = 5;

/**
 * Checkpoint metadata type (matches TrackingCheckpoint.metadata)
 */
export interface CheckpointMetadata {
  errorCount: number;
  lastTrackedAt: number;
}

/**
 * Create standard checkpoint metadata
 */
export function createCheckpointMetadata(errorCount = 0): CheckpointMetadata {
  return {
    errorCount,
    lastTrackedAt: Date.now(),
  };
}

/**
 * Increment error count for retry logic
 * Gas estimation errors don't increment the count (transient)
 * Uses centralized isGasEstimationError from rpc-utils for consistency
 */
export function incrementErrorCount(currentCount: number, error: Error | string): number {
  return isGasEstimationError(error) ? currentCount : currentCount + 1;
}

/**
 * Check if checkpoint has too many errors to continue tracking
 */
export function isCheckpointErrored(
  checkpoint: TrackingCheckpoint,
  threshold = DEFAULT_ERROR_THRESHOLD
): boolean {
  const errorCount = checkpoint.metadata?.errorCount ?? 0;
  return errorCount >= threshold;
}

/**
 * Check if checkpoint represents a completed tracking
 * Works for both proposal/timelock (completedStages) and election (phase) checkpoints
 */
export function isCheckpointComplete(checkpoint: TrackingCheckpoint): boolean {
  const inputType = checkpoint.input.type;

  if (inputType === "election") {
    const electionStatus = checkpoint.cachedData?.electionStatus as { phase?: string } | undefined;
    return electionStatus?.phase === "COMPLETED";
  }

  if (inputType === "discovery") {
    return false;
  }

  const stages = checkpoint.cachedData?.completedStages ?? [];
  return stages.length > 0 && areAllStagesComplete(stages);
}

/**
 * Get the error count from a checkpoint
 */
export function getCheckpointErrorCount(checkpoint: TrackingCheckpoint): number {
  return checkpoint.metadata?.errorCount ?? 0;
}

/**
 * Cache key format utilities
 */
export const ELECTION_KEY_PREFIX = "election:";
export const TX_KEY_PREFIX = "tx:";
export const DISCOVERY_KEY_PREFIX = "discovery:";

export function electionCacheKey(electionIndex: number): string {
  return `${ELECTION_KEY_PREFIX}${electionIndex}`;
}

export function txHashCacheKey(txHash: string): string {
  return `${TX_KEY_PREFIX}${txHash.toLowerCase()}`;
}

export function isElectionKey(key: string): boolean {
  return key.startsWith(ELECTION_KEY_PREFIX);
}

export function isTxKey(key: string): boolean {
  return key.startsWith(TX_KEY_PREFIX);
}

export function isDiscoveryKey(key: string): boolean {
  return key.startsWith(DISCOVERY_KEY_PREFIX);
}

/**
 * Extract election index from cache key
 */
export function parseElectionKey(key: string): number | null {
  if (!isElectionKey(key)) return null;
  const index = parseInt(key.slice(ELECTION_KEY_PREFIX.length), 10);
  return isNaN(index) ? null : index;
}

/**
 * Cache key for timelock operations with specific operationId.
 * Format: tx:{txHash}:op:{operationId}
 *
 * This allows multiple operations from the same transaction to have separate checkpoints.
 */
export function timelockOpCacheKey(txHash: string, operationId: string): string {
  return `${TX_KEY_PREFIX}${txHash.toLowerCase()}:op:${operationId.toLowerCase()}`;
}

/**
 * Check if a cache key is a timelock operation key (contains :op:)
 */
export function isTimelockOpKey(key: string): boolean {
  return key.startsWith(TX_KEY_PREFIX) && key.includes(":op:");
}

/**
 * Parse txHash and operationId from a timelock operation cache key
 */
export function parseTimelockOpKey(key: string): { txHash: string; operationId: string } | null {
  const match = key.match(/^tx:([^:]+):op:(.+)$/);
  return match ? { txHash: match[1], operationId: match[2] } : null;
}

/**
 * Trim checkpoint stages from a specific index for re-tracking.
 *
 * Creates a new checkpoint with stages truncated at stageIndex, resetting
 * the tracking position to allow re-processing from that point.
 *
 * @param checkpoint - The checkpoint to trim
 * @param stageIndex - Index to trim from (0 = keep no stages, 1 = keep first stage, etc.)
 * @returns New checkpoint with trimmed stages and updated metadata
 *
 * @example
 * ```typescript
 * // Re-track from PROPOSAL_QUEUED (index 2)
 * const trimmed = trimFromStage(checkpoint, 2);
 * const results = await tracker.trackByTxHash(txHash, { checkpoint: trimmed });
 * ```
 */
export function trimFromStage(
  checkpoint: TrackingCheckpoint,
  stageIndex: number
): TrackingCheckpoint {
  const stages = checkpoint.cachedData?.completedStages ?? [];
  const trimmedStages = stages.slice(0, stageIndex);
  const lastStage = trimmedStages[trimmedStages.length - 1];

  return {
    ...checkpoint,
    lastProcessedStage: lastStage?.type ?? null,
    cachedData: {
      ...checkpoint.cachedData,
      completedStages: trimmedStages,
    },
    metadata: {
      ...checkpoint.metadata,
      errorCount: 0,
      lastTrackedAt: Date.now(),
      timelockOpKey: stageIndex <= 2 ? undefined : checkpoint.metadata?.timelockOpKey,
    },
  };
}

/**
 * Compute aggregated stats from loaded checkpoints.
 *
 * This is the single source of truth for stats computation. Used by:
 * - tracker/query.ts::getStats() (loads from cache adapter)
 * - cli/lib/cli.ts (loads from file)
 * - useCache.ts (already has loaded data)
 */
export function computeCacheStats(
  checkpoints: Map<string, TrackingCheckpoint>,
  elections: Map<number, TrackingCheckpoint>,
  maxErrorCount: number = DEFAULT_ERROR_THRESHOLD
): TrackerStats {
  let proposalTotal = 0,
    proposalComplete = 0,
    proposalActive = 0,
    proposalErrored = 0;
  let timelockTotal = 0,
    timelockComplete = 0,
    timelockActive = 0,
    timelockErrored = 0;
  let electionTotal = 0,
    electionComplete = 0;

  for (const checkpoint of checkpoints.values()) {
    const complete = isCheckpointComplete(checkpoint);
    const errored = isCheckpointErrored(checkpoint, maxErrorCount);
    const inputType = checkpoint.input.type;

    if (inputType === "governor") {
      if (
        checkpoint.input.governorAddress &&
        isElectionGovernor(checkpoint.input.governorAddress)
      ) {
        continue;
      }
      proposalTotal++;
      if (complete) proposalComplete++;
      else if (errored) proposalErrored++;
      else proposalActive++;
    } else if (inputType === "election") {
      electionTotal++;
      if (complete) electionComplete++;
    } else if (inputType === "timelock") {
      timelockTotal++;
      if (complete) timelockComplete++;
      else if (errored) timelockErrored++;
      else timelockActive++;
    }
  }

  for (const checkpoint of elections.values()) {
    electionTotal++;
    if (isCheckpointComplete(checkpoint)) {
      electionComplete++;
    }
  }

  return {
    total: checkpoints.size + elections.size,
    proposals: {
      total: proposalTotal,
      complete: proposalComplete,
      active: proposalActive,
      errored: proposalErrored,
    },
    timelocks: {
      total: timelockTotal,
      complete: timelockComplete,
      active: timelockActive,
      errored: timelockErrored,
    },
    elections: {
      total: electionTotal,
      complete: electionComplete,
    },
  };
}
