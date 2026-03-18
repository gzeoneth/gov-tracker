/**
 * Type definitions for Arbitrum Governance Stage Tracking SDK
 *
 * Organized by domain:
 * - core: Primitives (StageType, Chain, timing/ETA types)
 * - governor: Governor, proposal, voting types
 * - timelock: Timelock operations and state
 * - stages: Stage data types, TrackedStage, cross-chain types
 * - tracking: Context, results, checkpoints, execution
 * - config: TrackerOptions, ChunkingConfig
 * - election: Security Council election types
 */

// Core primitives + timing
export {
  StageType,
  StageStatus,
  Chain,
  KnownChain,
  L2Chain,
  ChainId,
  chainIdToChain,
  chainToChainId,
  isKnownChain,
  isL2Chain,
  getChainDisplayName,
  StageTransaction,
  StageTiming,
  SearchHint,
} from "./core";

// Governor types
export {
  ProposalType,
  GovernorCapability,
  ProposalState,
  ProposalData,
  VotingData,
  ProposalCreatedEventArgs,
} from "./governor";

// Timelock types
export {
  TimelockOperationState,
  SerializedCallScheduledData,
  CallScheduledData,
  CallExecutedData,
  TimelockParams,
  TimelockBatchParams,
  TimelockState,
  OperationState,
  TimelockLink,
} from "./timelock";

// Stage data types (includes cross-chain types)
export {
  BaseStageData,
  ProposalCreatedData,
  VotingActiveData,
  ProposalQueuedData,
  BaseTimelockData,
  TimelockStageData,
  L2ToL1MessageStageData,
  RetryableStageData,
  RetryableCreationDetail,
  RetryableRedemptionDetail,
  CreateElectionData,
  NomineeElectionData,
  NomineeVettingData,
  MemberElectionData,
  StageDataMap,
  TrackedStage,
  TypedTrackedStage,
  isStageType,
  getStageData,
} from "./stages";

// Tracking + execution types
export {
  PrepareOptions,
  PrepareResult,
  PreparedTransaction,
  GovernorTrackingInput,
  TimelockTrackingInput,
  DiscoveryTrackingInput,
  ElectionTrackingInput,
  TrackingInput,
  NextStageHints,
  StageTrackResult,
  DiscoveryKey,
  DiscoveryWatermarks,
  WatermarkHashes,
  DiscoveryTargets,
  TrackingCheckpoint,
  TrackerStats,
  TrackingResult,
} from "./tracking";

// Config types
export {
  TrackingContext,
  ChunkingConfig,
  RetryConfig,
  TrackingProgress,
  OnProgressCallback,
  TrackerOptions,
  ProviderOrUrl,
  CacheAdapter,
} from "./config";

// Election types
export {
  CohortType,
  ElectionPhase,
  ElectionProposalStatus,
  ElectionStatus,
  ElectionConfig,
  ElectionCheckResult,
  // Detailed election participant types
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
} from "./election";

// Calldata decoding types
export {
  DecodingSource,
  DecodedCalldata,
  DecodedParameter,
  isRetryable,
  RetryableTicketData,
  KnownAddress,
  SignatureEntry,
  ExtractedCalldata,
} from "./calldata";

// Delegate types
export { DelegateInfo, DelegateCache, DelegateNotVoted, DelegateCacheStats } from "./delegates";

// Simulation data types
export {
  SimulationType,
  BaseSimulationData,
  RetryableSimulationData,
  TimelockSimulationData,
  CallSimulationData,
  SimulationData,
  ExtractedSimulation,
} from "./simulation";
