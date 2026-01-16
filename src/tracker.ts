/**
 * ProposalStageTracker - Main entry point
 *
 * Tracks Arbitrum governance proposal lifecycle stages from
 * either a governor proposal or a timelock operation.
 *
 * This file is the public API that composes focused modules:
 * - tracker/context.ts: Functional TrackingState for stage tracking
 * - tracker/pipeline.ts: Pure functions that track stages
 * - tracker/discovery.ts: Proposal and timelock discovery
 * - tracker/query.ts: Checkpoint query operations
 * - tracker/execute.ts: Transaction preparation
 */

import { ethers } from "ethers";
import { loggers } from "./utils/logger";
import { isGasEstimationError } from "./utils/rpc-utils";
import { getCurrentBlockInfo, getL1BlockNumberFromL2 } from "./utils/timing";
import {
  incrementErrorCount,
  createCheckpointMetadata,
  txHashCacheKey,
} from "./tracker/checkpoint-helpers";
import {
  TrackerOptions,
  TrackingResult,
  TrackingContext,
  GovernorTrackingInput,
  TimelockTrackingInput,
  TrackedStage,
  TrackingCheckpoint,
  TrackerStats,
  ChunkingConfig,
  OnProgressCallback,
  DiscoveryWatermarks,
  DiscoveryTargets,
  PrepareResult,
  PrepareOptions,
  ElectionCheckResult,
  ElectionProposalStatus,
  TimelockLink,
} from "./types";
import { DEFAULT_CHUNKING_CONFIG, ADDRESSES, DEFAULT_RPC_URLS } from "./constants";
import {
  checkElectionStatus,
  prepareElectionCreation,
  trackElectionProposal,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
  getElectionIndexForProposalId,
  getNomineeElectionDetails,
  getMemberElectionDetails,
  serializeNomineeDetails,
  serializeMemberDetails,
} from "./election";
import type { SerializableNomineeDetails, SerializableMemberDetails } from "./types";
import { discoverProposalByTxHash } from "./discovery/governor-discovery";
import { findCallScheduledByTxHash } from "./discovery/timelock-discovery";
import { findStage } from "./stages/utils";

const { tracker: logTracker, discovery: logDiscovery } = loggers;

/**
 * Build a TrackingContext with current block numbers and timestamp.
 * Called once at the start of a tracking session for consistent state.
 */
async function buildTrackingContext(options: {
  l2Provider: ethers.providers.Provider;
  l1Provider?: ethers.providers.Provider;
  novaProvider?: ethers.providers.Provider;
  chunkSize?: number;
  skipCache?: boolean;
}): Promise<TrackingContext> {
  const { l2Provider, l1Provider, novaProvider, chunkSize, skipCache } = options;

  const l2BlockInfo = await getCurrentBlockInfo(l2Provider);
  const context: TrackingContext = {
    l2BlockNumber: l2BlockInfo.blockNumber,
    timestamp: l2BlockInfo.timestamp,
    chunkSize,
    skipCache,
  };

  logTracker(
    "buildTrackingContext: l2Block=%d timestamp=%d",
    context.l2BlockNumber,
    context.timestamp
  );

  if (l1Provider) {
    try {
      const l1Block = await getL1BlockNumberFromL2(l2Provider);
      context.l1BlockNumber = l1Block.toNumber();
      logTracker("buildTrackingContext: l1Block=%d", context.l1BlockNumber);
    } catch (err) {
      logTracker("buildTrackingContext: failed to get L1 block: %s", (err as Error).message);
    }
  }

  if (novaProvider) {
    try {
      const novaBlockInfo = await getCurrentBlockInfo(novaProvider);
      context.novaBlockNumber = novaBlockInfo.blockNumber;
      logTracker("buildTrackingContext: novaBlock=%d", context.novaBlockNumber);
    } catch (err) {
      logTracker("buildTrackingContext: failed to get Nova block: %s", (err as Error).message);
    }
  }

  return context;
}

// Import context and pipeline from tracker modules
import {
  createTrackingState,
  isComplete,
  getProposalType,
  getProposalData,
  getProposalState,
  getIsElection,
  createCheckpoint,
  TrackingState,
} from "./tracker/state";
import { trackGovernorPipeline, trackTimelockPipeline } from "./tracker/pipeline";

// Import from focused modules
import { readCacheStatus, FileCache } from "./tracker/cache";
import { loadWatermarks, saveWatermarks, LoadedWatermarks } from "./tracker/discovery";
import { CacheAdapter, WatermarkHashes } from "./types";
import {
  discoverAll as discoverAllInternal,
  discoverProposals as discoverProposalsInternal,
  discoverTimelockOps as discoverTimelockOpsInternal,
  DiscoveredProposal,
  DiscoveredTimelockOp,
} from "./tracker/discovery";
import {
  listCheckpointKeys as listCheckpointKeysInternal,
  getCheckpoint as getCheckpointInternal,
  getAllCheckpoints as getAllCheckpointsInternal,
  queryIncompleteCheckpoints as queryIncompleteCheckpointsInternal,
  getStats as getStatsInternal,
} from "./tracker/query";
import { prepareTransaction as prepareTransactionInternal } from "./tracker/execute";

