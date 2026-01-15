/**
 * Tracker Discovery Module
 *
 * Handles discovery of proposals and timelock operations.
 * Provides unified discovery API with watermark management.
 */

import { ethers } from "ethers";
import {
  TrackingCheckpoint,
  DiscoveryWatermarks,
  WatermarkHashes,
  DiscoveryTargets,
  DiscoveryKey,
  CacheAdapter,
} from "../types";
import { ADDRESSES, GOVERNANCE_START_BLOCKS } from "../constants";
import {
  discoverProposals as discoverProposalsInternal,
  DiscoveredProposal,
  detectProposalType,
  isElectionProposal,
} from "../discovery/governor-discovery";
import {
  discoverTimelockOps as discoverTimelockOpsInternal,
  DiscoveredTimelockOp,
} from "../discovery/timelock-discovery";
import { loggers, withScope } from "../utils/logger";
import { queryWithRetry } from "../utils/rpc-utils";

const { tracker: logTracker, discovery: logDiscovery } = loggers;

export { DiscoveredProposal, DiscoveredTimelockOp };

/**
 * Cache key for discovery watermarks checkpoint.
 * Uses "discovery:" prefix to follow checkpoint pattern.
 */
export const WATERMARKS_KEY = "discovery:watermarks";

/**
 * Loaded watermark data including block hashes for reorg detection.
 */
export interface LoadedWatermarks {
  watermarks: DiscoveryWatermarks;
  hashes: WatermarkHashes;
}

/**
 * Load discovery watermarks from cache.
 * Watermarks are stored as a TrackingCheckpoint for unified cache format.
 * Returns empty objects if no watermarks are cached.
 */
export async function loadWatermarks(cache: CacheAdapter | undefined): Promise<LoadedWatermarks> {
  if (!cache) return { watermarks: {}, hashes: {} };
  const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
  return {
    watermarks: checkpoint?.cachedData.discoveryWatermarks ?? {},
    hashes: checkpoint?.cachedData.watermarkHashes ?? {},
  };
}

/**
 * Number of blocks to roll back when a reorg is detected.
 * 1000 blocks on L2 Arbitrum ≈ ~4 minutes, provides safety margin.
 */
const REORG_ROLLBACK_BLOCKS = 1000;

/**
 * Verify a watermark's block hash against the chain.
 * If the hash doesn't match (reorg detected), returns a rolled-back block number.
 *
 * @param key - Watermark key for logging
 * @param blockNumber - The watermark block number to verify
 * @param expectedHash - The stored block hash (undefined if not stored)
 * @param provider - Provider to fetch current block hash
 * @returns The verified block number (original if valid, rolled back if reorg detected)
 */
export async function verifyWatermark(
  key: DiscoveryKey,
  blockNumber: number,
  expectedHash: string | undefined,
  provider: ethers.providers.Provider
): Promise<{ blockNumber: number; isValid: boolean; newHash?: string }> {
  const rollback = (): { blockNumber: number; isValid: boolean } => ({
    blockNumber: Math.max(0, blockNumber - REORG_ROLLBACK_BLOCKS),
    isValid: false,
  });

  // No stored hash - can't verify, but fetch current hash for future verification
  if (!expectedHash) {
    try {
      const block = await queryWithRetry(() => provider.getBlock(blockNumber));
      if (block) {
        logDiscovery("%s: no stored hash, establishing hash at block %d", key, blockNumber);
        return { blockNumber, isValid: true, newHash: block.hash };
      }
    } catch {
      // Block might not exist yet or provider error - continue without hash
    }
    return { blockNumber, isValid: true };
  }

  // Verify stored hash against chain
  try {
    const block = await queryWithRetry(() => provider.getBlock(blockNumber));
    if (!block) {
      const result = rollback();
      logDiscovery(
        "%s: block %d not found, rolling back to %d",
        key,
        blockNumber,
        result.blockNumber
      );
      return result;
    }

    if (block.hash.toLowerCase() === expectedHash.toLowerCase()) {
      return { blockNumber, isValid: true, newHash: block.hash };
    }

    // Hash mismatch - reorg detected
    const result = rollback();
    logDiscovery(
      "%s: REORG DETECTED at block %d (expected %s, got %s), rolling back to %d",
      key,
      blockNumber,
      expectedHash.slice(0, 10),
      block.hash.slice(0, 10),
      result.blockNumber
    );
    return result;
  } catch {
    // Provider error - be conservative and continue with stored watermark
    logDiscovery("%s: failed to verify block %d, continuing with stored value", key, blockNumber);
    return { blockNumber, isValid: true };
  }
}

