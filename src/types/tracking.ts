/**
 * Tracking context, results, checkpoint, and execution types
 */

import { BigNumber } from "ethers";
import { ChainType, StageType } from "./core";
import { TrackedStage } from "./stages";
import { CallScheduledData } from "./timelock";
import { ProposalType, ProposalData, ProposalState } from "./governor";
import { TimelockState, TimelockLink } from "./timelock";

// Execution Types (merged from execution.ts)

export interface PrepareOptions {
  salt?: string;
  predecessor?: string;
  skipSaltValidation?: boolean;
  skipRetryableValueCalculation?: boolean;
  /** Prepare completed stages (for historical validation) */
  prepareCompleted?: boolean;
  /** Proposal description (needed for salt derivation if not in stage data) */
  description?: string;
}

export type PrepareResult =
  | { success: true; prepared: PreparedTransaction }
  | { success: false; error: string };

export interface PreparedTransaction {
  to: string;
  data: string;
  value: string;
  chain: ChainType;
  description: string;
  operationId?: string;
  hashValidation?: { isValid: boolean; error?: string };
}

export interface ExecutionResult {
  success: boolean;
  txHash: string;
  blockNumber: number;
  gasUsed: BigNumber;
  error?: string;
  prepared?: PreparedTransaction;
}

// Tracking Input Types

/**
 * Input for tracking from a governor proposal
 */
export interface GovernorTrackingInput {
  type: "governor";
  governorAddress: string;
  proposalId: string;
  creationTxHash: string;
}

/**
 * Input for tracking from a timelock operation
 */
export interface TimelockTrackingInput {
  type: "timelock";
  timelockAddress: string;
  operationId: string;
  scheduledTxHash: string;
}

/**
 * Input for discovery metadata checkpoint
 */
export interface DiscoveryTrackingInput {
  type: "discovery";
  id: "watermarks";
}

/**
 * Union type for all tracking entry points
 */
export type TrackingInput = GovernorTrackingInput | TimelockTrackingInput | DiscoveryTrackingInput;

/**
 * Common context for stage tracking operations
 */
export interface StageTrackingContext {
  fromBlock?: number;
  toBlock?: number;
  direction?: "forward" | "backward";
  cachedData?: {
    txHash?: string;
    operationId?: string;
    callScheduledData?: CallScheduledData | CallScheduledData[];
    executionTxHash?: string;
  };
  checkpoint?: TrackingCheckpoint;
}

/**
 * Hints for the next stage in the pipeline
 */
export interface NextStageHints {
  fromBlock?: number;
  timelockAddress?: string;
  operationId?: string;
  callScheduledData?: CallScheduledData | CallScheduledData[];
  executionTxHash?: string;
  firstExecutableBlock?: number;
  messagePosition?: string;
}

/**
 * Result structure for stage tracking functions
 */
export interface StageTrackResult {
  stage: TrackedStage;
  hints: NextStageHints;
}

/**
 * Extend StageTrackResult with additional stage-specific data
 */
export type StageTrackResultWith<TExtra> = StageTrackResult & TExtra;

/**
 * Discovery target keys (shared between watermarks and targets)
 */
export type DiscoveryKey =
  | "constitutionalGovernor"
  | "nonConstitutionalGovernor"
  | "electionNomineeGovernor"
  | "electionMemberGovernor"
  | "l2ConstitutionalTimelock"
  | "l2NonConstitutionalTimelock";

/** Discovery watermarks for incremental block scanning */
export type DiscoveryWatermarks = Partial<Record<DiscoveryKey, number>>;

/** Discovery targets configuration */
export type DiscoveryTargets = Partial<Record<DiscoveryKey, boolean>>;

/**
 * Checkpoint for resuming tracking
 */
export interface TrackingCheckpoint {
  version: 1;
  createdAt: number;
  input: TrackingInput;
  lastProcessedStage: StageType | null;
  lastProcessedBlock: {
    l1: number;
    l2: number;
    nova?: number;
  };
  cachedData: {
    completedStages?: TrackedStage[];
    discoveryWatermarks?: DiscoveryWatermarks;
  };
  metadata?: {
    errorCount: number;
    lastTrackedAt: number;
  };
}

/**
 * Aggregated cache statistics
 */
export interface TrackerStats {
  total: number;
  proposals: {
    total: number;
    complete: number;
    active: number;
    errored: number;
  };
  timelocks: {
    total: number;
    complete: number;
    active: number;
    errored: number;
  };
  elections: {
    total: number;
    complete: number;
  };
}

/**
 * Full tracking result
 */
export interface TrackingResult {
  input: TrackingInput;
  stages: TrackedStage[];
  checkpoint: TrackingCheckpoint;
  isComplete: boolean;
  proposalType?: ProposalType;
  proposalData?: ProposalData;
  timelockState?: TimelockState;
  timelockLink?: TimelockLink;
  currentState?: ProposalState;
  isElection?: boolean;
}
