/**
 * Constants for Arbitrum Governance Stage Tracking SDK
 *
 * Centralized location for all addresses, timing, and configuration constants.
 */

import { ethers } from "ethers";
import type {
  ChunkingConfig,
  RetryConfig,
  ProposalState,
  DiscoveryTargets,
  StageTransaction,
} from "./types";

// Contract Addresses

/**
 * Key Arbitrum governance contract addresses
 *
 * Naming aligned with governance documentation:
 * - Constitutional: Core Governor / Core Timelock (requires L1 round-trip)
 * - Non-Constitutional: Treasury Governor / Treasury Timelock (L2 only)
 *
 * @see https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal
 */
export const ADDRESSES = {
  // Governors
  CONSTITUTIONAL_GOVERNOR: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  NON_CONSTITUTIONAL_GOVERNOR: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",

  // Election Governors (Security Council)
  ELECTION_NOMINEE_GOVERNOR: "0x8a1cDA8dee421cD06023470608605934c16A05a0",
  ELECTION_MEMBER_GOVERNOR: "0x467923B9AE90BDB36BA88eCA11604D45F13b712C",

  // L2 Timelocks
  L2_CONSTITUTIONAL_TIMELOCK: "0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0",
  L2_NON_CONSTITUTIONAL_TIMELOCK: "0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58",

  // L1 Timelock
  L1_TIMELOCK: "0xE6841D92B0C345144506576eC13ECf5103aC7f49",

  // Delayed Inboxes (for retryable detection)
  ARB1_DELAYED_INBOX: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  NOVA_DELAYED_INBOX: "0xc4448b71118c9071Bcb9734A0EAc55D18A153949",

  // Security Council Manager
  SECURITY_COUNCIL_MANAGER: "0xD509E5f5aEe2A205F554f36E8a7d56094494eDFC",

  // ArbSys precompile (for L2→L1 messages and block info)
  ARB_SYS: "0x0000000000000000000000000000000000000064",

  // ArbRetryableTx precompile (for retryable redemption)
  ARB_RETRYABLE_TX: "0x000000000000000000000000000000000000006E",

  // Outbox (for L2→L1 execution)
  ARB1_OUTBOX: "0x0B9857ae2D4A3DBe74ffE1d7DF045bb7F96E4840",
  NOVA_OUTBOX: "0xD4B80C3D7240325D18E645B49e6535A3Bf95cc58",

  // L1ArbitrumTimelock magic address for retryable ticket detection
  // When a timelock operation's target is this address, the call is a retryable ticket
  RETRYABLE_TICKET_MAGIC: "0xa723C008e76E379c55599D2E4d93879BeaFDa79C",
} as const;

/**
 * Check if a governor address is an election governor (nominee or member election)
 *
 * Election governors have different lifecycle handling - they don't use timelocks
 * and are often filtered separately in monitoring applications.
 */
export function isElectionGovernor(governorAddress: string): boolean {
  const addr = governorAddress.toLowerCase();
  return (
    addr === ADDRESSES.ELECTION_NOMINEE_GOVERNOR.toLowerCase() ||
    addr === ADDRESSES.ELECTION_MEMBER_GOVERNOR.toLowerCase()
  );
}

/**
 * Build default discovery targets for tracker.discoverAll()
 *
 * Returns a DiscoveryTargets object with sensible defaults. By default,
 * all governors and timelocks are enabled. Use options to customize.
 *
 * @param options.includeElections - Include election governors (default: true)
 * @param options.governorsOnly - Only include governors, skip timelocks (default: false)
 * @param options.timelocksOnly - Only include timelocks, skip governors (default: false)
 *
 * @example
 * ```typescript
 * // All targets (default)
 * const targets = buildDefaultTargets();
 *
 * // Skip elections
 * const targets = buildDefaultTargets({ includeElections: false });
 *
 * // Only governors
 * const targets = buildDefaultTargets({ governorsOnly: true });
 * ```
 */
