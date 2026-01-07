/**
 * Core primitive types for Arbitrum Governance Stage Tracking SDK
 */

// Chain Types

/**
 * Unified chain identifier (string names).
 *
 * - ethereum: Ethereum L1 (chainId: 1)
 * - arb1: Arbitrum One L2 (chainId: 42161)
 * - nova: Arbitrum Nova L2 (chainId: 42170)
 * - unknown: Unknown or unsupported chain (stores actual chainId separately)
 */
export type Chain = "ethereum" | "arb1" | "nova" | "unknown";

/**
 * Numeric chain IDs for supported chains.
 * Can be a known chain ID or any number for unknown chains.
 */
export type ChainId = 1 | 42161 | 42170 | number;

/**
 * Map chain names to their numeric chain IDs
 */
export const CHAIN_ID_MAP: Record<Exclude<Chain, "unknown">, ChainId> = {
  ethereum: 1,
  arb1: 42161,
  nova: 42170,
} as const;

/**
 * Map numeric chain IDs to chain names
 */
export const CHAIN_NAME_MAP: Record<number, Chain> = {
  1: "ethereum",
  42161: "arb1",
  42170: "nova",
} as const;

/**
 * Convert chainId to chain name
 */
export function chainIdToChain(chainId: ChainId): Chain {
  return CHAIN_NAME_MAP[chainId] ?? "unknown";
}

/**
 * Convert chain name to chainId
 */
export function chainToChainId(chain: Chain): ChainId | undefined {
  if (chain === "unknown") return undefined;
  return CHAIN_ID_MAP[chain];
}

/**
 * Convert legacy ChainType to new Chain type
 * @deprecated For migration only
 */
export function legacyChainTypeToChain(chainType: "L1" | "L2" | "NOVA"): Chain {
  switch (chainType) {
    case "L1":
      return "ethereum";
    case "L2":
      return "arb1";
    case "NOVA":
      return "nova";
  }
}

/**
 * Convert new Chain type to legacy ChainType
 * @deprecated For migration only
 */
export function chainToLegacyChainType(chain: Chain): "L1" | "L2" | "NOVA" {
  switch (chain) {
    case "ethereum":
      return "L1";
    case "arb1":
      return "L2";
    case "nova":
      return "NOVA";
    case "unknown":
      return "L2"; // Default to L2 for unknown
  }
}

/**
 * Convert legacy TargetChainType to new Chain type
 * @deprecated For migration only
 */
export function legacyTargetChainToChain(targetChain: "Arb1" | "Nova"): Chain {
  return targetChain === "Arb1" ? "arb1" : "nova";
}

/**
 * Convert new Chain type to legacy TargetChainType
 * @deprecated For migration only
 */
export function chainToLegacyTargetChain(chain: Chain): "Arb1" | "Nova" | undefined {
  switch (chain) {
    case "arb1":
      return "Arb1";
    case "nova":
      return "Nova";
    default:
      return undefined;
  }
}

// Legacy type aliases (deprecated - use Chain instead)
/** @deprecated Use Chain instead */
export type ChainType = "L1" | "L2" | "NOVA";
/** @deprecated Use Chain instead */
export type TargetChainType = "Arb1" | "Nova";
/** @deprecated Use Chain instead */
export type ChainContext = Chain;

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

export interface StageTransaction {
  hash: string;
  blockNumber: number;
  timestamp?: number;
  chain: Chain;
  chainId: ChainId;
  logIndex?: number;
  /** For retryable tickets that target a specific L2 chain */
  targetChain?: Chain;
  targetChainId?: ChainId;
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
