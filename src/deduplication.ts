/**
 * Checkpoint Deduplication Helpers
 *
 * Both regular governance proposals and Security Council elections can create
 * "child" timelock operations that get tracked separately. This module provides
 * utilities to identify, link, and filter these relationships.
 *
 * ## How Duplication Occurs
 *
 * **Proposals:**
 * 1. Proposal is tracked with key `tx:{creation_hash}`
 * 2. Proposal queues to L2 timelock → creates child timelock operation
 * 3. If L2 timelock op is discovered separately, it gets key `tx:{schedule_hash}`
 *
 * **Elections:**
 * 1. Election is tracked with key `election:{index}`
 * 2. Member election execute → SecurityCouncilManager.replaceCohort()
 * 3. This schedules to L2 Constitutional timelock → creates child timelock op
 * 4. If discovered separately, gets key `tx:{schedule_hash}`
 *
 * ## Deduplication Strategy
 *
 * Child checkpoints have `metadata.sourceCheckpoint` set to their parent key.
 * Use `filterChildCheckpoints()` to exclude children when listing all tracked items.
 *
 * @module deduplication
 */

import { TrackingCheckpoint, TrackingResult, CacheAdapter } from "./types";
import { ADDRESSES } from "./constants";
import { loggers } from "./utils/logger";

const log = loggers.tracker;

/** Helper to get cache keys as array */
function getCacheKeys(cache: CacheAdapter): string[] {
  if (typeof cache.keys === "function") {
    const result = cache.keys();
    if (Symbol.iterator in Object(result)) {
      return [...(result as Iterable<string>)];
    }
  }
  return [];
}

/**
 * Check if a timelock operation calldata involves Security Council management
 *
 * @param operationData - Calldata of the timelock operation
 * @returns True if this likely originated from an election
 */
export function isSecurityCouncilTimelockOp(operationData: string): boolean {
  const scManagerAddress = ADDRESSES.SECURITY_COUNCIL_MANAGER?.toLowerCase();
  if (!scManagerAddress) return false;
  return operationData.toLowerCase().includes(scManagerAddress.slice(2));
}

/**
 * Link a child checkpoint to its parent
 *
 * Updates the child checkpoint's metadata to reference its parent.
 * This enables filtering out child checkpoints when displaying tracked items.
 *
 * @param childKey - Cache key for the child checkpoint (e.g., "tx:0x...")
 * @param parentKey - Cache key for the parent (e.g., "election:5" or "tx:0x...")
 * @param cache - Cache adapter to update
 */
export async function linkCheckpointToChild(
  childKey: string,
  parentKey: string,
  cache: CacheAdapter
): Promise<void> {
  const checkpoint = await cache.get<TrackingCheckpoint>(childKey);
  if (!checkpoint) {
    log("Cannot link - child checkpoint %s not found", childKey);
    return;
  }

  checkpoint.metadata = {
    ...checkpoint.metadata,
    errorCount: checkpoint.metadata?.errorCount ?? 0,
    lastTrackedAt: checkpoint.metadata?.lastTrackedAt ?? Date.now(),
    sourceCheckpoint: parentKey,
  };

  await cache.set(childKey, checkpoint);
  log("Linked %s as child of %s", childKey, parentKey);
}

/**
 * Get the parent checkpoint key for a child, if it exists
 *
 * @param childKey - Cache key to check
 * @param cache - Cache adapter to read from
 * @returns Parent key or null if not a child
 */
export async function getParentCheckpoint(
  childKey: string,
  cache: CacheAdapter
): Promise<string | null> {
  const checkpoint = await cache.get<TrackingCheckpoint>(childKey);
  return checkpoint?.metadata?.sourceCheckpoint ?? null;
}

/**
 * Check if a checkpoint is a child of another checkpoint
 *
 * @param key - Cache key to check
 * @param cache - Cache adapter to read from
 * @returns True if this checkpoint has a parent
 */
export async function isChildCheckpoint(key: string, cache: CacheAdapter): Promise<boolean> {
  const parent = await getParentCheckpoint(key, cache);
  return parent !== null;
}

/**
 * Filter out child checkpoints from tracking results
 *
 * Use this when displaying tracked items to avoid showing duplicates.
 * Children are operations that were spawned by a parent proposal/election.
 *
 * @param results - Array of tracking results to filter
 * @returns Results with child checkpoints removed
 */
export function filterChildCheckpoints(results: TrackingResult[]): TrackingResult[] {
  return results.filter((r) => r.checkpoint.metadata?.sourceCheckpoint === undefined);
}

/**
 * Get all child checkpoints and their parents
 *
 * @param cache - Cache adapter to read from
 * @returns Map of child key to parent key
 */
export async function getChildToParentMap(cache: CacheAdapter): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const keys = getCacheKeys(cache);

  for (const key of keys) {
    const checkpoint = await cache.get<TrackingCheckpoint>(key);
    if (checkpoint?.metadata?.sourceCheckpoint) {
      result.set(key, checkpoint.metadata.sourceCheckpoint);
    }
  }

  return result;
}

