/**
 * Arbitrum Governance Stage Tracking SDK
 *
 * A lightweight, high-performance library for tracking Arbitrum DAO
 * governance proposal lifecycle stages.
 *
 * @example Basic usage (Node.js)
 * ```typescript
 * import { createTracker, findExecutableStage } from "@gzeoneth/gov-tracker";
 *
 * const tracker = createTracker({
 *   l2Provider: new ethers.providers.StaticJsonRpcProvider(ARB1_RPC),
 *   l1Provider: new ethers.providers.StaticJsonRpcProvider(ETH_RPC),
 * });
 *
 * const results = await tracker.trackByTxHash(proposalCreationTxHash);
 * const readyStage = findExecutableStage(results[0].stages);
 * if (readyStage) {
 *   const prep = await tracker.prepareTransaction(readyStage);
 *   if (prep.success) {
 *     const tx = await signer.sendTransaction(prep.prepared);
 *   }
 * }
 * ```
 *
 * @example Browser usage with LocalStorageCache
 * ```typescript
 * import { createTracker, LocalStorageCache } from "@gzeoneth/gov-tracker";
 * import bundledCache from "@gzeoneth/gov-tracker/bundled-cache.json";
 *
 * // Initialize cache with bundled data for faster first load
 * const cache = new LocalStorageCache("arb-gov:");
 * for (const [key, checkpoint] of Object.entries(bundledCache)) {
 *   await cache.set(key, checkpoint);
 * }
 *
 * const tracker = createTracker({
 *   l2Provider: new ethers.providers.StaticJsonRpcProvider(ARB1_RPC),
 *   l1Provider: new ethers.providers.StaticJsonRpcProvider(ETH_RPC),
 *   cache, // Updates persist to localStorage
 * });
 * ```
 * @packageDocumentation
 */

// ============================================================================
// TIER 1: Core Public API
// ============================================================================

// Main entry points
export { ProposalStageTracker, createTracker, extractTimelockLink } from "./tracker";

// All public types (re-exported from types/index.ts)
export type {
  // Core stage types
  StageType,
  StageStatus,
  Chain,
  KnownChain,
  L2Chain,
  ChainId,
  TrackedStage,
  StageTransaction,
  StageTiming,
  StageDataMap,
  TypedTrackedStage,
  // Tracking types
  NextStageHints,
  StageTrackResult,
  TrackingResult,
  TrackingInput,
  GovernorTrackingInput,
  TimelockTrackingInput,
  TrackingCheckpoint,
  TrackerStats,
  TrackingProgress,
  OnProgressCallback,
  // Discovery types
  DiscoveryWatermarks,
  DiscoveryTargets,
  // Execution types
  PreparedTransaction,
  PrepareResult,
  PrepareOptions,
  // Config types
  TrackerOptions,
  CacheAdapter,
  ChunkingConfig,
  // Governor types
  ProposalType,
  GovernorCapability,
  ProposalState,
  ProposalData,
  // Timelock types
  TimelockState,
  TimelockParams,
  TimelockBatchParams,
  CallScheduledData,
  TimelockLink,
  // Stage data types
  ProposalCreatedData,
  VotingActiveData,
  ProposalQueuedData,
  TimelockStageData,
  L2ToL1MessageStageData,
  RetryableStageData,
  // Election types
  CohortType,
  ElectionPhase,
  ElectionProposalStatus,
  ElectionStatus,
  ElectionCheckResult,
  // Calldata decoding types
  DecodingSource,
  DecodedCalldata,
  DecodedParameter,
  RetryableTicketData,
  KnownAddress,
  SignatureEntry,
  // Simulation data types
  SimulationType,
  BaseSimulationData,
  RetryableSimulationData,
  TimelockSimulationData,
  CallSimulationData,
  SimulationData,
  ExtractedSimulation,
} from "./types";

// Type guards
export { isStageType, getStageData, isKnownChain, isL2Chain, isRetryable } from "./types";

// Constants
export {
  ADDRESSES,
  CHAIN_IDS,
  DEFAULT_RPC_URLS,
  CHUNK_SIZES,
  NETWORK_IDS,
  TIMELOCK_SELECTORS,
  isElectionGovernor,
  buildDefaultTargets,
} from "./constants";

// Stage utilities
export {
  findExecutableStage,
  findAllExecutableStages,
  needsAction,
  getTrackingStatusSummary,
  getCurrentStage,
  areAllStagesComplete,
  extractOperationId,
  isTimelockStage,
  findStage,
} from "./stages/utils";

// ============================================================================
// TIER 2: Advanced API - Power user functions
// ============================================================================

// Governor introspection
export {
  detectProposalType,
  isElectionProposal,
  detectGovernorCapabilities,
  getTimelockAddress,
  getProposalState,
  discoverProposalByTxHash,
} from "./discovery/governor-discovery";
export type { DiscoveredProposal } from "./discovery/governor-discovery";

// Timelock introspection
export {
  isKnownL2Timelock,
  isL1Timelock,
  getTimelockOperationState,
  getTimelockState,
  findCallScheduledByTxHash,
} from "./discovery/timelock-discovery";
export type { DiscoveredTimelockOp } from "./discovery/timelock-discovery";

