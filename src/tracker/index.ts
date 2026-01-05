/**
 * Tracker module re-exports
 *
 * This module consolidates exports from the tracker subsystem:
 * - context.ts: TrackingContext state management
 * - pipeline.ts: Stage tracking pipeline functions
 * - discovery.ts: Proposal and timelock discovery
 * - query.ts: Cache query operations
 * - execute.ts: Transaction preparation
 * - state.ts: Cache utilities
 */

// Context - TrackingContext state management
export {
  // Types
  Providers,
  CreateTrackingContextOptions,
  TrackingContext,
  // State creation
  createTrackingContext,
  // Stage management
  addStage,
  isStageCompleted,
  getCompletedStage,
  getCachedStage,
  isComplete,
  // Derived getters
  getGovernorAddress,
  getProposalId,
  getTimelockAddress,
  getOperationId,
  getCallScheduledData,
  getFirstCallScheduledData,
  getQueueBlockNumber,
  getProposalData,
  getProposalType,
  getIsElection,
  getProposalState,
  getL2ExecutionTxHash,
  getFirstExecutableBlock,
  getOutboxExecutionTx,
  getL1ExecutionTxHash,
  // Checkpoint
  createCheckpoint,
  toResult,
} from "./context";

// Pipeline - Stage tracking functions
export { trackGovernorPipeline, trackTimelockPipeline } from "./pipeline";

// Discovery
export {
  discoverAll,
  discoverProposals,
  discoverTimelockOps,
  DiscoveredProposal,
  DiscoveredTimelockOp,
  loadWatermarks,
  saveWatermarks,
  WATERMARKS_KEY,
} from "./discovery";

// Query
export {
  listCheckpointKeys,
  getCheckpoint,
  getAllCheckpoints,
  queryIncompleteCheckpoints,
  getStats,
} from "./query";

// Execute
export { prepareTransaction } from "./execute";

// State utilities
export { txHashCacheKey, readCacheStatus } from "./state";
