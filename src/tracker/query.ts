/**
 * Tracker Query Module
 *
 * Provides checkpoint query and statistics operations.
 * Includes filtering, aggregation, and cache introspection.
 */

import { TrackingCheckpoint, TrackerStats, CacheAdapter } from "../types";
import { areAllStagesComplete } from "../stages/utils";
import { isElectionGovernor, TIMING } from "../constants";

/**
 * List all checkpoint keys in the cache.
 * @param cache - Cache adapter to query
 */
export async function listCheckpointKeys(cache: CacheAdapter | undefined): Promise<string[]> {
  if (!cache) return [];
  const allKeys = await cache.keys();
  const keys = Array.from(allKeys as Iterable<string>);
  // All tracking checkpoints use tx: prefix
  return keys.filter((k) => k.startsWith("tx:"));
}

/**
 * Get a specific checkpoint from cache by key.
 */
export async function getCheckpoint(
  cache: CacheAdapter | undefined,
  key: string
): Promise<TrackingCheckpoint | null> {
  if (!cache) return null;
  return await cache.get<TrackingCheckpoint>(key);
}

/**
 * Get all checkpoints from cache.
 */
export async function getAllCheckpoints(
  cache: CacheAdapter | undefined
): Promise<Map<string, TrackingCheckpoint>> {
  const map = new Map<string, TrackingCheckpoint>();
  const keys = await listCheckpointKeys(cache);
  for (const key of keys) {
    const checkpoint = await getCheckpoint(cache, key);
    if (checkpoint) {
      map.set(key, checkpoint);
    }
  }
  return map;
}

/**
 * Query incomplete checkpoints that should be re-tracked.
 *
 * @param cache - Cache adapter to query
 * @param options.maxAgeDays - Skip items older than this (default: 60)
 * @param options.maxErrorCount - Skip items with more consecutive errors (default: 5)
 */
export async function queryIncompleteCheckpoints(
  cache: CacheAdapter | undefined,
  options: {
    maxAgeDays?: number;
    maxErrorCount?: number;
  } = {}
): Promise<Array<{ key: string; checkpoint: TrackingCheckpoint }>> {
  const maxAgeDays = options.maxAgeDays ?? 60;
  const maxErrorCount = options.maxErrorCount ?? 5;
  const maxAgeMs = maxAgeDays * TIMING.MS_PER_DAY;
  const now = Date.now();

  const results: Array<{ key: string; checkpoint: TrackingCheckpoint }> = [];
  const keys = await listCheckpointKeys(cache);

  for (const key of keys) {
    const checkpoint = await getCheckpoint(cache, key);
    if (!checkpoint) continue;

    const errorCount = checkpoint.metadata?.errorCount ?? 0;
    const completedStages = checkpoint.cachedData.completedStages ?? [];

    // Skip if already complete
    if (completedStages.length > 0 && areAllStagesComplete(completedStages)) {
      continue;
    }

    // Skip if voting failed (terminal state)
    const votingStage = completedStages.find((s) => s.type === "VOTING_ACTIVE");
    if (votingStage?.status === "FAILED") {
      continue;
    }

    // Skip if exceeded error threshold
    if (errorCount >= maxErrorCount) {
      continue;
    }

    // Skip if too old
    const createdAt = checkpoint.createdAt ?? 0;
    if (createdAt > 0 && now - createdAt > maxAgeMs) {
      continue;
    }

    results.push({ key, checkpoint });
  }

  return results;
}

/**
 * Get aggregated cache statistics.
 *
 * Provides a summary of all cached proposals, timelock operations, and elections
 * without making any RPC calls. Useful for dashboards and status displays.
 *
 * @param cache - Cache adapter to query
 * @param maxErrorCount - Items with this many or more errors are counted as "errored" (default: 5)
 */
export async function getStats(
  cache: CacheAdapter | undefined,
  maxErrorCount: number = 5
): Promise<TrackerStats> {
  const checkpoints = await getAllCheckpoints(cache);

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

  for (const [, checkpoint] of checkpoints) {
    const completedStages = checkpoint.cachedData?.completedStages ?? [];
    const isComplete = completedStages.length > 0 && areAllStagesComplete(completedStages);
    const errorCount = checkpoint.metadata?.errorCount ?? 0;
    const isErrored = errorCount >= maxErrorCount;
    const inputType = checkpoint.input.type;

    if (inputType === "governor") {
      if (
        checkpoint.input.governorAddress &&
        isElectionGovernor(checkpoint.input.governorAddress)
      ) {
        electionTotal++;
        if (isComplete) electionComplete++;
      } else {
        proposalTotal++;
        if (isComplete) proposalComplete++;
        else if (isErrored) proposalErrored++;
        else proposalActive++;
      }
    } else if (inputType === "timelock") {
      timelockTotal++;
      if (isComplete) timelockComplete++;
      else if (isErrored) timelockErrored++;
      else timelockActive++;
    }
  }

  return {
    total: checkpoints.size,
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
