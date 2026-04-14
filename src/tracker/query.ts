/**
 * Tracker Query Module
 *
 * Provides checkpoint query and statistics operations.
 * Includes filtering, aggregation, and cache introspection.
 */

import { BigNumber } from "ethers";
import { TrackingCheckpoint, TrackerStats, CacheAdapter } from "../types";
import { TIMING } from "../constants";
import {
  isCheckpointComplete,
  isCheckpointErrored,
  isTxKey,
  isElectionKey,
  parseElectionKey,
  computeCacheStats,
} from "./checkpoint-helpers";
import { getHighestScNonce } from "../discovery/security-council";

/**
 * List all checkpoint keys in the cache.
 * Returns keys for both proposals/timelocks (tx:*) and elections (election:*).
 * @param cache - Cache adapter to query
 */
export async function listCheckpointKeys(cache: CacheAdapter | undefined): Promise<string[]> {
  if (!cache) return [];
  const allKeys = await cache.keys();
  const keys = Array.from(allKeys as Iterable<string>);
  return keys.filter((k) => isTxKey(k) || isElectionKey(k));
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
 * Loads checkpoints in parallel for better performance.
 */
export async function getAllCheckpoints(
  cache: CacheAdapter | undefined
): Promise<Map<string, TrackingCheckpoint>> {
  const map = new Map<string, TrackingCheckpoint>();
  const keys = await listCheckpointKeys(cache);

  // Load all checkpoints in parallel
  const checkpoints = await Promise.all(keys.map((key) => getCheckpoint(cache, key)));

  for (let i = 0; i < keys.length; i++) {
    const checkpoint = checkpoints[i];
    if (checkpoint) {
      map.set(keys[i], checkpoint);
    }
  }
  return map;
}

/**
 * Extract SC nonce from a checkpoint's stages if it's an SC operation.
 */
function extractScNonceFromCheckpoint(checkpoint: TrackingCheckpoint): BigNumber | null {
  const stages = checkpoint.cachedData.completedStages ?? [];
  for (const stage of stages) {
    if (stage.type === "L2_TIMELOCK" && stage.data?.isSecurityCouncilOperation) {
      const nonceStr = stage.data.securityCouncilNonce as string | undefined;
      if (nonceStr) {
        return BigNumber.from(nonceStr);
      }
    }
  }
  return null;
}

/**
 * Query incomplete checkpoints that should be re-tracked.
 *
 * Applies multiple filters:
 * - Skips completed checkpoints
 * - Skips checkpoints with failed voting
 * - Skips checkpoints with too many errors
 * - Skips checkpoints older than maxAgeDays
 * - Skips Security Council operations with lower nonces (superseded by higher nonce,
 *   including completed SC operations)
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

  const keys = await listCheckpointKeys(cache);

  // Load all checkpoints in parallel (single pass over cache)
  const checkpointResults = await Promise.all(keys.map((key) => getCheckpoint(cache, key)));

  // Index every checkpoint by key so we can cross-reference linked timelock
  // checkpoints without another cache round-trip.
  const checkpointsByKey = new Map<string, TrackingCheckpoint>();
  for (let i = 0; i < keys.length; i++) {
    const checkpoint = checkpointResults[i];
    if (checkpoint) {
      checkpointsByKey.set(keys[i], checkpoint);
    }
  }

  // Build key-checkpoint pairs for incomplete checkpoints, extract SC nonces from all
  const allScNonces: BigNumber[] = [];
  const incompleteCheckpoints: Array<{
    key: string;
    checkpoint: TrackingCheckpoint;
    scNonce: BigNumber | null;
  }> = [];

  for (const [key, checkpoint] of checkpointsByKey) {
    // Extract SC nonce from all checkpoints (needed for highestScNonce calculation)
    const scNonce = extractScNonceFromCheckpoint(checkpoint);
    if (scNonce) {
      allScNonces.push(scNonce);
    }

    // Only store incomplete checkpoints for filtering
    if (!isCheckpointComplete(checkpoint)) {
      incompleteCheckpoints.push({ key, checkpoint, scNonce });
    }
  }

  const highestScNonce = getHighestScNonce(allScNonces);

  // Filter incomplete checkpoints with SC nonce handling
  const results: Array<{ key: string; checkpoint: TrackingCheckpoint }> = [];

  for (const { key, checkpoint, scNonce } of incompleteCheckpoints) {
    // Skip if voting failed (terminal state)
    const completedStages = checkpoint.cachedData.completedStages ?? [];
    const votingStage = completedStages.find((s) => s.type === "VOTING_ACTIVE");
    if (votingStage?.status === "FAILED") {
      continue;
    }

    // Skip if exceeded error threshold
    if (isCheckpointErrored(checkpoint, maxErrorCount)) {
      continue;
    }

    // Skip if too old
    const createdAt = checkpoint.createdAt ?? 0;
    if (createdAt > 0 && now - createdAt > maxAgeMs) {
      continue;
    }

    // Skip SC operations with lower nonces (superseded by higher nonce)
    if (scNonce && highestScNonce && scNonce.lt(highestScNonce)) {
      continue;
    }

    // Modular parent terminator: a governor parent checkpoint with no timelock
    // stages of its own (post-modular-split) is classified incomplete while
    // PROPOSAL_QUEUED=COMPLETED. In that state the real lifecycle lives in the
    // linked timelock checkpoint referenced via metadata.timelockOpKey. If that
    // linked checkpoint is itself complete, the whole proposal is finished —
    // skip the parent instead of re-tracking it forever on every rebuilder run.
    const timelockOpKey = checkpoint.metadata?.timelockOpKey;
    if (checkpoint.input.type === "governor" && typeof timelockOpKey === "string") {
      const linked = checkpointsByKey.get(timelockOpKey);
      if (linked && isCheckpointComplete(linked)) {
        continue;
      }
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

  const elections = new Map<number, TrackingCheckpoint>();
  for (const [key, checkpoint] of checkpoints) {
    const electionIndex = parseElectionKey(key);
    if (electionIndex !== null) {
      elections.set(electionIndex, checkpoint);
      checkpoints.delete(key);
    }
  }

  return computeCacheStats(checkpoints, elections, maxErrorCount);
}

/**
 * Get the highest Security Council nonce from incomplete checkpoints.
 *
 * Scans all incomplete timelock checkpoints that are Security Council operations
 * and returns the highest nonce found. This is used to determine if lower-nonce
 * SC operations should be skipped (superseded by higher nonce).
 *
 * @param cache - Cache adapter to query
 * @returns The highest SC nonce found, or null if no SC operations exist
 */
export async function getHighestScNonceFromCheckpoints(
  cache: CacheAdapter | undefined
): Promise<BigNumber | null> {
  if (!cache) return null;

  const keys = await listCheckpointKeys(cache);

  // Load all checkpoints in parallel
  const checkpoints = await Promise.all(keys.map((key) => getCheckpoint(cache, key)));

  // Extract SC nonces from incomplete checkpoints
  const nonces: BigNumber[] = [];
  for (const checkpoint of checkpoints) {
    if (!checkpoint) continue;
    if (isCheckpointComplete(checkpoint)) continue;

    const nonce = extractScNonceFromCheckpoint(checkpoint);
    if (nonce) {
      nonces.push(nonce);
    }
  }

  return getHighestScNonce(nonces);
}
