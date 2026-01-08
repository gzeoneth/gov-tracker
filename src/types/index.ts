/**
 * Type definitions for Arbitrum Governance Stage Tracking SDK
 *
 * Organized by domain:
 * - core: Primitives (StageType, Chain, timing/ETA types)
 * - governor: Governor, proposal, voting types
 * - timelock: Timelock operations and state
 * - cross-chain: L2→L1 messages and retryables
 * - stages: Stage data types and TrackedStage
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
  StageTransaction,
  StageTiming,
  SearchHint,
  EstimatedTimeRange,
  VotingTimeRange,
  BlockBasedTiming,
  StageMetadata,
  EstimatedTimesResult,
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

// Cross-chain types
export {
  L2ToL1MessageStatus,
  L2ToL1MessageData,
  RetryableStatus,
  RetryableData,
  RetryableTicketInfo,
  RetryableRedemptionInfo,
  RetryableCreationDetail,
  RetryableRedemptionDetail,
} from "./cross-chain";

// Stage data types
export {
  BaseStageData,
  ProposalCreatedData,
  VotingActiveData,
  ProposalQueuedData,
  BaseTimelockData,
  TimelockStageData,
  L2TimelockData,
  L1TimelockData,
  L2ToL1MessageStageData,
  RetryableStageData,
  StageDataMap,
  TrackedStageData,
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
  ExecutionResult,
  GovernorTrackingInput,
  TimelockTrackingInput,
  DiscoveryTrackingInput,
  TrackingInput,
  StageTrackingContext,
  NextStageHints,
  StageTrackResult,
  StageTrackResultWith,
  DiscoveryWatermarks,
  DiscoveryTargets,
  TrackingCheckpoint,
  TrackerStats,
  TrackingResult,
} from "./tracking";

// Config types
export {
  ChunkingConfig,
  RetryConfig,
  TrackingProgress,
  OnProgressCallback,
  TrackerOptions,
  CacheAdapter,
} from "./config";

// Election types
export {
  CohortType,
  ElectionPhase,
  GovernorProposalState,
  ElectionProposalStatus,
  ElectionStatus,
  ElectionCheckResult,
} from "./election";

// Calldata decoding types
export {
  DecodingSource,
  DecodedCalldata,
  DecodedParameter,
  RetryableTicketData,
  KnownAddress,
  SignatureEntry,
  ExtractedCalldata,
} from "./calldata";

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
