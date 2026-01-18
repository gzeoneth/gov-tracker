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
 * Applies multiple filters:
 * - Skips completed checkpoints
 * - Skips checkpoints with failed voting
 * - Skips checkpoints with too many errors
 * - Skips checkpoints older than maxAgeDays
 * - Skips Security Council operations with lower nonces (superseded by higher nonce)
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

  // First pass: collect all checkpoints and their SC nonces
  const candidates: Array<{
    key: string;
    checkpoint: TrackingCheckpoint;
    scNonce: BigNumber | null;
  }> = [];
  const keys = await listCheckpointKeys(cache);

  for (const key of keys) {
    const checkpoint = await getCheckpoint(cache, key);
    if (!checkpoint) continue;

    // Skip if already complete (works for both proposals and elections)
    if (isCheckpointComplete(checkpoint)) {
      continue;
    }

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

    // Extract SC nonce if this is an SC operation
    let scNonce: BigNumber | null = null;
    for (const stage of completedStages) {
      if (stage.type === "L2_TIMELOCK" && stage.data?.isSecurityCouncilOperation) {
        const nonceStr = stage.data.securityCouncilNonce as string | undefined;
        if (nonceStr) {
          scNonce = BigNumber.from(nonceStr);
        }
        break;
      }
    }

    candidates.push({ key, checkpoint, scNonce });
  }

  // Get highest SC nonce among all candidates
  const scNonces = candidates.map((c) => c.scNonce).filter((n): n is BigNumber => n !== null);
  const highestScNonce = getHighestScNonce(scNonces);

  // Second pass: filter out superseded SC operations
  const results: Array<{ key: string; checkpoint: TrackingCheckpoint }> = [];
  for (const { key, checkpoint, scNonce } of candidates) {
    // Skip SC operations with lower nonces (superseded by higher nonce)
    if (scNonce && highestScNonce && scNonce.lt(highestScNonce)) {
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

  const nonces: BigNumber[] = [];
  const keys = await listCheckpointKeys(cache);

  for (const key of keys) {
    const checkpoint = await getCheckpoint(cache, key);
    if (!checkpoint) continue;

    // Only check incomplete checkpoints
    if (isCheckpointComplete(checkpoint)) continue;

    // Look for SC nonce in cached stages
    const stages = checkpoint.cachedData.completedStages ?? [];
    for (const stage of stages) {
      if (stage.type === "L2_TIMELOCK" && stage.data?.isSecurityCouncilOperation) {
        const nonceStr = stage.data.securityCouncilNonce as string | undefined;
        if (nonceStr) {
          nonces.push(BigNumber.from(nonceStr));
        }
      }
    }
  }

  return getHighestScNonce(nonces);
}
