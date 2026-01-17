/**
 * Tracking context, results, checkpoint, and execution types
 */

import { Chain, ChainId, StageType } from "./core";
import { TrackedStage } from "./stages";
import { CallScheduledData, TimelockLink } from "./timelock";
import { ProposalType, ProposalData, ProposalState } from "./governor";
import {
  ElectionProposalStatus,
  SerializableNomineeDetails,
  SerializableMemberDetails,
} from "./election";

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
  chain: Chain;
  chainId: ChainId;
  description: string;
  operationId?: string;
  hashValidation?: { isValid: boolean; error?: string };
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
 * Input for tracking a Security Council election
 */
export interface ElectionTrackingInput {
  type: "election";
  electionIndex: number;
}

/**
 * Union type for all tracking entry points
 */
export type TrackingInput =
  | GovernorTrackingInput
  | TimelockTrackingInput
  | DiscoveryTrackingInput
  | ElectionTrackingInput;

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

/** Block hashes for watermark reorg detection */
export type WatermarkHashes = Partial<Record<DiscoveryKey, string>>;

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
    /** Block hashes for reorg detection */
    watermarkHashes?: WatermarkHashes;
    /** Election status for election checkpoints */
    electionStatus?: ElectionProposalStatus;
    /** Nominee election details for completed elections */
    nomineeDetails?: SerializableNomineeDetails;
    /** Member election details for completed elections */
    memberDetails?: SerializableMemberDetails;
  };
  metadata?: {
    errorCount: number;
    lastTrackedAt: number;
    /**
     * Reference to the parent checkpoint that created this timelock operation.
     * Used for deduplication when tracking results spawn child timelock operations.
     *
     * Examples:
     * - Election executes → schedules to L2 timelock → sourceCheckpoint = "election:5"
     * - Proposal queued → schedules to L2 timelock → sourceCheckpoint = "tx:0x..."
     * - L2 timelock executed → schedules to L1 → child already tracked in stages, no need for separate key
     *
     * @see linkCheckpointToChild
     */
    sourceCheckpoint?: string;
    /**
     * Cache key linking to the timelock operation checkpoint.
     * Format: tx:{scheduleTxHash}:op:{operationId}
     *
     * When present, timelock stages (L2_TIMELOCK → RETRYABLE_EXECUTED) are stored
     * in a separate checkpoint referenced by this key. This enables:
     * - Independent resumption of timelock tracking
     * - Reduced data duplication
     * - Clear separation between parent (proposal/election) and timelock stages
     */
    timelockOpKey?: string;
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
  timelockLink?: TimelockLink;
  currentState?: ProposalState;
  isElection?: boolean;
  /** Election status for election proposals - includes full lifecycle tracking */
  electionStatus?: ElectionProposalStatus;
}