/**
 * Extract TimelockLink from stages if PROPOSAL_QUEUED is completed
 */
export function extractTimelockLink(stages: TrackedStage[]): TimelockLink | undefined {
  const queuedStage = findStage(stages, "PROPOSAL_QUEUED");

  if (
    !queuedStage ||
    queuedStage.type !== "PROPOSAL_QUEUED" ||
    queuedStage.status !== "COMPLETED"
  ) {
    return undefined;
  }

  const txHash = queuedStage.transactions[0]?.hash;
  const operationId = queuedStage.data.operationId;
  const timelockAddress = queuedStage.data.timelockAddress;
  const queueBlockNumber = queuedStage.transactions[0]?.blockNumber;

  if (!txHash || !operationId || !timelockAddress || !queueBlockNumber) {
    return undefined;
  }

  return {
    txHash,
    operationId,
    timelockAddress,
    queueBlockNumber,
  };
}

/**
 * Main proposal stage tracker class
 *
 * @example
 * ```typescript
 * const tracker = new ProposalStageTracker({
 *   l2Provider: new ethers.providers.StaticJsonRpcProvider(ARB1_RPC),
 *   l1Provider: new ethers.providers.StaticJsonRpcProvider(ETH_RPC),
 * });
 *
 * // Track by transaction hash (recommended)
 * const results = await tracker.trackByTxHash(creationTxHash);
 *
 * for (const stage of results[0].stages) {
 *   console.log(`${stage.type}: ${stage.status}`);
 * }
 *
 * // Resume from checkpoint
 * const resumedTracker = createTracker({
 *   l2Provider,
 *   l1Provider,
 *   checkpoint: savedCheckpoint
 * });
 * const fresh = await resumedTracker.trackByTxHash(creationTxHash);
 * ```
 */
export class ProposalStageTracker {
  private l2Provider: ethers.providers.Provider;
  private l1Provider: ethers.providers.Provider;
  private novaProvider: ethers.providers.Provider;
  private onProgress?: OnProgressCallback;
  /** Chunking configuration for log searches */
  readonly chunkingConfig: ChunkingConfig;
  /** Cache adapter for checkpoint persistence */
  private cache?: CacheAdapter;

  constructor(options: TrackerOptions) {
    if (!options.l1Provider) {
      throw new Error("l1Provider is required");
    }
    this.l1Provider = options.l1Provider;
    // Use StaticJsonRpcProvider for defaults to avoid automatic chainId detection
    this.l2Provider =
      options.l2Provider ?? new ethers.providers.StaticJsonRpcProvider(DEFAULT_RPC_URLS.ARB_ONE);
    this.novaProvider =
      options.novaProvider ?? new ethers.providers.StaticJsonRpcProvider(DEFAULT_RPC_URLS.NOVA);
    this.onProgress = options.onProgress;
    this.chunkingConfig = options.chunkingConfig ?? DEFAULT_CHUNKING_CONFIG;

    // Initialize cache: prefer direct cache adapter, fallback to cachePath
    if (options.cache) {
      this.cache = options.cache;
    } else if (options.cachePath) {
      this.cache = new FileCache(options.cachePath);
    }
  }

  // Static Cache Access

  /**
   * Read all cache data without requiring RPC providers.
   * Use this for status/dashboard views that only need cached data.
   *
   * This is the ONLY way to access cache data outside of a full tracker instance.
   * All cache access goes through this class to maintain single-system ownership.
   *
   * @param cachePath - Path to the cache file (tracker creates FileCache internally)
   */
  static async readCacheStatus(cachePath: string): Promise<{
    watermarks: DiscoveryWatermarks;
    checkpoints: Map<string, TrackingCheckpoint>;
    elections: Map<number, TrackingCheckpoint>;
  }> {
    return readCacheStatus(cachePath);
  }

  /**
   * Clear a specific cache entry. Used by --force to ensure fresh tracking.
   */
  async clearCacheEntry(key: string): Promise<void> {
    if (this.cache) {
      await this.cache.delete(key);
      logTracker("cleared cache entry: %s", key);
    }
  }

  // Watermark Management

  /**
   * Load discovery watermarks from cache.
   * Watermarks are stored as a TrackingCheckpoint for unified cache format.
   * Returns empty object if no watermarks are cached.
   */
  async loadWatermarks(): Promise<LoadedWatermarks> {
    return loadWatermarks(this.cache);
  }

