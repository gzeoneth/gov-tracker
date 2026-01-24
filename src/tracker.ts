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
import { isGasEstimationError, getErrorMessage } from "./utils/rpc-utils";
import { getCurrentBlockInfo } from "./utils/timing";
import {
  incrementErrorCount,
  createCheckpointMetadata,
  txHashCacheKey,
  timelockOpCacheKey,
} from "./tracker/checkpoint-helpers";
import {
  TrackerOptions,
  ProviderOrUrl,
  TrackingResult,
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

// Import context and pipeline from tracker modules
import {
  createTrackingState,
  isComplete,
  getProposalType,
  getProposalData,
  getProposalState,
  getIsElection,
  createCheckpoint,
  createModularCheckpoints,
  setTimelockOpKey,
  TrackingState,
  getElectionIndex,
  getNomineeProposalId,
  getMemberProposalId,
  getElectionCohort,
  getCompliantNomineeCount,
  getTargetNomineeCount,
  getVettingDeadline,
  getElectionTimelockOperationId,
  getOperationId,
} from "./tracker/state";
import {
  trackGovernorPipeline,
  trackTimelockPipeline,
  trackElectionPipeline,
} from "./tracker/pipeline";
import { ElectionTrackingInput, NomineeElectionData, MemberElectionData } from "./types";
import { determineElectionPhase } from "./election/status";
import { TIMING } from "./constants";

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
  getHighestScNonceFromCheckpoints as getHighestScNonceFromCheckpointsInternal,
} from "./tracker/query";
import { prepareTransaction as prepareTransactionInternal } from "./tracker/execute";

/**
 * Build ElectionProposalStatus from TrackingState.
 * This bridges the unified pipeline approach with the existing election API.
 */
function buildElectionStatusFromState(state: TrackingState): ElectionProposalStatus {
  // Extract basic state with defaults
  const electionIndex = getElectionIndex(state) ?? 0;
  const nomineeProposalId = getNomineeProposalId(state) ?? null;
  const memberProposalId = getMemberProposalId(state) ?? null;
  const cohort = getElectionCohort(state) ?? 0;
  const compliantNomineeCount = getCompliantNomineeCount(state) ?? 0;
  const targetNomineeCount =
    getTargetNomineeCount(state) ?? TIMING.SECURITY_COUNCIL_TARGET_NOMINEES;
  const vettingDeadline = getVettingDeadline(state) ?? null;

  // Stage lookups (typed for data access)
  const createStage = findStage(state.stages, "CREATE_ELECTION");
  const nomineeStage = findStage(state.stages, "NOMINEE_ELECTION");
  const vettingStage = findStage(state.stages, "NOMINEE_VETTING");
  const memberStage = findStage(state.stages, "MEMBER_ELECTION");

  // Extract proposal states from typed stages
  const nomineeProposalState =
    ((nomineeStage?.data as NomineeElectionData | undefined)
      ?.proposalState as ElectionProposalStatus["nomineeProposalState"]) ?? null;
  const memberProposalState =
    ((memberStage?.data as MemberElectionData | undefined)
      ?.proposalState as ElectionProposalStatus["memberProposalState"]) ?? null;

  const isInVettingPeriod = vettingStage?.status === "PENDING";

  // Determine failure from any failed stage using Map for O(1) lookup
  const stageFailureReasons = new Map<TrackedStage | undefined, string>([
    [nomineeStage, "Nominee election failed"],
    [vettingStage, "Not enough compliant nominees"],
    [memberStage, "Member election failed"],
  ]);
  const failedStage = [nomineeStage, vettingStage, memberStage].find((s) => s?.status === "FAILED");
  const failureReason = failedStage ? stageFailureReasons.get(failedStage) : undefined;

  return {
    electionIndex,
    phase: determineElectionPhase(
      nomineeProposalState,
      memberProposalId,
      memberProposalState,
      isInVettingPeriod
    ),
    cohort,
    nomineeProposalId,
    memberProposalId,
    nomineeProposalState,
    memberProposalState,
    compliantNomineeCount,
    targetNomineeCount,
    vettingDeadline,
    isInVettingPeriod,
    canProceedToMemberPhase: vettingStage?.status === "READY",
    canExecuteMember: memberStage?.status === "READY",
    stages: state.stages,
    isFailed: failedStage ? true : undefined,
    failureReason,
    timelockOperationId: getElectionTimelockOperationId(state),
    creationTxHash: createStage?.transactions?.[0]?.hash,
    nomineeExecuteTxHash: vettingStage?.transactions?.[0]?.hash,
    memberExecuteTxHash: memberStage?.transactions?.find((t) => t.description === "executed")?.hash,
  };
}