// Security Council
export {
  isSecurityCouncilOperation,
  isSecurityCouncilElectionProposal,
  extractSecurityCouncilParams,
  extractSecurityCouncilParamsForOperation,
  checkVettingPeriod,
} from "./discovery/security-council";
export type {
  SecurityCouncilOperationParams,
  SecurityCouncilBatchParams,
} from "./discovery/security-council";

// Timing utilities
export {
  calculateEta,
  calculateExpectedEta,
  calculateRemainingSeconds,
  estimateTimestampFromBlock,
  getL1BlockNumberFromL2,
  invalidateBlockInfoCache,
  isStageStale,
} from "./utils/timing";

// Salt utilities
export {
  saltFromDescription,
  generateSecurityCouncilSalt,
  decodeL1TimelockSchedule,
} from "./utils/salt-computation";
export type { DecodedTimelockSchedule } from "./utils/salt-computation";

// Operation ID utilities
export {
  validateSalt,
  validateSaltBatch,
  computeAndValidateOperationHash,
  tryFindSalt,
} from "./utils/operation-id";

// ============================================================================
// TIER 3: Execution Preparation
// ============================================================================

// Timelock preparation
export {
  prepareTimelockOperation,
  prepareTimelockBatch,
  prepareTimelockStage,
  calculateRetryableExecutionValue,
  calculateBatchRetryableValues,
} from "./stages/timelock";

// L2→L1 message preparation
export {
  prepareL2ToL1Message,
  prepareL2ToL1MessageStage,
  getL2ToL1Messages,
} from "./stages/l2-to-l1-message";
export type { OutboxPrepareOptions } from "./stages/l2-to-l1-message";

// Retryable preparation
export {
  prepareRetryableRedemption,
  prepareAllRetryables,
  prepareRetryableStage,
} from "./stages/retryables";
export type { RetryablePrepareOptions } from "./stages/retryables";

// Governor queue preparation
export { prepareGovernorQueue } from "./stages/proposal-queued";
export type { GovernorProposalParams } from "./stages/proposal-queued";

// ============================================================================
// TIER 4: Framework Utilities
// ============================================================================

// URL generation
export { getTxUrl, getStageTransactionUrl } from "./constants";

// Stage metadata
export {
  getStageMetadata,
  getAllStageMetadata,
  getActionableStages,
  formatStageTitle,
  getTotalExpectedDuration,
} from "./utils/stage-metadata";
export type { StageMetadata } from "./utils/stage-metadata";

// Address utilities
export { addressEquals, isAddressIn, getChain } from "./utils/chain";
export { chainIdToChain, chainToChainId, getChainDisplayName } from "./types";

// Error classification
export { isGasEstimationError } from "./utils/rpc-utils";

// Security utilities
export {
  truncateDescription,
  sanitizeForDisplay,
  safeJsonParse,
  MAX_DESCRIPTION_LENGTH,
} from "./utils/sanitize";

// ============================================================================
// TIER 5: Election Tracking
// ============================================================================

export {
  checkElectionStatus,
  prepareElectionCreation,
  hasVettingPeriod,
  trackElectionProposal,
  getElectionProposalId,
  getElectionProposalParams,
  getMemberElectionProposalParams,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
  getElectionIndexForProposalId,
  trackAllElections,
  trackIncompleteElections,
  // Detailed election tracking
  getContenders,
  getNomineesWithVotes,
  getExcludedNominees,
  getNomineeElectionDetails,
  getMemberElectionDetails,
} from "./election";
export type { PreparedElectionCreation, ElectionProposalParams } from "./election";

// Checkpoint deduplication helpers
export {
  isSecurityCouncilTimelockOp,
  linkCheckpointToChild,
  getParentCheckpoint,
  isChildCheckpoint,
  filterChildCheckpoints,
  getChildToParentMap,
  getChildCheckpoints,
  getDeduplicationStats,
  findPotentialParent,
  autoLinkOrphanedCheckpoints,
} from "./deduplication";
export type { DeduplicationStats } from "./deduplication";

// ============================================================================
// TIER 6: Calldata Decoding
// ============================================================================

export {
  // Main decoder
  decodeCalldata,
  decodeCalldataArray,
  // Signature lookup
  lookupSignature,
  lookupLocalSignature,
  LookupSignatureOptions,
  // Parameter utilities
  parseParamTypes,
  isLikelyCalldata,
  formatDecodedValue,
  // Address utilities
  getAddressLabel,
  // Retryable ticket
  isRetryableTicketMagic,
  decodeRetryableTicket,
  getRetryableChainName,
  RETRYABLE_TICKET_MAGIC,
} from "./calldata";

// ============================================================================
// TIER 7: Simulation Data Preparation
// ============================================================================

export {
  prepareRetryableSimulation,
  prepareTimelockSimulation,
  prepareCallSimulation,
  extractAllSimulationsFromDecoded,
} from "./simulation";

// ============================================================================
// TIER 8: Cache Implementations
// ============================================================================

export { FileCache, LocalStorageCache, MemoryCache, getBundledCachePath } from "./tracker/cache";

// ============================================================================
// TIER 9: Internal Utilities (for testing)
// ============================================================================

export { createCheckpoint, createTrackingState } from "./tracker/state";