  /**
   * Save discovery watermarks to cache.
   * Watermarks are stored as TrackingCheckpoint with proper metadata,
   * following the same pattern as proposal/timelock checkpoints.
   *
   * @param watermarks - Block numbers per discovery key
   * @param hashes - Block hashes per discovery key (for reorg detection)
   */
  async saveWatermarks(
    watermarks: DiscoveryWatermarks,
    hashes: WatermarkHashes = {}
  ): Promise<void> {
    return saveWatermarks(watermarks, hashes, this.cache);
  }

  /**
   * Save an election checkpoint to cache.
   * Elections are stored with key format: `election:{electionIndex}`
   *
   * For COMPLETED elections, automatically fetches and caches nominee/member
   * election details to enable zero-RPC reads for historical elections.
   *
   * @param electionStatus - Election status from trackElectionProposal
   * @param options.nomineeDetails - Pre-fetched nominee details (skips RPC fetch)
   * @param options.memberDetails - Pre-fetched member details (skips RPC fetch)
   */
  async saveElectionCheckpoint(
    electionStatus: ElectionProposalStatus,
    options: {
      nomineeDetails?: SerializableNomineeDetails;
      memberDetails?: SerializableMemberDetails;
    } = {}
  ): Promise<void> {
    if (!this.cache) return;

    const key = `election:${electionStatus.electionIndex}`;
    const now = Date.now();

    let nomineeDetails = options.nomineeDetails;
    let memberDetails = options.memberDetails;

    // For COMPLETED elections, fetch details if not provided
    if (electionStatus.phase === "COMPLETED" && !nomineeDetails && !memberDetails) {
      try {
        const [rawNomineeDetails, rawMemberDetails] = await Promise.all([
          getNomineeElectionDetails(electionStatus.electionIndex, this.l2Provider),
          getMemberElectionDetails(electionStatus.electionIndex, this.l2Provider),
        ]);

        if (rawNomineeDetails) {
          nomineeDetails = serializeNomineeDetails(rawNomineeDetails);
        }
        if (rawMemberDetails) {
          memberDetails = serializeMemberDetails(rawMemberDetails);
        }
        logTracker(
          "fetched election %d details: nominees=%d, members=%d",
          electionStatus.electionIndex,
          nomineeDetails?.nominees?.length ?? 0,
          memberDetails?.nominees?.length ?? 0
        );
      } catch (err) {
        logTracker(
          "failed to fetch election %d details (non-fatal): %s",
          electionStatus.electionIndex,
          (err as Error).message
        );
      }
    }

    await this.cache.set(key, {
      version: 1,
      createdAt: now,
      input: { type: "election", electionIndex: electionStatus.electionIndex },
      lastProcessedStage: null,
      lastProcessedBlock: { l1: 0, l2: 0 },
      cachedData: { electionStatus, nomineeDetails, memberDetails },
      metadata: { errorCount: 0, lastTrackedAt: now },
    } satisfies TrackingCheckpoint);

    logTracker("saved election checkpoint: %s (phase: %s)", key, electionStatus.phase);
  }

  /**
   * Get an election checkpoint from cache.
   *
   * For COMPLETED elections, includes cached nominee/member details:
   * - nomineeDetails: Contenders, nominees, excluded nominees, quorum threshold
   * - memberDetails: Final nominee rankings, winners, voting deadlines
   *
   * @param electionIndex - Election index
   * @returns Election data or null if not cached
   */
  async getElectionCheckpoint(electionIndex: number): Promise<{
    status: ElectionProposalStatus;
    nomineeDetails: SerializableNomineeDetails | null;
    memberDetails: SerializableMemberDetails | null;
  } | null> {
    if (!this.cache) return null;

    const key = `election:${electionIndex}`;
    const checkpoint = await this.cache.get<TrackingCheckpoint>(key);

    if (!checkpoint?.cachedData?.electionStatus) {
      return null;
    }

    return {
      status: checkpoint.cachedData.electionStatus,
      nomineeDetails: checkpoint.cachedData.nomineeDetails ?? null,
      memberDetails: checkpoint.cachedData.memberDetails ?? null,
    };
  }

  // Discovery API

  /**
   * Discover proposals from a governor in a block range.
   *
   * @param governorAddress - Governor contract address
   * @param fromBlock - Start block (exclusive - searches from fromBlock + 1)
   * @param toBlock - End block (inclusive)
   * @returns Array of discovered proposals
   */
  async discoverProposals(
    governorAddress: string,
    fromBlock: number,
    toBlock: number
  ): Promise<DiscoveredProposal[]> {
    return discoverProposalsInternal(governorAddress, fromBlock, toBlock, this.l2Provider);
  }