/**
 * Save discovery watermarks to cache.
 * Watermarks are stored as TrackingCheckpoint with proper metadata,
 * following the same pattern as proposal/timelock checkpoints.
 *
 * @param watermarks - Block numbers per discovery key
 * @param hashes - Block hashes per discovery key (for reorg detection)
 * @param cache - Cache adapter
 */
export async function saveWatermarks(
  watermarks: DiscoveryWatermarks,
  hashes: WatermarkHashes,
  cache: CacheAdapter | undefined
): Promise<void> {
  if (!cache) return;

  // Calculate the max L2 block from watermarks for lastProcessedBlock
  const l2Blocks = [
    watermarks.constitutionalGovernor,
    watermarks.nonConstitutionalGovernor,
    watermarks.electionNomineeGovernor,
    watermarks.electionMemberGovernor,
    watermarks.l2ConstitutionalTimelock,
    watermarks.l2NonConstitutionalTimelock,
  ].filter((b): b is number => b !== undefined);
  const maxL2Block = l2Blocks.length > 0 ? Math.max(...l2Blocks) : 0;

  // Store as checkpoint with proper metadata (same pattern as proposal checkpoints)
  const checkpoint: TrackingCheckpoint = {
    version: 1,
    createdAt: Date.now(),
    input: { type: "discovery", id: "watermarks" },
    lastProcessedStage: null,
    lastProcessedBlock: { l1: 0, l2: maxL2Block },
    cachedData: {
      discoveryWatermarks: watermarks,
      watermarkHashes: hashes,
    },
    metadata: {
      errorCount: 0,
      lastTrackedAt: Date.now(),
    },
  };

  await cache.set(WATERMARKS_KEY, checkpoint);
  logTracker("saved watermarks to cache (as checkpoint)");
}

/**
 * Discover proposals from a governor in a block range.
 *
 * @param governorAddress - Governor contract address
 * @param fromBlock - Start block (exclusive - searches from fromBlock + 1)
 * @param toBlock - End block (inclusive)
 * @param l2Provider - L2 provider
 * @param options.chunkSize - Optional chunk size for log searches
 * @returns Array of discovered proposals
 */
export async function discoverProposals(
  governorAddress: string,
  fromBlock: number,
  toBlock: number,
  l2Provider: ethers.providers.Provider,
  options: { chunkSize?: number } = {}
): Promise<DiscoveredProposal[]> {
  logDiscovery("blocks %d-%d", fromBlock, toBlock);
  return discoverProposalsInternal(governorAddress, fromBlock + 1, toBlock, l2Provider, options);
}

/**
 * Discover timelock operations from a timelock in a block range.
 *
 * @param timelockAddress - Timelock contract address
 * @param fromBlock - Start block (exclusive - searches from fromBlock + 1)
 * @param toBlock - End block (inclusive)
 * @param l2Provider - L2 provider
 * @param options.chunkSize - Optional chunk size for log searches
 * @returns Array of discovered timelock operations
 */
export async function discoverTimelockOps(
  timelockAddress: string,
  fromBlock: number,
  toBlock: number,
  l2Provider: ethers.providers.Provider,
  options: { chunkSize?: number } = {}
): Promise<DiscoveredTimelockOp[]> {
  logDiscovery("blocks %d-%d", fromBlock, toBlock);
  return discoverTimelockOpsInternal(timelockAddress, fromBlock + 1, toBlock, l2Provider, options);
}

/**
 * Create pending checkpoints for discovered proposals.
 * This ensures they can be retracked even if the current run times out.
 *
 * Note: We don't create pending checkpoints for timelock ops because:
 * 1. Most timelock ops are tracked as part of governor proposals
 * 2. The monitor-loop skips timelock ops that were tracked via governor
 * 3. Creating pending checkpoints for all timelock ops causes double-counting
 */