export function buildDefaultTargets(options?: {
  includeElections?: boolean;
  governorsOnly?: boolean;
  timelocksOnly?: boolean;
}): DiscoveryTargets {
  const includeElections = options?.includeElections ?? true;
  const governorsOnly = options?.governorsOnly ?? false;
  const timelocksOnly = options?.timelocksOnly ?? false;

  return {
    constitutionalGovernor: !timelocksOnly,
    nonConstitutionalGovernor: !timelocksOnly,
    electionNomineeGovernor: !timelocksOnly && includeElections,
    electionMemberGovernor: !timelocksOnly && includeElections,
    l2ConstitutionalTimelock: !governorsOnly,
    l2NonConstitutionalTimelock: !governorsOnly,
  };
}

/**
 * Chain IDs for supported networks
 *
 * Uses CHAIN_ID_MAP from types/core for single source of truth
 */
import { CHAIN_ID_MAP } from "./types/core";
export const CHAIN_IDS = {
  ETHEREUM: CHAIN_ID_MAP.ethereum,
  ARB_ONE: CHAIN_ID_MAP.arb1,
  NOVA: CHAIN_ID_MAP.nova,
} as const;

/**
 * Default public RPC URLs
 *
 * These are rate-limited public endpoints. For production use,
 * configure dedicated RPC URLs via environment variables.
 */
export const DEFAULT_RPC_URLS = {
  ETHEREUM: "https://eth.drpc.org",
  ARB_ONE: "https://arb1.arbitrum.io/rpc",
  NOVA: "https://nova.arbitrum.io/rpc",
} as const;

// Event Topics (Pre-computed keccak256 hashes)

/**
 * Pre-computed event topic hashes for efficient log filtering
 */
export const EVENT_TOPICS = {
  // Governor events
  PROPOSAL_CREATED: ethers.utils.id(
    "ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)"
  ),
  PROPOSAL_QUEUED: ethers.utils.id("ProposalQueued(uint256,uint256)"),
  PROPOSAL_EXECUTED: ethers.utils.id("ProposalExecuted(uint256)"),
  VOTE_CAST: ethers.utils.id("VoteCast(address,uint256,uint8,uint256,string)"),
  VOTE_CAST_WITH_PARAMS: ethers.utils.id(
    "VoteCastWithParams(address,uint256,uint8,uint256,string,bytes)"
  ),
  PROPOSAL_EXTENDED: ethers.utils.id("ProposalExtended(uint256,uint64)"),

  // Timelock events
  CALL_SCHEDULED: ethers.utils.id(
    "CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)"
  ),
  CALL_EXECUTED: ethers.utils.id("CallExecuted(bytes32,uint256,address,uint256,bytes)"),
  CANCELLED: ethers.utils.id("Cancelled(bytes32)"),
  MIN_DELAY_CHANGE: ethers.utils.id("MinDelayChange(uint256,uint256)"),

  // L2→L1 message
  L2_TO_L1_TX: ethers.utils.id(
    "L2ToL1Tx(address,address,uint256,uint256,uint256,uint256,uint256,uint256,bytes)"
  ),

  // Retryable
  TICKET_CREATED: ethers.utils.id("InboxMessageDelivered(uint256,bytes)"),
  REDEEM_SCHEDULED: ethers.utils.id(
    "RedeemScheduled(bytes32,bytes32,uint64,uint64,address,address,uint256,uint256,bytes)"
  ),

  // Security Council
  SECURITY_COUNCIL_COHORT_REPLACED: ethers.utils.id(
    "SecurityCouncilCohortReplaced(address[],address[])"
  ),
} as const;

// Timing Constants

/**
 * Average block times in seconds
 *
 * NOTE: L2 block times are variable (0.25s-2s) depending on sequencer load.
 * These are conservative estimates for ETA calculations. Actual timing may vary.
 */
export const BLOCK_TIMES = {
  /** ~12 seconds per block on Ethereum mainnet */
  L1: 12,
  /** Conservative estimate for Arbitrum One (actual: 0.25s-2s) */
  L2: 0.5,
  /** Same as Arbitrum One */
  NOVA: 0.5,
} as const;

