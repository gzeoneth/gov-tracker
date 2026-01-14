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

// Cross-chain types
export { RetryableCreationDetail, RetryableRedemptionDetail } from "./cross-chain";

// Stage data types
export {
  BaseStageData,
  ProposalCreatedData,
  VotingActiveData,
  ProposalQueuedData,
  BaseTimelockData,
  TimelockStageData,
  L2ToL1MessageStageData,
  RetryableStageData,
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
  ElectionProposalStatus,
  ElectionStatus,
  ElectionCheckResult,
  // Detailed election participant types
  ElectionContender,
  ElectionNominee,
  MemberElectionNominee,
  // Election detail aggregates
  NomineeElectionDetails,
  MemberElectionDetails,
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
