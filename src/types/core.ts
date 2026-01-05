/**
 * Core primitive types for Arbitrum Governance Stage Tracking SDK
 */

// Stage Types

export type StageType =
  | "PROPOSAL_CREATED"
  | "VOTING_ACTIVE"
  | "PROPOSAL_QUEUED"
  | "L2_TIMELOCK"
  | "L2_TO_L1_MESSAGE"
  | "L1_TIMELOCK"
  | "RETRYABLE_EXECUTED";

export type StageStatus = "NOT_STARTED" | "PENDING" | "READY" | "COMPLETED" | "FAILED" | "SKIPPED";
export type ChainType = "L1" | "L2" | "NOVA";
export type TargetChainType = "Arb1" | "Nova";

export interface StageTransaction {
  hash: string;
  blockNumber: number;
  timestamp?: number;
  chain: ChainType;
  logIndex?: number;
  targetChain?: TargetChainType;
  /** Human-readable description for display (e.g., "queued", "executed") */
  description?: string;
}

export interface StageTiming {
  startedAt?: number;
  eta?: number;
  delaySeconds?: number;
  expiresAt?: number;
}

export interface SearchHint {
  startBlock: number;
  endBlock?: number;
  direction?: "forward" | "backward";
}

// Timing/ETA Types (merged from timing.ts)

export interface EstimatedTimeRange {
  minDate: Date;
  maxDate: Date;
}

export interface VotingTimeRange {
  votingStartDate: Date;
  votingEndMinDate: Date;
  votingEndMaxDate: Date;
}

export interface BlockBasedTiming {
  startBlock: number;
  endBlock: number;
  currentL1Block: number;
}

export interface StageMetadata {
  type: StageType;
  estimatedDuration?: string;
}

export interface EstimatedTimesResult {
  estimatedTimes: Map<StageType, EstimatedTimeRange>;
  votingTimeRange: VotingTimeRange | null;
}