export async function createPendingCheckpoints(
  proposals: DiscoveredProposal[],
  timelockOps: DiscoveredTimelockOp[],
  cache: CacheAdapter | undefined
): Promise<void> {
  void timelockOps;
  if (!cache) return;

  let created = 0;
  let skippedElections = 0;

  // Create pending checkpoints for proposals (if not already tracked)
  // Use tx: key format to match trackByTxHash cache keys
  // Skip election proposals - they use election:* checkpoints
  for (const p of proposals) {
    const proposalType = detectProposalType(p.governorAddress);
    if (isElectionProposal(proposalType)) {
      skippedElections++;
      continue;
    }

    const key = `tx:${p.creationTxHash.toLowerCase()}`;
    const existing = await cache.get<TrackingCheckpoint>(key);
    if (existing) continue; // Already has a checkpoint

    const checkpoint: TrackingCheckpoint = {
      version: 1,
      createdAt: Date.now(),
      input: {
        type: "governor",
        governorAddress: p.governorAddress,
        proposalId: p.proposalId,
        creationTxHash: p.creationTxHash,
      },
      lastProcessedStage: null,
      lastProcessedBlock: { l1: 0, l2: p.creationBlock },
      cachedData: {},
      metadata: { errorCount: 0, lastTrackedAt: 0 }, // lastTrackedAt=0 means never tracked
    };
    await cache.set(key, checkpoint);
    created++;
  }

  if (created > 0 || skippedElections > 0) {
    logDiscovery(
      "created pending checkpoints: %d proposals (skipped %d elections)",
      created,
      skippedElections
    );
  }
}

/**
 * Discover all proposals and timelock operations with auto-watermark management.
 *
 * This is the unified discovery API that handles everything internally:
 * - Verifies watermark hashes to detect chain reorgs (rolls back if mismatch)
 * - Loads watermarks from provided watermarks or starts from governance deployment
 * - Discovers from all enabled targets in parallel (with scoped logging)
 * - Creates pending checkpoints for discovered items
 * - Returns updated watermarks and hashes for saving
 *
 * @param targets - Which governors/timelocks to scan
 * @param toBlock - End block for discovery
 * @param l2Provider - L2 provider
 * @param cache - Cache adapter for pending checkpoint creation
 * @param fromWatermarks - Starting watermarks (block numbers)
 * @param fromHashes - Starting hashes for reorg detection
 * @param options.chunkSize - Optional chunk size for log searches
 * @param options.skipReorgCheck - Skip reorg verification (for testing)
 * @returns Discovered proposals, timelock ops, updated watermarks and hashes
 */
