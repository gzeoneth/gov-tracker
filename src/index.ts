/**
 * Arbitrum Governance Stage Tracking SDK
 *
 * A lightweight, high-performance library for tracking Arbitrum DAO
 * governance proposal lifecycle stages.
 *
 * @example
 * ```typescript
 * import { createTracker, findExecutableStage } from "@gzeoneth/gov-tracker";
 *
 * const tracker = createTracker({
 *   l2Provider: new ethers.providers.JsonRpcProvider(ARB1_RPC),
 *   l1Provider: new ethers.providers.JsonRpcProvider(ETH_RPC),
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
  ChainType,
  TrackedStage,
  StageTransaction,
  StageTiming,
  StageDataMap,
  TypedTrackedStage,
  // Tracking types
  StageTrackingContext,
  NextStageHints,
  StageTrackResult,
  StageTrackResultWith,
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
  ExecutionResult,
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
  // Cross-chain types
  L2ToL1MessageStatus,
  L2ToL1MessageData,
  RetryableStatus,
  RetryableData,
  // ETA types
  EstimatedTimesResult,
  EstimatedTimeRange,
  // Stage data types
  ProposalCreatedData,
  VotingActiveData,
  ProposalQueuedData,
  TimelockStageData,
  L2TimelockData,
  L1TimelockData,
  L2ToL1MessageStageData,
  RetryableStageData,
  // Election types
  CohortType,
  ElectionPhase,
  ElectionProposalStatus,
  ElectionStatus,
  GovernorProposalState,
  ElectionCheckResult,
  // Calldata decoding types
  ChainContext,
  DecodingSource,
  DecodedCalldata,
  DecodedParameter,
  RetryableTicketData,
  KnownAddress,
  SignatureEntry,
  // Simulation data types
  SimulationType,
  SimulationChainType,
  BaseSimulationData,
  RetryableSimulationData,
  TimelockSimulationData,
  CallSimulationData,
  SimulationData,
  ExtractedSimulation,
} from "./types";

// Type guards
export { isStageType, getStageData } from "./types";

// Constants
export {
  ADDRESSES,
  CHAIN_IDS,
  DEFAULT_RPC_URLS,
  CHUNK_SIZES,
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
} from "./stages/base";

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
export { getTxUrl, getStageTransactionUrl, chainTypeToId } from "./utils/urls";

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
export { addressEquals, isAddressIn, getChainType } from "./utils/chain";

// Error classification
export { isGasEstimationError } from "./utils/error-classification";

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
  prepareMemberElectionTrigger,
} from "./election";
export type { PreparedElectionCreation, ElectionProposalParams } from "./election";

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
  // Simulation data
  prepareRetryableSimulation,
  prepareTimelockSimulation,
  prepareCallSimulation,
  extractAllSimulationsFromDecoded,
  NETWORK_IDS,
  TIMELOCK_SELECTORS,
} from "./simulation";

// ============================================================================
// TIER 8: Internal Utilities (for testing)
// ============================================================================

export { createCheckpoint, createTrackingContext } from "./tracker/context";