/**
 * Extract TimelockLink from stages if PROPOSAL_QUEUED is completed
 */
export function extractTimelockLink(stages: TrackedStage[]): TimelockLink | undefined {
  const queuedStage = findStage(stages, "PROPOSAL_QUEUED");
  if (queuedStage?.status !== "COMPLETED" || queuedStage.type !== "PROPOSAL_QUEUED") {
    return undefined;
  }

  const tx = queuedStage.transactions[0];
  const { operationId, timelockAddress } = queuedStage.data;

  return tx?.hash && operationId && timelockAddress && tx.blockNumber
    ? { txHash: tx.hash, operationId, timelockAddress, queueBlockNumber: tx.blockNumber }
    : undefined;
}

/**
 * Resolve a provider option that can be either a Provider instance or an RPC URL string.
 * If undefined and a default URL is provided, creates a provider from the default.
 */
function resolveProvider(
  providerOrUrl: ProviderOrUrl | undefined,
  defaultUrl?: string
): ethers.providers.Provider {
  if (!providerOrUrl) {
    if (!defaultUrl) {
      throw new Error("Provider or RPC URL is required");
    }
    return new ethers.providers.StaticJsonRpcProvider(defaultUrl);
  }

  if (typeof providerOrUrl === "string") {
    return new ethers.providers.StaticJsonRpcProvider(providerOrUrl);
  }

  return providerOrUrl;
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
    this.l1Provider = resolveProvider(options.l1Provider);
    this.l2Provider = resolveProvider(options.l2Provider, DEFAULT_RPC_URLS.ARB_ONE);
    this.novaProvider = resolveProvider(options.novaProvider, DEFAULT_RPC_URLS.NOVA);

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

  /**
   * Clear all cache entries for a transaction.
   * This clears both the base tx key and any operation-specific keys (tx:{hash}:op:{opId}).
   * Used by CLI --force to ensure fresh tracking of all operations in a tx.
   */
  async clearTxCacheEntries(txHash: string): Promise<number> {
    if (!this.cache) return 0;

    const baseCacheKey = txHashCacheKey(txHash);
    const prefix = `${baseCacheKey}:op:`;
    let cleared = 0;

    // Clear the base tx key
    if (await this.cache.has(baseCacheKey)) {
      await this.cache.delete(baseCacheKey);
      logTracker("cleared cache entry: %s", baseCacheKey);
      cleared++;
    }

    // Clear all operation-specific keys for this tx in parallel
    const allKeys = await this.cache.keys(prefix);
    const keys = Array.isArray(allKeys) ? allKeys : Array.from(allKeys as Iterable<string>);
    const keysToDelete = keys.filter((key) => key.startsWith(prefix));

    await Promise.all(
      keysToDelete.map(async (key) => {
        await this.cache!.delete(key);
        logTracker("cleared cache entry: %s", key);
      })
    );
    cleared += keysToDelete.length;

    return cleared;
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
   * @param electionStatus - Election status from trackElection()
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

  /**
   * Get the highest Security Council nonce from incomplete checkpoints.
   *
   * Used to determine if lower-nonce SC operations should be skipped
   * (superseded by higher nonce operations).
   *
   * @returns The highest SC nonce found, or null if no SC operations exist
   */
  async getHighestScNonce(): Promise<import("ethers").BigNumber | null> {
    return getHighestScNonceFromCheckpointsInternal(this.cache);
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
   * @param txHash - Transaction hash to track
   * @param operationId - Optional: track only this specific timelock operation
   *
   * @example
   * ```typescript
   * // Track all operations in a transaction
   * const results = await tracker.trackByTxHash("0x...");
   *
   * // Track a specific operation
   * const results = await tracker.trackByTxHash("0x...", "0xoperationId...");
   * ```
   */
  async trackByTxHash(txHash: string, operationId?: string): Promise<TrackingResult[]> {
    logTracker("trackByTxHash %s%s", txHash, operationId ? ` operationId=${operationId}` : "");

    // Determine cache key based on whether operationId is provided
    // - Governor proposals and timelock discovery: tx:{txHash}
    // - Specific timelock operation: tx:{txHash}:op:{operationId}
    const baseCacheKey = txHashCacheKey(txHash);

    // Load checkpoint from cache for resume
    let checkpoint: TrackingCheckpoint | undefined;
    if (this.cache) {
      // If operationId provided, try operation-specific key first
      if (operationId) {
        const opCacheKey = timelockOpCacheKey(txHash, operationId);
        checkpoint = (await this.cache.get<TrackingCheckpoint>(opCacheKey)) ?? undefined;
        if (checkpoint) {
          logTracker("loaded checkpoint from cache: %s", opCacheKey);
        }
      }
      // Fall back to base cache key (governor proposals or pre-modular cache entries)
      if (!checkpoint) {
        checkpoint = (await this.cache.get<TrackingCheckpoint>(baseCacheKey)) ?? undefined;
        if (checkpoint) {
          logTracker("loaded checkpoint from cache: %s", baseCacheKey);
        }
      }
    }

    try {
      return await this.trackByTxHashInternal(txHash, baseCacheKey, checkpoint, operationId);
    } catch (error) {
      // Save checkpoint on error with incremented error count
      // Gas estimation errors don't count against consecutive errors
      if (this.cache) {
        const prevErrorCount = checkpoint?.metadata?.errorCount ?? 0;
        const newErrorCount = incrementErrorCount(prevErrorCount, error as Error);
        const isGasError = isGasEstimationError(error);

        // Use operation-specific key for timelock errors if operationId is known
        const errorCacheKey = operationId ? timelockOpCacheKey(txHash, operationId) : baseCacheKey;
        const input: GovernorTrackingInput | TimelockTrackingInput = operationId
          ? { type: "timelock", timelockAddress: "", operationId, scheduledTxHash: txHash }
          : { type: "governor", governorAddress: "", proposalId: "", creationTxHash: txHash };

        const errorCheckpoint: TrackingCheckpoint = checkpoint ?? {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 0, l2: 0 },
          cachedData: {},
        };
        errorCheckpoint.metadata = createCheckpointMetadata(newErrorCount);
        await this.cache.set(errorCacheKey, errorCheckpoint);
        logTracker(
          "saved checkpoint on error: %s (errorCount=%d%s)",
          errorCacheKey,
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
    baseCacheKey: string,
    checkpoint: TrackingCheckpoint | undefined,
    operationId?: string
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
          baseCacheKey
        );
        return [result];
      } else if (checkpoint.input.type === "timelock") {
        const input = checkpoint.input;
        const opCacheKey = timelockOpCacheKey(txHash, input.operationId);
        const result = await this.trackTimelockWithPipeline(
          input.timelockAddress,
          input.operationId,
          input.scheduledTxHash,
          checkpoint,
          opCacheKey
        );
        return [result];
      }
    }

    // Try as proposal first (only if no operationId specified)
    if (!operationId) {
      const proposal = await discoverProposalByTxHash(txHash, this.l2Provider);
      if (proposal) {
        logDiscovery("found proposal in tx, proposalId=%s", proposal.proposalId);
        const result = await this.trackGovernorWithPipeline(
          proposal.governorAddress,
          proposal.proposalId,
          proposal.creationTxHash,
          checkpoint,
          baseCacheKey
        );
        return [result];
      }
    }

    // Try as timelock operations
    const callScheduledEvents = await findCallScheduledByTxHash(txHash, this.l2Provider);
    if (callScheduledEvents && callScheduledEvents.length > 0) {
      logDiscovery("found %d timelock operation(s) in tx", callScheduledEvents.length);

      // Group by unique operationId (batch operations have multiple calls with same operationId)
      const seenOperationIds = new Set<string>();
      const results: TrackingResult[] = [];

      for (const event of callScheduledEvents) {
        // Skip if we've already seen this operationId (batch deduplication)
        if (seenOperationIds.has(event.operationId)) continue;
        seenOperationIds.add(event.operationId);

        // If specific operationId requested, skip non-matching operations
        if (operationId && event.operationId.toLowerCase() !== operationId.toLowerCase()) continue;

        // Use operation-specific cache key for each timelock operation
        const opCacheKey = timelockOpCacheKey(txHash, event.operationId);

        // Load operation-specific checkpoint if not already loaded
        let opCheckpoint = checkpoint;
        if (this.cache && !opCheckpoint) {
          opCheckpoint = (await this.cache.get<TrackingCheckpoint>(opCacheKey)) ?? undefined;
          if (opCheckpoint) {
            logTracker("loaded operation checkpoint from cache: %s", opCacheKey);
          }
        }

        const result = await this.trackTimelockWithPipeline(
          event.timelockAddress,
          event.operationId,
          txHash,
          opCheckpoint,
          opCacheKey,
          event
        );
        results.push(result);

        // If specific operationId requested and found, we're done
        if (operationId) break;
      }

      return results;
    }

    logTracker("no proposal or timelock operations found in tx");
    return [];
  }

  // ============================================================================
  // Unified Pipeline Tracking
  // ============================================================================

  /**
   * Unified pipeline tracking method.
   * Handles all common tracking patterns: state creation, pipeline execution,
   * checkpoint management, and timelockOpKey derivation.
   */
  private async runTrackingPipeline(config: {
    input: GovernorTrackingInput | TimelockTrackingInput | ElectionTrackingInput;
    checkpoint?: TrackingCheckpoint;
    cacheKey: string;
    pipeline: (state: TrackingState) => Promise<TrackingState>;
    loadLinkedTimelock: boolean;
    modularCaching: boolean;
    skipCaching?: boolean;
    callScheduledData?: import("./types").CallScheduledData[];
    timelockKeySource?: {
      stageType: "PROPOSAL_QUEUED" | "MEMBER_ELECTION";
      txDescription: "queued" | "executed";
    };
  }): Promise<TrackingState> {
    // Load linked timelock checkpoint if configured and available
    let linkedTimelockCheckpoint: TrackingCheckpoint | undefined;
    if (config.loadLinkedTimelock && this.cache && config.checkpoint?.metadata?.timelockOpKey) {
      linkedTimelockCheckpoint =
        (await this.cache.get<TrackingCheckpoint>(config.checkpoint.metadata.timelockOpKey)) ??
        undefined;
      if (linkedTimelockCheckpoint) {
        logTracker(
          "loaded linked timelock checkpoint: %s",
          config.checkpoint.metadata.timelockOpKey
        );
      }
    }

    // Create tracking state
    const initialState = createTrackingState({
      providers: {
        l2: this.l2Provider,
        l1: this.l1Provider,
        nova: this.novaProvider,
      },
      input: config.input,
      onProgress: this.onProgress,
      chunkingConfig: this.chunkingConfig,
      checkpoint: config.checkpoint,
      linkedTimelockCheckpoint,
      cacheKey: config.cacheKey,
      callScheduledData: config.callScheduledData,
    });

    // Run the pipeline
    let finalState = await config.pipeline(initialState);

    // Derive and set timelockOpKey if configured
    if (config.timelockKeySource && !finalState.timelockOpKey) {
      const { stageType, txDescription } = config.timelockKeySource;
      const operationId =
        stageType === "MEMBER_ELECTION"
          ? getElectionTimelockOperationId(finalState)
          : getOperationId(finalState);
      const stage = finalState.stages.find((s) => s.type === stageType);
      const txHash = stage?.transactions?.find((t) => t.description === txDescription)?.hash;
      if (operationId && txHash) {
        const timelockOpKey = timelockOpCacheKey(txHash, operationId);
        finalState = setTimelockOpKey(finalState, timelockOpKey);
      }
    }

    // Save checkpoints (unless caller handles caching)
    if (!config.skipCaching && this.cache && config.cacheKey) {
      if (config.modularCaching) {
        await this.saveModularCheckpoints(finalState, config.cacheKey);
      } else {
        const checkpoint = createCheckpoint(finalState);
        checkpoint.metadata = { errorCount: 0, lastTrackedAt: Date.now() };
        await this.cache.set(config.cacheKey, checkpoint);
        logTracker("saved checkpoint to cache: %s", config.cacheKey);
      }
    }

    return finalState;
  }

  /**
   * Track governor proposal using TrackingState (stateful tracking)
   * Uses modular caching: parent stages saved separately from timelock stages.
   */
  private async trackGovernorWithPipeline(
    governorAddress: string,
    proposalId: string,
    creationTxHash: string,
    checkpoint: TrackingCheckpoint | undefined,
    cacheKey: string
  ): Promise<TrackingResult> {
    // Run unified pipeline (with skipCaching - we handle election case specially)
    const finalState = await this.runTrackingPipeline({
      input: { type: "governor", governorAddress, proposalId, creationTxHash },
      checkpoint,
      cacheKey,
      pipeline: trackGovernorPipeline,
      loadLinkedTimelock: true,
      modularCaching: true,
      skipCaching: true,
      timelockKeySource: { stageType: "PROPOSAL_QUEUED", txDescription: "queued" },
    });

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
      logTracker("election tracking failed, saving tx:* checkpoint for retry");
    }

    // Save checkpoints using modular caching
    if (this.cache && cacheKey) {
      await this.saveModularCheckpoints(finalState, cacheKey);
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
    // Run unified pipeline
    const finalState = await this.runTrackingPipeline({
      input: { type: "timelock", timelockAddress, operationId, scheduledTxHash },
      checkpoint,
      cacheKey,
      pipeline: trackTimelockPipeline,
      loadLinkedTimelock: false,
      modularCaching: false,
      callScheduledData: callScheduledEvent ? [callScheduledEvent] : undefined,
    });

    return this.buildResultFromState(finalState);
  }

  /**
   * Track election using TrackingState (stateful tracking)
   *
   * This is the unified pipeline version that tracks elections through the
   * same stage-based approach as proposals and timelock operations.
   * Uses modular caching: election stages saved separately from timelock stages.
   */
  private async trackElectionWithPipeline(
    electionIndex: number,
    checkpoint: TrackingCheckpoint | undefined,
    cacheKey: string
  ): Promise<{ status: ElectionProposalStatus; finalState: TrackingState }> {
    // Run unified pipeline (caller handles caching)
    const finalState = await this.runTrackingPipeline({
      input: { type: "election", electionIndex },
      checkpoint,
      cacheKey,
      pipeline: trackElectionPipeline,
      loadLinkedTimelock: true,
      modularCaching: true,
      skipCaching: true,
      timelockKeySource: { stageType: "MEMBER_ELECTION", txDescription: "executed" },
    });

    return { status: buildElectionStatusFromState(finalState), finalState };
  }

  /**
   * Save checkpoints using modular caching.
   * Saves parent stages and timelock stages in separate checkpoints.
   */
  private async saveModularCheckpoints(
    state: TrackingState,
    parentCacheKey: string
  ): Promise<void> {
    if (!this.cache) return;

    const { parentCheckpoint, timelockCheckpoint, timelockOpKey } = createModularCheckpoints(
      state,
      parentCacheKey
    );

    // Save parent checkpoint
    await this.cache.set(parentCacheKey, parentCheckpoint);
    logTracker("saved parent checkpoint: %s", parentCacheKey);

    // Save timelock checkpoint if we have one
    if (timelockCheckpoint && timelockOpKey) {
      await this.cache.set(timelockOpKey, timelockCheckpoint);
      logTracker("saved linked timelock checkpoint: %s", timelockOpKey);
    }
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
    const { input } = checkpoint;

    const trackAndWarn = async (txHash: string, entityType: string): Promise<TrackingResult> => {
      const results = await this.trackByTxHash(txHash);
      if (results.length === 0) {
        throw new Error(`No ${entityType} found in tx ${txHash}`);
      }
      if (results.length > 1) {
        logTracker(
          "WARNING: trackFromCheckpoint found %d results in tx %s, returning first only. " +
            "Use trackByTxHash() to get all results.",
          results.length,
          txHash
        );
      }
      return results[0];
    };

    if (input.type === "governor") {
      if (!input.creationTxHash) throw new Error("Governor checkpoint missing creationTxHash");
      return trackAndWarn(input.creationTxHash, "proposal");
    }
    if (input.type === "timelock") {
      if (!input.scheduledTxHash) throw new Error("Timelock checkpoint missing scheduledTxHash");
      return trackAndWarn(input.scheduledTxHash, "timelock operation");
    }
    throw new Error(`Unsupported checkpoint input type: ${(input as { type: string }).type}`);
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
   * then tracks the full election lifecycle using the unified pipeline.
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
      // Use unified pipeline via trackElection
      return this.trackElection(electionIndex);
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
   * To force fresh tracking, clear the cache before calling this method.
   *
   * @param electionIndex - Election index (0-based)
   * @returns Election status
   */
  async trackElection(electionIndex: number): Promise<ElectionProposalStatus> {
    logTracker("trackElection for index %d", electionIndex);

    const cacheKey = `election:${electionIndex}`;

    // Check cache first for completed elections (skip RPC calls)
    if (this.cache) {
      const cached = await this.getElectionCheckpoint(electionIndex);
      if (cached && cached.status.phase === "COMPLETED") {
        logTracker("returning cached COMPLETED election %d (0 RPC calls)", electionIndex);
        return cached.status;
      }
    }

    // Load checkpoint from cache for resume
    let checkpoint: TrackingCheckpoint | undefined;
    if (this.cache) {
      checkpoint = (await this.cache.get<TrackingCheckpoint>(cacheKey)) ?? undefined;
      if (checkpoint) {
        logTracker("loaded election checkpoint from cache: %s", cacheKey);
      }
    }

    // Track using the unified pipeline
    const { status, finalState } = await this.trackElectionWithPipeline(
      electionIndex,
      checkpoint,
      cacheKey
    );

    // Save checkpoints using modular caching
    if (this.cache) {
      await this.saveModularCheckpoints(finalState, cacheKey);
      // Also save election-specific data
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
   * To force fresh tracking, clear the cache before calling this method.
   *
   * @param options.includeNext - Include the "next" election slot (default: true)
   * @returns Array of election statuses
   */
  async trackAllElections(
    options: { includeNext?: boolean } = {}
  ): Promise<ElectionProposalStatus[]> {
    logTracker("trackAllElections (includeNext=%s)", options.includeNext ?? true);

    const status = await checkElectionStatus(this.l2Provider, this.l1Provider);
    const electionCount = status.electionCount;
    const results: ElectionProposalStatus[] = [];

    // Track existing elections in parallel (indices 0 to electionCount-1)
    const electionPromises = Array.from({ length: electionCount }, (_, i) =>
      this.trackElection(i).catch((err) => {
        logTracker("Failed to track election %d: %s", i, getErrorMessage(err));
        return null;
      })
    );
    const electionResults = await Promise.all(electionPromises);
    for (const result of electionResults) {
      if (result) results.push(result);
    }

    // Optionally track the next election (not yet created) for createElection preparation
    if (options.includeNext ?? true) {
      try {
        // Next election won't have cache data since it doesn't exist yet
        const nextElectionStatus = await this.trackElection(electionCount);
        results.push({
          ...nextElectionStatus,
          canCreateElection: status.canCreateElection,
          secondsUntilElection: status.secondsUntilElection,
          timeUntilElection: status.timeUntilElection,
        });
        // Don't cache the "next" election since it doesn't exist yet
      } catch (err) {
        logTracker("Failed to track next election %d: %s", electionCount, getErrorMessage(err));
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