export async function discoverAll(
  targets: DiscoveryTargets,
  toBlock: number,
  l2Provider: ethers.providers.Provider,
  cache: CacheAdapter | undefined,
  fromWatermarks: DiscoveryWatermarks,
  fromHashes: WatermarkHashes = {},
  options: { chunkSize?: number; skipReorgCheck?: boolean } = {}
): Promise<{
  proposals: DiscoveredProposal[];
  timelockOps: DiscoveredTimelockOp[];
  watermarks: DiscoveryWatermarks;
  hashes: WatermarkHashes;
}> {
  const defaultStartBlock = GOVERNANCE_START_BLOCKS.L2;

  // Determine which keys we'll be discovering
  const allKeys: DiscoveryKey[] = [
    "constitutionalGovernor",
    "nonConstitutionalGovernor",
    "electionNomineeGovernor",
    "electionMemberGovernor",
    "l2ConstitutionalTimelock",
    "l2NonConstitutionalTimelock",
  ];
  const activeKeys = allKeys.filter((key) => targets[key]);

  // Verify watermarks and get effective start blocks (with reorg detection)
  const verifiedWatermarks: DiscoveryWatermarks = {};
  const updatedHashes: WatermarkHashes = { ...fromHashes };

  if (!options.skipReorgCheck) {
    // Verify all active watermarks in parallel
    const verificationPromises = activeKeys.map(async (key) => {
      const storedBlock = fromWatermarks[key];
      if (storedBlock === undefined) {
        return { key, blockNumber: defaultStartBlock };
      }

      const result = await verifyWatermark(key, storedBlock, fromHashes[key], l2Provider);

      // Update hash if we got a new one
      if (result.newHash) {
        updatedHashes[key] = result.newHash;
      }

      return { key, blockNumber: result.blockNumber };
    });

    const verificationResults = await Promise.all(verificationPromises);
    for (const { key, blockNumber } of verificationResults) {
      verifiedWatermarks[key] = blockNumber;
    }
  } else {
    // Skip verification - use provided watermarks directly
    for (const key of activeKeys) {
      verifiedWatermarks[key] = fromWatermarks[key] ?? defaultStartBlock;
    }
  }

  // Helper to create scoped discovery task
  const scopedProposalTask = (
    key: keyof DiscoveryWatermarks,
    scopeName: string,
    governorAddress: string
  ) => {
    const fromBlock = verifiedWatermarks[key] ?? defaultStartBlock;
    return withScope(scopeName, async () => {
      const proposals = await discoverProposals(governorAddress, fromBlock, toBlock, l2Provider, {
        chunkSize: options.chunkSize,
      });
      return { key, proposals };
    });
  };

  const scopedTimelockTask = (
    key: keyof DiscoveryWatermarks,
    scopeName: string,
    timelockAddress: string
  ) => {
    const fromBlock = verifiedWatermarks[key] ?? defaultStartBlock;
    return withScope(scopeName, async () => {
      const ops = await discoverTimelockOps(timelockAddress, fromBlock, toBlock, l2Provider, {
        chunkSize: options.chunkSize,
      });
      return { key, ops };
    });
  };

  // Build discovery tasks with scoped logging
  const proposalTasks: Promise<{
    key: keyof DiscoveryWatermarks;
    proposals: DiscoveredProposal[];
  }>[] = [];
  const timelockTasks: Promise<{
    key: keyof DiscoveryWatermarks;
    ops: DiscoveredTimelockOp[];
  }>[] = [];

  if (targets.constitutionalGovernor) {
    proposalTasks.push(
      scopedProposalTask("constitutionalGovernor", "core-gov", ADDRESSES.CONSTITUTIONAL_GOVERNOR)
    );
  }
  if (targets.nonConstitutionalGovernor) {
    proposalTasks.push(
      scopedProposalTask(
        "nonConstitutionalGovernor",
        "treasury-gov",
        ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR
      )
    );
  }
  if (targets.electionNomineeGovernor) {
    proposalTasks.push(
      scopedProposalTask(
        "electionNomineeGovernor",
        "nominee-gov",
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      )
    );
  }
  if (targets.electionMemberGovernor) {
    proposalTasks.push(
      scopedProposalTask("electionMemberGovernor", "member-gov", ADDRESSES.ELECTION_MEMBER_GOVERNOR)
    );
  }
  if (targets.l2ConstitutionalTimelock) {
    timelockTasks.push(
      scopedTimelockTask(
        "l2ConstitutionalTimelock",
        "core-timelock",
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK
      )
    );
  }
  if (targets.l2NonConstitutionalTimelock) {
    timelockTasks.push(
      scopedTimelockTask(
        "l2NonConstitutionalTimelock",
        "treasury-timelock",
        ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK
      )
    );
  }

  // Run all discovery in parallel
  const [proposalResults, timelockResults] = await Promise.all([
    Promise.all(proposalTasks),
    Promise.all(timelockTasks),
  ]);

  // Collect results and update watermarks
  const allProposals: DiscoveredProposal[] = [];
  const allTimelockOps: DiscoveredTimelockOp[] = [];
  const newWatermarks: DiscoveryWatermarks = { ...verifiedWatermarks };

  for (const { key, proposals } of proposalResults) {
    allProposals.push(...proposals);
    newWatermarks[key] = toBlock;
  }

  for (const { key, ops } of timelockResults) {
    allTimelockOps.push(...ops);
    newWatermarks[key] = toBlock;
  }

  // Fetch toBlock hash for reorg detection on next run
  // Only need to fetch once since all keys use the same toBlock
  let toBlockHash: string | undefined;
  if (activeKeys.length > 0) {
    try {
      const block = await queryWithRetry(() => l2Provider.getBlock(toBlock));
      if (block) {
        toBlockHash = block.hash;
      }
    } catch {
      // Failed to get block hash - continue without it
      logDiscovery("failed to fetch toBlock hash for reorg detection");
    }
  }

  // Update hashes for all active keys with toBlock hash
  const newHashes: WatermarkHashes = { ...updatedHashes };
  if (toBlockHash) {
    for (const key of activeKeys) {
      newHashes[key] = toBlockHash;
    }
  }

  // Create pending checkpoints for discovered items
  await createPendingCheckpoints(allProposals, allTimelockOps, cache);

  logDiscovery(
    "complete: %d proposals, %d timelockOps",
    allProposals.length,
    allTimelockOps.length
  );

  return {
    proposals: allProposals,
    timelockOps: allTimelockOps,
    watermarks: newWatermarks,
    hashes: newHashes,
  };
}
