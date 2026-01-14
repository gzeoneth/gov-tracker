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
 * Supported chain names (no "unknown").
 */
export type KnownChain = Exclude<Chain, "unknown">;

/**
 * Supported L2 chain names.
 */
export type L2Chain = Exclude<Chain, "ethereum" | "unknown">;

/**
 * Numeric chain IDs for supported chains.
 * Can be a known chain ID or any number for unknown chains.
 */
export type ChainId = (typeof CHAIN_ID_MAP)[keyof typeof CHAIN_ID_MAP] | number;

/**
 * Map chain names to their numeric chain IDs
 */
export const CHAIN_ID_MAP: Record<KnownChain, number> = {
  ethereum: 1,
  arb1: 42161,
  nova: 42170,
} as const;

/**
 * Map numeric chain IDs to chain names (internal)
 */
const CHAIN_NAME_MAP: Record<number, Chain> = {
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
 * Type guard for known chains (ethereum, arb1, nova)
 */
export function isKnownChain(chain: Chain): chain is KnownChain {
  return chain !== "unknown";
}

/**
 * Type guard for L2 chains (arb1, nova)
 */
export function isL2Chain(chain: Chain): chain is L2Chain {
  return chain === "arb1" || chain === "nova";
}

/**
 * Human-readable display names for chains
 */
const CHAIN_DISPLAY_NAMES: Record<Chain, string> = {
  ethereum: "Ethereum Mainnet",
  arb1: "Arbitrum One",
  nova: "Arbitrum Nova",
  unknown: "Unknown Chain",
};

/**
 * Get human-readable display name for a chain
 */
export function getChainDisplayName(chain: Chain): string {
  return CHAIN_DISPLAY_NAMES[chain];
}

// Stage Types

export type StageType =
  | "PROPOSAL_CREATED"
  | "VOTING_ACTIVE"
  | "PROPOSAL_QUEUED"
  | "L2_TIMELOCK"
  | "L2_TO_L1_MESSAGE"
  | "L1_TIMELOCK"
  | "RETRYABLE_EXECUTED";

export type StageStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "READY"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELED";

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
  /** Override chunk size for this search (uses chain-appropriate default if not specified) */
  chunkSize?: number;
}
