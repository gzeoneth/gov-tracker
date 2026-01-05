/**
 * ProposalStageTracker - Main entry point
 *
 * Tracks Arbitrum governance proposal lifecycle stages from
 * either a governor proposal or a timelock operation.
 *
 * This file is the public API that composes focused modules:
 * - tracker/context.ts: Functional TrackingContext for stage tracking
 * - tracker/pipeline.ts: Pure functions that track stages
 * - tracker/discovery.ts: Proposal and timelock discovery
 * - tracker/query.ts: Checkpoint query operations
 * - tracker/execute.ts: Transaction preparation
 */

import { ethers } from "ethers";
import { loggers } from "./utils/logger";
import {
  TrackerOptions,
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
  TimelockLink,
} from "./types";
import { DEFAULT_CHUNKING_CONFIG, ADDRESSES, DEFAULT_RPC_URLS } from "./constants";
import {
  checkElectionStatus,
  prepareElectionCreation,
  trackElectionProposal,
  prepareMemberElectionTrigger,
} from "./election";
import { discoverProposalByTxHash } from "./discovery/governor-discovery";
import { findCallScheduledByTxHash } from "./discovery/timelock-discovery";
import { findStage } from "./stages/base";

const { tracker: logTracker, discovery: logDiscovery } = loggers;

// Import context and pipeline from tracker modules
import {
  createTrackingContext,
  isComplete,
  getProposalType,
  getProposalData,
  getProposalState,
  getIsElection,
  createCheckpoint,
  TrackingContext,
} from "./tracker/context";
import { trackGovernorPipeline, trackTimelockPipeline } from "./tracker/pipeline";

// Import from focused modules
import { txHashCacheKey, readCacheStatus, FileCache } from "./tracker/state";
import { loadWatermarks, saveWatermarks } from "./tracker/discovery";
import { CacheAdapter } from "./types";
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

  if (!queuedStage || queuedStage.status !== "COMPLETED") {
    return undefined;
  }

  const txHash = queuedStage.transactions[0]?.hash;
  const operationId = queuedStage.data.operationId as string | undefined;
  const timelockAddress = queuedStage.data.timelockAddress as string | undefined;
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
 *   l2Provider: new ethers.providers.JsonRpcProvider(ARB1_RPC),
 *   l1Provider: new ethers.providers.JsonRpcProvider(ETH_RPC),
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
    this.l2Provider =
      options.l2Provider ?? new ethers.providers.JsonRpcProvider(DEFAULT_RPC_URLS.ARB_ONE);
    this.novaProvider =
      options.novaProvider ?? new ethers.providers.JsonRpcProvider(DEFAULT_RPC_URLS.NOVA);
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
  }> {
    return readCacheStatus(cachePath);
  }

  // Watermark Management

  /**
   * Load discovery watermarks from cache.
   * Watermarks are stored as a TrackingCheckpoint for unified cache format.
   * Returns empty object if no watermarks are cached.
   */
  async loadWatermarks(): Promise<DiscoveryWatermarks> {
    return loadWatermarks(this.cache);
  }

  /**
   * Save discovery watermarks to cache.
   * Watermarks are stored as TrackingCheckpoint with proper metadata,
   * following the same pattern as proposal/timelock checkpoints.
   */
  async saveWatermarks(watermarks: DiscoveryWatermarks): Promise<void> {
    return saveWatermarks(watermarks, this.cache);
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
   * - Loads watermarks from cache (or uses provided fromWatermarks)
   * - Discovers from all enabled targets in parallel
   * - Auto-saves updated watermarks to cache
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
    // Load watermarks from cache (or use provided override)
    const watermarks = fromWatermarks ?? (await this.loadWatermarks());

    const result = await discoverAllInternal(
      targets,
      toBlock,
      this.l2Provider,
      this.cache,
      watermarks,
      { chunkSize: this.chunkingConfig.l2ChunkSize }
    );

    // Auto-save updated watermarks
    await this.saveWatermarks(result.watermarks);

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
      if (this.cache) {
        const input: GovernorTrackingInput = {
          type: "governor",
          governorAddress: "",
          proposalId: "",
          creationTxHash: txHash,
        };
        const prevErrorCount = checkpoint?.metadata?.errorCount ?? 0;
        const errorCheckpoint: TrackingCheckpoint = checkpoint ?? {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 0, l2: 0 },
          cachedData: {},
        };
        errorCheckpoint.metadata = { errorCount: prevErrorCount + 1, lastTrackedAt: Date.now() };
        await this.cache.set(cacheKey, errorCheckpoint);
        logTracker("saved checkpoint on error: %s (errorCount=%d)", cacheKey, prevErrorCount + 1);
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
   * Track governor proposal using TrackingContext (stateful tracking)
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
    const initialState = createTrackingContext({
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

    // Save checkpoint to cache
    if (this.cache && cacheKey) {
      result.checkpoint.metadata = { errorCount: 0, lastTrackedAt: Date.now() };
      await this.cache.set(cacheKey, result.checkpoint);
      logTracker("saved checkpoint to cache: %s", cacheKey);
    }

    return result;
  }

  /**
   * Track timelock operation using TrackingContext (stateful tracking)
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
    const initialState = createTrackingContext({
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
   * Build TrackingResult from TrackingContext
   */
  private buildResultFromState(state: TrackingContext): TrackingResult {
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
      prepared: {},
    };

    if (status.canCreateElection) {
      const { transaction } = prepareElectionCreation(status, nomineeGovernor);
      result.prepared.createElection = transaction;
    }

    if (status.electionCount > 0) {
      const currentElectionIndex = status.electionCount - 1;
      const electionStatus = await trackElectionProposal(
        currentElectionIndex,
        this.l2Provider,
        this.l1Provider
      );

      result.currentElection = electionStatus;
      result.canTriggerMember = electionStatus.canProceedToMemberPhase;

      if (electionStatus.canProceedToMemberPhase) {
        const memberTx = await prepareMemberElectionTrigger(electionStatus, this.l2Provider);
        if (memberTx) {
          result.prepared.triggerMember = memberTx;
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