/**
 * Key timing constants for governance lifecycle
 *
 * Reference: https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal
 */
export const TIMING = {
  /** Maximum voting period in L2 blocks (approximately 14 days) */
  MAX_VOTING_PERIOD_BLOCKS_L2: 6_500_000,

  /** Arbitrum challenge period in L1 blocks (approximately 6.4 days) */
  CHALLENGE_PERIOD_BLOCKS_L1: 45_818,

  /** L2 Constitutional timelock delay in seconds (8 days) */
  L2_CONSTITUTIONAL_TIMELOCK_DELAY_SECONDS: 691_200,

  /** L2 Non-Constitutional timelock delay in seconds (3 days) */
  L2_NON_CONSTITUTIONAL_TIMELOCK_DELAY_SECONDS: 259_200,

  /** L1 timelock delay in seconds (3 days) */
  L1_TIMELOCK_DELAY_SECONDS: 259_200,

  /** L1 timelock delay in L1 blocks (~21,600 blocks at 12s/block) */
  L1_TIMELOCK_DELAY_BLOCKS_L1: 21_600,

  /** Retryable ticket lifetime in seconds (7 days) */
  RETRYABLE_LIFETIME_SECONDS: 604_800,

  /** Voting extension period in days (for late quorum) */
  VOTING_EXTENSION_DAYS: 2,

  /** Milliseconds in one day */
  MS_PER_DAY: 24 * 60 * 60 * 1000,

  /** Security Council target nominee count per cohort */
  SECURITY_COUNCIL_TARGET_NOMINEES: 6,
} as const;

/**
 * Standard governance stage durations in days
 *
 * These are the expected durations for each stage in the normal proposal flow.
 * Based on: https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal
 *
 * On-chain only timing (excludes off-chain temperature check period):
 * - Constitutional: ~34 days (voting + 8d L2 timelock + challenge + 3d L1 timelock)
 * - Non-Constitutional: ~21 days (voting + 3d L2 timelock + L2 execution)
 */
export const GOVERNANCE_STAGE_DURATION_DAYS = {
  /** On-chain vote duration: 16 days (14 days base + 2 days extension buffer) */
  VOTING: 16,
  /** L2 Constitutional timelock delay: 8 days */
  L2_CONSTITUTIONAL_TIMELOCK: 8,
  /** L2 Non-Constitutional timelock delay: 3 days */
  L2_NON_CONSTITUTIONAL_TIMELOCK: 3,
  /** L2 execution: typically same block as delay expiry */
  L2_EXECUTION: 0,
  /** Challenge period: ~6.4 days (45818 L1 blocks * 12s/block) */
  CHALLENGE_PERIOD: 6.4,
  /** L1 timelock delay: 3 days */
  L1_TIMELOCK: 3,
  /** L1 execution + retryable: typically same day */
  L1_EXECUTION: 0,
  /** Total on-chain duration for Constitutional proposals: ~34 days */
  TOTAL_ONCHAIN_CONSTITUTIONAL: 34,
  /** Total on-chain duration for Non-Constitutional proposals: ~21 days */
  TOTAL_ONCHAIN_NON_CONSTITUTIONAL: 21,
} as const;

// Chunking Configuration

/**
 * Block chunk sizes for log searches
 */
export const CHUNK_SIZES = {
  /** L2 (Arbitrum One) chunk size: 10M blocks */
  L2: 10_000_000,
  /** L1 (Ethereum) chunk size: 10K blocks */
  L1: 10_000,
  /** Nova chunk size: 10M blocks */
  NOVA: 10_000_000,
  /** Delay between chunk queries in milliseconds */
  DELAY_MS: 100,
} as const;

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  l2ChunkSize: CHUNK_SIZES.L2,
  l1ChunkSize: CHUNK_SIZES.L1,
  novaChunkSize: CHUNK_SIZES.NOVA,
  delayBetweenChunks: CHUNK_SIZES.DELAY_MS,
};

