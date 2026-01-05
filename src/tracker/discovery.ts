/**
 * Tracker Discovery Module
 *
 * Handles discovery of proposals and timelock operations.
 * Provides unified discovery API with watermark management.
 */

import { ethers } from "ethers";
import { TrackingCheckpoint, DiscoveryWatermarks, DiscoveryTargets, CacheAdapter } from "../types";
import { ADDRESSES, GOVERNANCE_START_BLOCKS } from "../constants";
import {
  discoverProposals as discoverProposalsInternal,
  DiscoveredProposal,
} from "../discovery/governor-discovery";
import {
  discoverTimelockOps as discoverTimelockOpsInternal,
  DiscoveredTimelockOp,
} from "../discovery/timelock-discovery";
import { loggers, withScope } from "../utils/logger";

const { tracker: logTracker, discovery: logDiscovery } = loggers;

export { DiscoveredProposal, DiscoveredTimelockOp };

/**
 * Cache key for discovery watermarks checkpoint.
 * Uses "discovery:" prefix to follow checkpoint pattern.
 */
export const WATERMARKS_KEY = "discovery:watermarks";

/**
 * Load discovery watermarks from cache.
 * Watermarks are stored as a TrackingCheckpoint for unified cache format.
 * Returns empty object if no watermarks are cached.
 */
export async function loadWatermarks(
  cache: CacheAdapter | undefined
): Promise<DiscoveryWatermarks> {
  if (!cache) return {};
  const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
  return checkpoint?.cachedData.discoveryWatermarks ?? {};
}

/**
 * Save discovery watermarks to cache.
 * Watermarks are stored as TrackingCheckpoint with proper metadata,
 * following the same pattern as proposal/timelock checkpoints.
 */
export async function saveWatermarks(
  watermarks: DiscoveryWatermarks,
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
  _timelockOps: DiscoveredTimelockOp[],
  cache: CacheAdapter | undefined
): Promise<void> {
  if (!cache) return;

  let created = 0;

  // Create pending checkpoints for proposals (if not already tracked)
  // Use tx: key format to match trackByTxHash cache keys
  for (const p of proposals) {
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

  if (created > 0) {
    logDiscovery("created pending checkpoints: %d proposals", created);
  }
}

/**
 * Discover all proposals and timelock operations with auto-watermark management.
 *
 * This is the unified discovery API that handles everything internally:
 * - Loads watermarks from provided watermarks or starts from governance deployment
 * - Discovers from all enabled targets in parallel (with scoped logging)
 * - Creates pending checkpoints for discovered items
 * - Returns updated watermarks for saving
 *
 * @param targets - Which governors/timelocks to scan
 * @param toBlock - End block for discovery
 * @param l2Provider - L2 provider
 * @param cache - Cache adapter for pending checkpoint creation
 * @param fromWatermarks - Starting watermarks
 * @param options.chunkSize - Optional chunk size for log searches
 * @returns Discovered proposals, timelock ops, and updated watermarks
 */
export async function discoverAll(
  targets: DiscoveryTargets,
  toBlock: number,
  l2Provider: ethers.providers.Provider,
  cache: CacheAdapter | undefined,
  fromWatermarks: DiscoveryWatermarks,
  options: { chunkSize?: number } = {}
): Promise<{
  proposals: DiscoveredProposal[];
  timelockOps: DiscoveredTimelockOp[];
  watermarks: DiscoveryWatermarks;
}> {
  const watermarks = fromWatermarks;
  const defaultStartBlock = GOVERNANCE_START_BLOCKS.L2;

  // Helper to create scoped discovery task
  const scopedProposalTask = (
    key: keyof DiscoveryWatermarks,
    scopeName: string,
    governorAddress: string
  ) => {
    const fromBlock = watermarks[key] ?? defaultStartBlock;
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
    const fromBlock = watermarks[key] ?? defaultStartBlock;
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
  const newWatermarks: DiscoveryWatermarks = { ...watermarks };

  for (const { key, proposals } of proposalResults) {
    allProposals.push(...proposals);
    newWatermarks[key] = toBlock;
  }

  for (const { key, ops } of timelockResults) {
    allTimelockOps.push(...ops);
    newWatermarks[key] = toBlock;
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
  };
}
