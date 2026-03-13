/**
 * Arbitrum Governance Stage Tracking SDK
 *
 * A lightweight, high-performance library for tracking Arbitrum DAO
 * governance proposal lifecycle stages.
 *
 * @example Basic usage with RPC URLs
 * ```typescript
 * import { createTracker, findExecutableStage } from "@gzeoneth/gov-tracker";
 *
 * // Accepts RPC URLs directly (creates providers internally)
 * const tracker = createTracker({
 *   l2Provider: "https://arb1.arbitrum.io/rpc",
 *   l1Provider: "https://eth.llamarpc.com",
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
 * import { createTracker, LocalStorageCache, extractProposals } from "@gzeoneth/gov-tracker";
 * import bundledCache from "@gzeoneth/gov-tracker/bundled-cache.json";
 *
 * // Extract typed data from bundled cache
 * const proposals = extractProposals(bundledCache);
 * console.log(`Loaded ${proposals.length} proposals from cache`);
 *
 * // Initialize cache with bundled data for faster first load
 * const cache = new LocalStorageCache("arb-gov:");
 * for (const [key, checkpoint] of Object.entries(bundledCache)) {
 *   await cache.set(key, checkpoint);
 * }
 *
 * const tracker = createTracker({
 *   l2Provider: "https://arb1.arbitrum.io/rpc",
 *   l1Provider: "https://eth.llamarpc.com",
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
  ProviderOrUrl,
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
  // Election participant types
  ElectionContender,
  ElectionNominee,
  MemberElectionNominee,
  // Election detail aggregates
  NomineeElectionDetails,
  MemberElectionDetails,
  // Serializable types for caching
  SerializableContender,
  SerializableNominee,
  SerializableMemberNominee,
  SerializableNomineeDetails,
  SerializableMemberDetails,
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
  VOTE_SUPPORT,
  PROPOSAL_STATE,
  PROPOSAL_STATE_MAP,
  PROPOSAL_STATE_LABEL,
} from "./constants";
export type { VoteSupport } from "./constants";

// ABIs — human-readable format (ethers v5 compatible, `as const` for abitype)
export {
  GOVERNOR_ABI,
  GOVERNOR_WITH_VETTER_ABI,
  TIMELOCK_ABI,
  NOMINEE_ELECTION_GOVERNOR_ABI,
  MEMBER_ELECTION_GOVERNOR_ABI,
  SECURITY_COUNCIL_MANAGER_ABI,
  ERC20_VOTES_ABI,
} from "./abis";

// ABIs — JSON format for wagmi/viem (full useReadContract/useWriteContract type inference)
export {
  // Full ABIs
  governorAbi,
  governorWithVetterAbi,
  timelockAbi,
  securityCouncilManagerAbi,
  inboxAbi,
  nomineeElectionGovernorAbi,
  memberElectionGovernorAbi,
  erc20VotesAbi,
  // Curated read/write subsets (use when full ABI exceeds viem type inference limits)
  governorReadAbi,
  governorWriteAbi,
  nomineeElectionGovernorReadAbi,
  nomineeElectionGovernorWriteAbi,
  memberElectionGovernorReadAbi,
  memberElectionGovernorWriteAbi,
  timelockReadAbi,
  timelockWriteAbi,
} from "./abis-json";

// Stage utilities
export {
  findExecutableStage,
  findAllExecutableStages,
  needsAction,
  getTrackingStatusSummary,
  getLifecyclePhase,
  getCurrentStage,
  areAllStagesComplete,
  extractOperationId,
  isTimelockStage,
  isConstitutional,
  findStage,
  // Stage merging utilities
  mergeStages,
  normalizeTimeline,
  splitStages,
} from "./stages/utils";
export type { LifecyclePhase } from "./stages/utils";

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
  extractAllSecurityCouncilParams,
  checkVettingPeriod,
  // SC nonce deduplication utilities
  getHighestScNonce,
  isScOperationSuperseded,
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
  hashOperation,
  hashOperationBatch,
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
  prepareExecuteTimelock,
  prepareTimelockExecuteCalldata,
  prepareTimelockBatchCalldata,
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

// URL generation and constants
export {
  getTxUrl,
  getStageTransactionUrl,
  GOVERNANCE_START_BLOCKS,
  ELECTION_TIMING,
} from "./constants";

// Stage metadata
export {
  getStageMetadata,
  formatStageTitle,
  getAllStageMetadata,
  ALL_STAGE_TYPES,
} from "./utils/stage-metadata";
export type { StageMetadata } from "./utils/stage-metadata";

// Chain and address utilities
export { addressEquals, isAddressIn, getChain, compareBigNumbers } from "./utils/chain";
export { chainIdToChain, chainToChainId, getChainDisplayName } from "./types";

// Error classification and RPC utilities
export {
  isGasEstimationError,
  isPermanentError,
  isRetryableError,
  getErrorMessage,
  queryWithRetry,
} from "./utils/rpc-utils";

// Security utilities
export {
  truncateDescription,
  sanitizeForDisplay,
  safeJsonParse,
  MAX_DESCRIPTION_LENGTH,
} from "./utils/sanitize";

// Display formatting utilities
export {
  wrapText,
  truncate,
  safeStringify,
  formatValue,
  formatDate,
  type StageDataItem,
  formatStageData,
  getTxHash,
  getProposalIdDisplay,
  type FormattedLine,
  formatDecodedCalldata,
  filterVisibleLines,
} from "./utils/formatters";

// ============================================================================
// TIER 5: Election Tracking
// ============================================================================

export {
  // Election status
  getElectionCount,
  checkElectionStatus,
  hasVettingPeriod,
  // Election tracking utilities
  getElectionIndexForProposalId,
  // Election proposal IDs
  getElectionProposalId,
  getElectionProposalParams,
  getMemberElectionProposalParams,
  // Election preparation
  prepareElectionCreation,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
  // Detailed election tracking
  getContenders,
  getNomineesWithVotes,
  getExcludedNominees,
  getNomineeElectionDetails,
  getMemberElectionDetails,
  // Election details serialization
  serializeNomineeDetails,
  serializeMemberDetails,
  // Election write actions (prepare-only)
  encodeElectionVoteParams,
  decodeElectionVoteParams,
  getAddContenderTypedData,
  prepareAddContender,
  prepareContenderRegistration,
  prepareNomineeElectionVote,
  prepareMemberElectionVote,
} from "./election";
export type {
  PreparedElectionCreation,
  ElectionProposalParams,
  AddContenderTypedData,
  PreparedContenderRegistration,
} from "./election";

// ============================================================================
// TIER 5b: Governance Write Actions
// ============================================================================

export {
  prepareCastVote,
  prepareCastVoteWithReason,
  prepareCastVoteWithReasonAndParams,
} from "./governance";
export type { GovernorTarget } from "./governance";

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
  extractSimulationsByActionIndex,
  // Tenderly payload builders (dependency-free)
  buildTenderlySimRequest,
  buildTenderlyEncodeStatesRequest,
} from "./simulation";
export type {
  IndexedSimulation,
  TenderlySimRequest,
  TenderlyEncodeStatesRequest,
} from "./simulation";

// ============================================================================
// TIER 8: Cache Implementations
// ============================================================================

export { FileCache, LocalStorageCache, MemoryCache, getBundledCachePath } from "./tracker/cache";

// Bundled cache extraction utilities
export {
  extractProposals,
  extractTimelockOps,
  extractElections,
  extractOperationIds,
  extractTimelockLinkFromStages,
  getWatermarksFromCache,
  getVotingDataFromStages,
} from "./tracker/bundled-cache";
export type {
  BundledCache,
  ExtractedProposal,
  ExtractedTimelockOp,
  ExtractedElection,
} from "./tracker/bundled-cache";

// ============================================================================
// TIER 9: Internal Utilities (for testing)
// ============================================================================

export { createCheckpoint, createTrackingState } from "./tracker/state";

export { getElectionContext, proposalStateToStageStatus } from "./tracker/pipeline";

export {
  createCheckpointMetadata,
  isCheckpointComplete,
  isCheckpointErrored,
  getCheckpointErrorCount,
  computeCacheStats,
  electionCacheKey,
  txHashCacheKey,
  timelockOpCacheKey,
  isElectionKey,
  isTxKey,
  isTimelockOpKey,
  isDiscoveryKey,
  parseElectionKey,
  parseTimelockOpKey,
  trimFromStage,
  DEFAULT_ERROR_THRESHOLD,
  ELECTION_KEY_PREFIX,
  TX_KEY_PREFIX,
} from "./tracker/checkpoint-helpers";

export { WATERMARKS_KEY, loadWatermarks } from "./tracker/discovery";
export type { LoadedWatermarks } from "./tracker/discovery";