// Retry Configuration

/**
 * Default retry configuration for RPC calls
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 16000,
  backoffMultiplier: 2,
};

/**
 * Governance deployment blocks - earliest possible blocks for governance events
 *
 * Use these as fallback startBlock when no specific block hint is available.
 * These are conservative (early) estimates to ensure no events are missed.
 *
 * Arbitrum DAO launched March 2023:
 * - L2 governance deployment: ~block 70M on Arbitrum One
 * - L1 timelock deployment: ~block 16.8M on Ethereum mainnet
 */
export const GOVERNANCE_START_BLOCKS = {
  /** L2 (Arbitrum One) governance deployment block - March 2023 */
  L2: 70_000_000,
  /** L1 (Ethereum mainnet) timelock deployment block - March 2023 */
  L1: 16_800_000,
  /** Nova governance deployment block (same timeframe as L2) */
  NOVA: 1_000_000,
} as const;

// Governor State Mapping

/**
 * Map OpenZeppelin Governor state number to ProposalState string
 *
 * Used by governor.state() to convert numeric state to readable string.
 */
export const PROPOSAL_STATE_MAP: Record<number, ProposalState> = {
  0: "Pending",
  1: "Active",
  2: "Canceled",
  3: "Defeated",
  4: "Succeeded",
  5: "Queued",
  6: "Expired",
  7: "Executed",
};

/**
 * Numeric proposal state values from OpenZeppelin Governor
 *
 * Use these constants instead of magic numbers when checking proposal state.
 */
export const PROPOSAL_STATE = {
  PENDING: 0,
  ACTIVE: 1,
  CANCELED: 2,
  DEFEATED: 3,
  SUCCEEDED: 4,
  QUEUED: 5,
  EXPIRED: 6,
  EXECUTED: 7,
} as const;

/**
 * Convert proposal state number to human-readable string
 *
 * @param state - The numeric state from governor.state()
 * @returns The human-readable state string
 * @throws Error if state number is not recognized
 */
export function proposalStateToString(state: number): ProposalState {
  const result = PROPOSAL_STATE_MAP[state];
  if (!result) {
    throw new Error(`Unknown proposal state number: ${state}`);
  }
  return result;
}

// Explorer URLs

/**
 * Get explorer URL for a transaction or address
 */
export function getExplorerUrl(chainId: number, type: "tx" | "address", hash: string): string {
  switch (chainId) {
    case 1: // Ethereum
      return `https://etherscan.io/${type}/${hash}`;
    case CHAIN_IDS.ARB_ONE:
      return `https://arbiscan.io/${type}/${hash}`;
    case CHAIN_IDS.NOVA:
      return `https://nova.arbiscan.io/${type}/${hash}`;
    default:
      return `https://etherscan.io/${type}/${hash}`;
  }
}

/**
 * Get transaction URL by chain ID
 */
export function getTxUrl(chainId: number, txHash: string): string {
  return getExplorerUrl(chainId, "tx", txHash);
}

/**
 * Get block explorer URL for a stage transaction
 *
 * @example
 * ```typescript
 * const stage = result.stages[0];
 * for (const tx of stage.transactions) {
 *   console.log(`${tx.hash}: ${getStageTransactionUrl(tx)}`);
 * }
 * ```
 */
export function getStageTransactionUrl(tx: StageTransaction): string {
  return getTxUrl(tx.chainId, tx.hash);
}

// Simulation Constants

/**
 * Network IDs for Tenderly simulation (string format)
 */
export const NETWORK_IDS = {
  ethereum: "1",
  arb1: "42161",
  nova: "42170",
} as const;

/**
 * Function selectors for timelock operations
 */
export const TIMELOCK_SELECTORS = {
  schedule: "0x01d5062a",
  execute: "0x134008d3",
  scheduleBatch: "0x8f2a0bb0",
  executeBatch: "0xe38335e5",
} as const;
