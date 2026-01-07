/**
 * Core primitive types for Arbitrum Governance Stage Tracking SDK
 */

/**
 * Standard chain context type to be used across the application.
 * Unifies previous ChainType, TargetChainType, and SimulationChainType.
 *
 * - ethereum: L1
 * - arb1: L2 (Arbitrum One)
 * - nova: L2 (Arbitrum Nova)
 */
export type ChainContext = "ethereum" | "arb1" | "nova";

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

/** @deprecated Use ChainContext instead */
export type ChainType = "L1" | "L2" | "NOVA";
/** @deprecated Use ChainContext instead */
export type TargetChainType = "Arb1" | "Nova";

export interface StageTransaction {
  hash: string;
  blockNumber: number;
  timestamp?: number;
  // TODO: Migrate to ChainContext
  chain: ChainType;
  logIndex?: number;
  // TODO: Migrate to ChainContext
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