  /**
   * Discover timelock operations from a timelock in a block range.
   *
   * @param timelockAddress - Timelock contract address
   * @param fromBlock - Start block (exclusive - searches from fromBlock + 1)
   * @param toBlock - End block (inclusive)
   * @returns Array of discovered timelock operations
   */
  async discoverTimelockOps(
    timelockAddress: string,
    fromBlock: number,
    toBlock: number
  ): Promise<DiscoveredTimelockOp[]> {
    return discoverTimelockOpsInternal(timelockAddress, fromBlock, toBlock, this.l2Provider);
  }

  /**
   * Discover all proposals and timelock operations with auto-watermark management.
   *
   * This is the unified discovery API that handles everything internally:
   * - Verifies watermark hashes to detect chain reorgs (rolls back if mismatch)
   * - Loads watermarks from cache (or uses provided fromWatermarks)
   * - Discovers from all enabled targets in parallel
   * - Auto-saves updated watermarks and hashes to cache
   *
   * @param targets - Which governors/timelocks to scan
   * @param toBlock - End block for discovery
   * @param fromWatermarks - Optional starting watermarks (overrides cached watermarks)
   * @returns Discovered proposals, timelock ops, and updated watermarks
   */
  async discoverAll(
    targets: DiscoveryTargets,
    toBlock: number,
    fromWatermarks?: DiscoveryWatermarks
  ): Promise<{
    proposals: DiscoveredProposal[];
    timelockOps: DiscoveredTimelockOp[];
    watermarks: DiscoveryWatermarks;
  }> {
    // Load watermarks and hashes from cache (or use provided override)
    const loaded = await this.loadWatermarks();
    const watermarks = fromWatermarks ?? loaded.watermarks;
    const hashes = fromWatermarks ? {} : loaded.hashes; // Only use cached hashes if using cached watermarks

    const result = await discoverAllInternal(
      targets,
      toBlock,
      this.l2Provider,
      this.cache,
      watermarks,
      hashes,
      { chunkSize: this.chunkingConfig.l2ChunkSize }
    );

    // Auto-save updated watermarks and hashes
    await this.saveWatermarks(result.watermarks, result.hashes);

    return result;
  }

  // Checkpoint Query API

  /**
   * List all checkpoint keys in the cache.
   */
  async listCheckpointKeys(): Promise<string[]> {
    return listCheckpointKeysInternal(this.cache);
  }

  /**
   * Get a specific checkpoint from cache by key.
   */
  async getCheckpoint(key: string): Promise<TrackingCheckpoint | null> {
    return getCheckpointInternal(this.cache, key);
  }

  /**
   * Get all checkpoints from cache.
   */
  async getAllCheckpoints(): Promise<Map<string, TrackingCheckpoint>> {
    return getAllCheckpointsInternal(this.cache);
  }

  /**
   * Query incomplete checkpoints that should be re-tracked.
   *
   * @param options.maxAgeDays - Skip items older than this (default: 60)
   * @param options.maxErrorCount - Skip items with more consecutive errors (default: 5)
   */
  async queryIncompleteCheckpoints(
    options: {
      maxAgeDays?: number;
      maxErrorCount?: number;
    } = {}
  ): Promise<Array<{ key: string; checkpoint: TrackingCheckpoint }>> {
    return queryIncompleteCheckpointsInternal(this.cache, options);
  }

  /**
   * Get aggregated cache statistics.
   *
   * @param maxErrorCount - Items with this many or more errors are counted as "errored" (default: 5)
   */
  async getStats(maxErrorCount: number = 5): Promise<TrackerStats> {
    return getStatsInternal(this.cache, maxErrorCount);
  }

  // Main Tracking Entry Points

