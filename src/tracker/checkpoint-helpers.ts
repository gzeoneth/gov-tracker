/**
 * Checkpoint Helper Utilities
 *
 * Shared functions for working with TrackingCheckpoint objects
 * across proposals, timelocks, and elections.
 */

import type { TrackingCheckpoint, TrackerStats } from "../types";
import { areAllStagesComplete } from "../stages/utils";
import { isElectionGovernor } from "../constants";

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
 * Gas errors don't increment the count (transient)
 */
export function incrementErrorCount(currentCount: number, error: Error | string): number {
  const isGasError =
    error instanceof Error
      ? error.message.includes("insufficient funds") ||
        error.message.includes("gas required exceeds allowance")
      : typeof error === "string" &&
        (error.includes("insufficient funds") || error.includes("gas required exceeds allowance"));

  return isGasError ? currentCount : currentCount + 1;
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
export const WATERMARKS_KEY = "discovery:watermarks";

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