/**
 * Get all children for a given parent checkpoint
 *
 * @param parentKey - The parent checkpoint key
 * @param cache - Cache adapter to read from
 * @returns Array of child checkpoint keys
 */
export async function getChildCheckpoints(
  parentKey: string,
  cache: CacheAdapter
): Promise<string[]> {
  const children: string[] = [];
  const keys = getCacheKeys(cache);

  for (const key of keys) {
    const checkpoint = await cache.get<TrackingCheckpoint>(key);
    if (checkpoint?.metadata?.sourceCheckpoint === parentKey) {
      children.push(key);
    }
  }

  return children;
}

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  /** Total checkpoints (excluding watermarks) */
  totalCheckpoints: number;
  /** Root checkpoints (no parent) */
  rootCheckpoints: number;
  /** Child checkpoints (have a parent) */
  childCheckpoints: number;
  /** Breakdown by parent type */
  parentTypes: {
    /** Children of election checkpoints */
    fromElections: number;
    /** Children of proposal/timelock checkpoints */
    fromProposals: number;
  };
}

/**
 * Get deduplication statistics for the cache
 *
 * @param cache - Cache adapter to analyze
 * @returns Statistics about checkpoint relationships
 */
export async function getDeduplicationStats(cache: CacheAdapter): Promise<DeduplicationStats> {
  const keys = getCacheKeys(cache);

  let totalCheckpoints = 0;
  let childCheckpoints = 0;
  let fromElections = 0;
  let fromProposals = 0;

  for (const key of keys) {
    // Skip watermarks
    if (key === "discovery:watermarks") continue;

    totalCheckpoints++;

    const checkpoint = await cache.get<TrackingCheckpoint>(key);
    const source = checkpoint?.metadata?.sourceCheckpoint;

    if (source) {
      childCheckpoints++;
      if (source.startsWith("election:")) {
        fromElections++;
      } else {
        fromProposals++;
      }
    }
  }

  return {
    totalCheckpoints,
    rootCheckpoints: totalCheckpoints - childCheckpoints,
    childCheckpoints,
    parentTypes: {
      fromElections,
      fromProposals,
    },
  };
}

/**
 * Find potential parent for a timelock checkpoint
 *
 * Searches for elections or proposals that may have created this timelock operation.
 *
 * @param timelockCheckpoint - The timelock checkpoint to find a parent for
 * @param cache - Cache adapter to search
 * @returns Parent key or null if no parent found
 */
export async function findPotentialParent(
  timelockCheckpoint: TrackingCheckpoint,
  cache: CacheAdapter
): Promise<string | null> {
  if (timelockCheckpoint.input.type !== "timelock") return null;

  const keys = getCacheKeys(cache);
  const timelockAddr = timelockCheckpoint.input.timelockAddress?.toLowerCase();

  // Check if it's from L2 Constitutional timelock (elections schedule here)
  const isL2ConstitutionalTimelock =
    timelockAddr === ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK?.toLowerCase();

  if (isL2ConstitutionalTimelock) {
    // Search completed elections that might have created this
    for (const key of keys) {
      if (!key.startsWith("election:")) continue;

      const electionCheckpoint = await cache.get<TrackingCheckpoint>(key);
      const status = electionCheckpoint?.cachedData?.electionStatus;

      // Completed elections with executed member proposals create timelock ops
      if (status?.phase === "COMPLETED" && status.memberProposalId) {
        // This election completed and may have created this timelock op
        // Without more detailed tracking of the execution tx, we can't be 100% sure
        // but this is a reasonable heuristic
        return key;
      }
    }
  }

  // For non-constitutional timelocks or if no election found, search proposals
  // This would require more complex tracking of proposal execution
  // For now, return null and let the user manually link if needed

  return null;
}

/**
 * Auto-link orphaned timelock checkpoints to their parents
 *
 * Scans for timelock checkpoints without parents and attempts to find and link them.
 *
 * @param cache - Cache adapter to update
 * @returns Number of newly linked checkpoints
 */
export async function autoLinkOrphanedCheckpoints(cache: CacheAdapter): Promise<number> {
  const keys = getCacheKeys(cache);
  let linkedCount = 0;

  for (const key of keys) {
    if (!key.startsWith("tx:")) continue;

    const checkpoint = await cache.get<TrackingCheckpoint>(key);
    if (!checkpoint) continue;

    // Skip if already linked
    if (checkpoint.metadata?.sourceCheckpoint) continue;

    // Skip if not a timelock checkpoint
    if (checkpoint.input.type !== "timelock") continue;

    // Try to find a parent
    const parentKey = await findPotentialParent(checkpoint, cache);
    if (parentKey) {
      await linkCheckpointToChild(key, parentKey, cache);
      linkedCount++;
    }
  }

  log("Auto-linked %d orphaned checkpoints", linkedCount);
  return linkedCount;
}