  /**
   * Track from transaction hash (primary tracking entry point)
   *
   * Auto-detects whether the transaction contains a governor proposal or
   * timelock operations and tracks accordingly.
   *
   * Returns an array because a single transaction may contain multiple
   * timelock operations (e.g., SC rotation with 4 operations).
   *
   * When cache is configured on the tracker:
   * - Automatically loads existing checkpoint from cache (zero-RPC resume)
   * - Automatically saves checkpoint to cache after tracking
   *
   * @example
   * ```typescript
   * const results = await tracker.trackByTxHash("0x...");
   * for (const result of results) {
   *   console.log(`Found ${result.stages.length} stages`);
   * }
   * ```
   */
  async trackByTxHash(txHash: string): Promise<TrackingResult[]> {
    logTracker("trackByTxHash %s", txHash);

    // Cache key for this transaction
    const cacheKey = txHashCacheKey(txHash);

    // Load checkpoint from cache for resume
    let checkpoint: TrackingCheckpoint | undefined;
    if (this.cache) {
      checkpoint = (await this.cache.get<TrackingCheckpoint>(cacheKey)) ?? undefined;
      if (checkpoint) {
        logTracker("loaded checkpoint from cache: %s", cacheKey);
      }
    }

    try {
      return await this.trackByTxHashInternal(txHash, cacheKey, checkpoint);
    } catch (error) {
      // Save checkpoint on error with incremented error count
      // Gas estimation errors don't count against consecutive errors
      if (this.cache) {
        const input: GovernorTrackingInput = {
          type: "governor",
          governorAddress: "",
          proposalId: "",
          creationTxHash: txHash,
        };
        const prevErrorCount = checkpoint?.metadata?.errorCount ?? 0;
        const newErrorCount = incrementErrorCount(prevErrorCount, error as Error);
        const isGasError = isGasEstimationError(error);

        const errorCheckpoint: TrackingCheckpoint = checkpoint ?? {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 0, l2: 0 },
          cachedData: {},
        };
        errorCheckpoint.metadata = createCheckpointMetadata(newErrorCount);
        await this.cache.set(cacheKey, errorCheckpoint);
        logTracker(
          "saved checkpoint on error: %s (errorCount=%d%s)",
          cacheKey,
          newErrorCount,
          isGasError ? " - gas error, not incrementing" : ""
        );
      }
      throw error;
    }
  }

  /**
   * Internal implementation of trackByTxHash.
   *
   * Uses PipelineContext for stateful tracking - no parameter passing between stages.
   */
  private async trackByTxHashInternal(
    txHash: string,
    cacheKey: string,
    checkpoint: TrackingCheckpoint | undefined
  ): Promise<TrackingResult[]> {
    // RESUME PATH: If we have a checkpoint, check what type it is
    if (checkpoint && checkpoint.input.type !== "discovery") {
      logTracker("RESUME: found checkpoint for tx, type=%s", checkpoint.input.type);

      if (checkpoint.input.type === "governor") {
        const input = checkpoint.input;
        const result = await this.trackGovernorWithPipeline(
          input.governorAddress,
          input.proposalId,
          input.creationTxHash,
          checkpoint,
          cacheKey
        );
        return [result];
      } else if (checkpoint.input.type === "timelock") {
        const input = checkpoint.input;
        const result = await this.trackTimelockWithPipeline(
          input.timelockAddress,
          input.operationId,
          input.scheduledTxHash,
          checkpoint,
          cacheKey
        );
        return [result];
      }
    }

    // Try as proposal first
    const proposal = await discoverProposalByTxHash(txHash, this.l2Provider);
    if (proposal) {
      logDiscovery("found proposal in tx, proposalId=%s", proposal.proposalId);
      const result = await this.trackGovernorWithPipeline(
        proposal.governorAddress,
        proposal.proposalId,
        proposal.creationTxHash,
        checkpoint,
        cacheKey
      );
      return [result];
    }

    // Try as timelock operations (may be batch with multiple ops)
    const callScheduledEvents = await findCallScheduledByTxHash(txHash, this.l2Provider);
    if (callScheduledEvents && callScheduledEvents.length > 0) {
      logDiscovery("found %d timelock operation(s) in tx", callScheduledEvents.length);

      // Group by unique operationId (batch operations have multiple calls with same operationId)
      const seenOperationIds = new Set<string>();
      const results: TrackingResult[] = [];

      for (const event of callScheduledEvents) {
        if (seenOperationIds.has(event.operationId)) continue;
        seenOperationIds.add(event.operationId);

        const result = await this.trackTimelockWithPipeline(
          event.timelockAddress,
          event.operationId,
          txHash,
          checkpoint,
          cacheKey,
          event
        );
        results.push(result);
      }

      return results;
    }

    logTracker("no proposal or timelock operations found in tx");
    return [];
  }

  /**
   * Track governor proposal using TrackingState (stateful tracking)
   */
  private async trackGovernorWithPipeline(
    governorAddress: string,
    proposalId: string,
    creationTxHash: string,
    checkpoint: TrackingCheckpoint | undefined,
    cacheKey: string
  ): Promise<TrackingResult> {
    const input: GovernorTrackingInput = {
      type: "governor",
      governorAddress,
      proposalId,
      creationTxHash,
    };

    // Create tracking context
    const initialState = createTrackingState({
      providers: {
        l2: this.l2Provider,
        l1: this.l1Provider,
        nova: this.novaProvider,
      },
      input,
      onProgress: this.onProgress,
      chunkingConfig: this.chunkingConfig,
      checkpoint,
      cacheKey,
    });

    // Run the governor pipeline (stages 1-7)
    const finalState = await trackGovernorPipeline(initialState);

    // Build result from state
    const result = this.buildResultFromState(finalState);

    // Track election status if this is an election governor proposal
    if (result.isElection) {
      const electionStatus = await this.trackElectionStatus(proposalId);
      if (electionStatus) {
        result.electionStatus = electionStatus;
        await this.saveElectionCheckpoint(electionStatus);
        // Elections are fully tracked via election checkpoints, remove tx:* checkpoint
        if (this.cache && cacheKey) {
          await this.cache.delete(cacheKey);
          logTracker(
            "election tracked via election checkpoint, removed tx:* checkpoint: %s",
            cacheKey
          );
        }
        return result;
      }
      // If election tracking failed, fall through to save tx:* checkpoint for retry
      logTracker("election tracking failed, saving tx:* checkpoint for retry");
    }

    // Save checkpoint to cache (non-elections and failed election tracking)
    if (this.cache && cacheKey) {
      result.checkpoint.metadata = { errorCount: 0, lastTrackedAt: Date.now() };
      await this.cache.set(cacheKey, result.checkpoint);
      logTracker("saved checkpoint to cache: %s", cacheKey);
    }

    return result;
  }

  /**
   * Track timelock operation using TrackingState (stateful tracking)
   */
  private async trackTimelockWithPipeline(
    timelockAddress: string,
    operationId: string,
    scheduledTxHash: string,
    checkpoint: TrackingCheckpoint | undefined,
    cacheKey: string,
    callScheduledEvent?: import("./types").CallScheduledData
  ): Promise<TrackingResult> {
    const input: TimelockTrackingInput = {
      type: "timelock",
      timelockAddress,
      operationId,
      scheduledTxHash,
    };

    // Create tracking context with bootstrap data
    const initialState = createTrackingState({
      providers: {
        l2: this.l2Provider,
        l1: this.l1Provider,
        nova: this.novaProvider,
      },
      input,
      onProgress: this.onProgress,
      chunkingConfig: this.chunkingConfig,
      checkpoint,
      cacheKey,
      callScheduledData: callScheduledEvent ? [callScheduledEvent] : undefined,
    });

    // Run the timelock pipeline (stages 4-7)
    const finalState = await trackTimelockPipeline(initialState);

    // Build result from state
    const result = this.buildResultFromState(finalState);

    // Save checkpoint to cache
    if (this.cache && cacheKey) {
      result.checkpoint.metadata = { errorCount: 0, lastTrackedAt: Date.now() };
      await this.cache.set(cacheKey, result.checkpoint);
      logTracker("saved checkpoint to cache: %s", cacheKey);
    }

    return result;
  }

  /**
   * Build TrackingResult from TrackingState
   */
  private buildResultFromState(state: TrackingState): TrackingResult {
    const stages = state.stages;
    const checkpoint = createCheckpoint(state);
    const timelockLink = extractTimelockLink(stages);

    return {
      input: state.input,
      stages,
      checkpoint,
      isComplete: isComplete(state),
      proposalType: getProposalType(state),
      proposalData: getProposalData(state),
      timelockLink,
      currentState: getProposalState(state),
      isElection: getIsElection(state),
    };
  }

  /**
   * Track from a cached checkpoint.
   *
   * This is a convenience method that extracts the transaction hash from the
   * checkpoint and dispatches to trackByTxHash. Use this when re-tracking
   * items from queryIncompleteCheckpoints().
   *
   * @example
   * ```typescript
   * const incomplete = await tracker.queryIncompleteCheckpoints({ maxAgeDays: 60 });
   * for (const { checkpoint } of incomplete) {
   *   const result = await tracker.trackFromCheckpoint(checkpoint);
   *   // ... handle result
   * }
   * ```
   */
  async trackFromCheckpoint(checkpoint: TrackingCheckpoint): Promise<TrackingResult> {
    const input = checkpoint.input;

    if (input.type === "governor") {
      if (!input.creationTxHash) {
        throw new Error("Governor checkpoint missing creationTxHash");
      }
      const results = await this.trackByTxHash(input.creationTxHash);
      if (results.length === 0) {
        throw new Error(`No proposal found in tx ${input.creationTxHash}`);
      }
      if (results.length > 1) {
        logTracker(
          "WARNING: trackFromCheckpoint found %d results in tx %s, returning first only. " +
            "Use trackByTxHash() to get all results.",
          results.length,
          input.creationTxHash
        );
      }
      return results[0];
    } else if (input.type === "timelock") {
      if (!input.scheduledTxHash) {
        throw new Error("Timelock checkpoint missing scheduledTxHash");
      }
      const results = await this.trackByTxHash(input.scheduledTxHash);
      if (results.length === 0) {
        throw new Error(`No timelock operation found in tx ${input.scheduledTxHash}`);
      }
      if (results.length > 1) {
        logTracker(
          "WARNING: trackFromCheckpoint found %d results in tx %s, returning first only. " +
            "Use trackByTxHash() to get all results.",
          results.length,
          input.scheduledTxHash
        );
      }
      return results[0];
    } else {
      throw new Error(`Unsupported checkpoint input type: ${(input as { type: string }).type}`);
    }
  }

  // Transaction Preparation

  /**
   * Prepare a transaction for a READY stage without sending it.
   *
   * Returns PrepareResult with the prepared transaction data.
   * Consumer is responsible for signing and sending the transaction.
   *
   * @param stage - The stage to prepare
   * @param options - Preparation options
   * @param allStages - Optional array of all stages (used to extract description for salt resolution)
   *
   * @example
   * ```typescript
   * const result = await tracker.prepareTransaction(readyStage);
   * if (result.success) {
   *   console.log(`To: ${result.prepared.to}`);
   *   console.log(`Data: ${result.prepared.data}`);
   *   console.log(`Chain: ${result.prepared.chain}`);
   *
   *   // Execute with your own signer
   *   const tx = await signer.sendTransaction({
   *     to: result.prepared.to,
   *     data: result.prepared.data,
   *     value: result.prepared.value,
   *   });
   *   await tx.wait();
   * } else {
   *   console.error(result.error);
   * }
   * ```
   *
   * @note Salt is now pre-computed during tracking and stored in stage.data
   */
  async prepareTransaction(
    stage: TrackedStage,
    options: PrepareOptions = {}
  ): Promise<PrepareResult> {
    return prepareTransactionInternal(
      stage,
      {
        l1Provider: this.l1Provider,
        l2Provider: this.l2Provider,
        novaProvider: this.novaProvider,
      },
      options
    );
  }

  // Provider Access

  /**
   * Get the current providers
   */
  getProviders(): {
    l1: ethers.providers.Provider;
    l2: ethers.providers.Provider;
    nova?: ethers.providers.Provider;
  } {
    return {
      l1: this.l1Provider,
      l2: this.l2Provider,
      nova: this.novaProvider,
    };
  }

  // Election Tracking

  /**
   * Track election status for a given proposal ID.
   *
   * Searches through elections to find the one containing this proposal,
   * then tracks the full election lifecycle.
   */
  private async trackElectionStatus(proposalId: string): Promise<ElectionProposalStatus | null> {
    logTracker("trackElectionStatus for proposal %s", proposalId);

    try {
      // Get current L2 block for block-scoped caching
      const { blockNumber: l2BlockNumber } = await getCurrentBlockInfo(this.l2Provider);

      const electionIndex = await getElectionIndexForProposalId(
        proposalId,
        this.l2Provider,
        this.l1Provider,
        { novaProvider: this.novaProvider, blockNumber: l2BlockNumber }
      );

      if (electionIndex === null) {
        logTracker("no election found for proposal %s", proposalId);
        return null;
      }

      logTracker("found election index %d for proposal %s", electionIndex, proposalId);
      return trackElectionProposal(electionIndex, this.l2Provider, this.l1Provider, {
        novaProvider: this.novaProvider,
      });
    } catch (error) {
      // Election tracking is non-critical - log and return null
      // The proposal stages are already tracked successfully
      logTracker("election tracking failed for proposal %s: %O", proposalId, error);
      return null;
    }
  }

  /**
   * Track an election by its index.
   *
   * This method provides direct election tracking when you have the election index.
   * For tracking via tx hash, use trackByTxHash() which auto-detects elections.
   *
   * Caching behavior:
   * - COMPLETED elections: Returns cached data immediately (0 RPC calls)
   * - Incomplete elections: Makes fresh RPC calls and updates cache
   * - No cache: Always makes fresh RPC calls
   *
   * @param electionIndex - Election index (0-based)
   * @param options.force - Force fresh tracking even for completed elections
   * @returns Election status
   */
  async trackElection(
    electionIndex: number,
    options: { force?: boolean } = {}
  ): Promise<ElectionProposalStatus> {
    logTracker("trackElection for index %d (force=%s)", electionIndex, options.force ?? false);

    // Check cache first for completed elections (skip RPC calls)
    if (this.cache && !options.force) {
      const cached = await this.getElectionCheckpoint(electionIndex);
      if (cached && cached.status.phase === "COMPLETED") {
        logTracker("returning cached COMPLETED election %d (0 RPC calls)", electionIndex);
        return cached.status;
      }
    }

    // Build full tracking context for consistent state across all calls
    const context = await buildTrackingContext({
      l2Provider: this.l2Provider,
      l1Provider: this.l1Provider,
      novaProvider: this.novaProvider,
      skipCache: options.force,
    });

    // Track fresh for incomplete elections or cache miss
    const status = await trackElectionProposal(electionIndex, this.l2Provider, this.l1Provider, {
      novaProvider: this.novaProvider,
      l2BlockNumber: context.l2BlockNumber,
      timestamp: context.timestamp,
      skipCache: context.skipCache,
    });

    if (this.cache) {
      await this.saveElectionCheckpoint(status);
    }

    return status;
  }

  /**
   * Track all elections with caching.
   *
   * Caching behavior:
   * - COMPLETED elections: Returns cached data immediately (0 RPC calls)
   * - Incomplete elections: Makes fresh RPC calls and updates cache
   *
   * @param options.includeNext - Include the "next" election slot (default: true)
   * @param options.force - Force fresh tracking for all elections
   * @returns Array of election statuses
   */
  async trackAllElections(
    options: { includeNext?: boolean; force?: boolean } = {}
  ): Promise<ElectionProposalStatus[]> {
    logTracker(
      "trackAllElections (includeNext=%s, force=%s)",
      options.includeNext ?? true,
      options.force ?? false
    );

    // Build context once at the start for consistent state across all elections
    const context = await buildTrackingContext({
      l2Provider: this.l2Provider,
      l1Provider: this.l1Provider,
      novaProvider: this.novaProvider,
      skipCache: options.force,
    });

    const status = await checkElectionStatus(this.l2Provider, this.l1Provider);
    const electionCount = status.electionCount;
    const results: ElectionProposalStatus[] = [];

    // Track existing elections (indices 0 to electionCount-1)
    for (let i = 0; i < electionCount; i++) {
      try {
        // Check cache first for completed elections (skip RPC calls)
        if (this.cache && !options.force) {
          const cached = await this.getElectionCheckpoint(i);
          if (cached && cached.status.phase === "COMPLETED") {
            logTracker("returning cached COMPLETED election %d (0 RPC calls)", i);
            results.push(cached.status);
            continue;
          }
        }

        // Track with shared context
        const electionStatus = await trackElectionProposal(i, this.l2Provider, this.l1Provider, {
          novaProvider: this.novaProvider,
          l2BlockNumber: context.l2BlockNumber,
          timestamp: context.timestamp,
          skipCache: context.skipCache,
        });
        results.push(electionStatus);

        if (this.cache) {
          await this.saveElectionCheckpoint(electionStatus);
        }
      } catch (err) {
        logTracker("Failed to track election %d: %s", i, err);
      }
    }

    // Optionally track the next election (not yet created) for createElection preparation
    if (options.includeNext ?? true) {
      try {
        // Next election always needs fresh RPC calls since it doesn't exist yet
        const nextElectionStatus = await trackElectionProposal(
          electionCount,
          this.l2Provider,
          this.l1Provider,
          {
            novaProvider: this.novaProvider,
            l2BlockNumber: context.l2BlockNumber,
            timestamp: context.timestamp,
          }
        );
        results.push({
          ...nextElectionStatus,
          canCreateElection: status.canCreateElection,
          secondsUntilElection: status.secondsUntilElection,
          timeUntilElection: status.timeUntilElection,
        });
        // Don't cache the "next" election since it doesn't exist yet
      } catch (err) {
        logTracker("Failed to track next election %d: %s", electionCount, err);
      }
    }

    logTracker("Tracked %d elections", results.length);
    return results;
  }

  // Election Support

  /**
   * Check Security Council election status and prepare available actions
   *
   * @param options.nomineeGovernorAddress - Override the nominee election governor address
   * @returns Election status with prepared transactions for available actions
   */
  async checkElection(
    options: { nomineeGovernorAddress?: string } = {}
  ): Promise<ElectionCheckResult> {
    const nomineeGovernor = options.nomineeGovernorAddress ?? ADDRESSES.ELECTION_NOMINEE_GOVERNOR;

    logTracker("checkElection for %s", nomineeGovernor);

    const status = await checkElectionStatus(this.l2Provider, this.l1Provider, nomineeGovernor);

    const result: ElectionCheckResult = {
      status,
      canCreate: status.canCreateElection,
      canTriggerMember: false,
      canExecuteMember: false,
      prepared: {},
    };

    if (status.canCreateElection) {
      const { transaction } = prepareElectionCreation(status, nomineeGovernor);
      result.prepared.createElection = transaction;
    }

    if (status.electionCount > 0) {
      const currentElectionIndex = status.electionCount - 1;
      // Use cached tracking for the current election
      const electionStatus = await this.trackElection(currentElectionIndex);

      result.currentElection = electionStatus;
      result.canTriggerMember = electionStatus.canProceedToMemberPhase;
      result.canExecuteMember = electionStatus.canExecuteMember;

      if (electionStatus.canProceedToMemberPhase) {
        const memberTx = await prepareMemberElectionTrigger(electionStatus, this.l2Provider);
        if (memberTx) {
          result.prepared.triggerMember = memberTx;
        }
      }

      if (electionStatus.canExecuteMember) {
        const executeTx = await prepareMemberElectionExecution(electionStatus, this.l2Provider);
        if (executeTx) {
          result.prepared.executeMember = executeTx;
        }
      }
    }

    return result;
  }
}

/**
 * Factory function to create a tracker instance
 */
export function createTracker(options: TrackerOptions): ProposalStageTracker {
  return new ProposalStageTracker(options);
}
