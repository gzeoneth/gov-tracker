/**
 * Governance proposal vote preparation
 *
 * Prepares transactions for casting votes on Core Governor and Treasury
 * Governor proposals. Following the SDK's prepare-only philosophy: builds
 * transaction data but never executes.
 *
 * Supports all OpenZeppelin Governor voting methods:
 * - castVote(proposalId, support)
 * - castVoteWithReason(proposalId, support, reason)
 * - castVoteWithReasonAndParams(proposalId, support, reason, params)
 */

import { ethers, BigNumber } from "ethers";
import { ADDRESSES, CHAIN_IDS, VOTE_SUPPORT } from "../constants";
import type { VoteSupport } from "../constants";
import { governorInterface } from "../abis";
import { PreparedTransaction, chainIdToChain } from "../types";
import { loggers } from "../utils/logger";

const log = loggers.governance;

// ============================================================================
// Types
// ============================================================================

export type GovernorTarget = "constitutional" | "non-constitutional";

// ============================================================================
// Internals
// ============================================================================

export function resolveGovernorAddress(
  governorAddressOrTarget?: GovernorTarget | string
): `0x${string}` {
  if (!governorAddressOrTarget) return ADDRESSES.CONSTITUTIONAL_GOVERNOR;
  if (governorAddressOrTarget === "constitutional") return ADDRESSES.CONSTITUTIONAL_GOVERNOR;
  if (governorAddressOrTarget === "non-constitutional")
    return ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR;
  return ethers.utils.getAddress(governorAddressOrTarget) as `0x${string}`;
}

function supportLabel(support: VoteSupport): string {
  if (support === VOTE_SUPPORT.FOR) return "For";
  if (support === VOTE_SUPPORT.AGAINST) return "Against";
  return "Abstain";
}

// ============================================================================
// Vote Preparation
// ============================================================================

/**
 * Prepare a castVote transaction.
 *
 * Simplest voting method — just proposal ID and support value.
 *
 * @param proposalId - The proposal ID to vote on
 * @param support - Vote support: 0 (Against), 1 (For), 2 (Abstain) — use VOTE_SUPPORT constants
 * @param governorAddress - Governor contract address, or "constitutional"/"non-constitutional" shorthand
 * @param chainId - Chain ID (default: 42161 for Arbitrum One)
 */
export function prepareCastVote(
  proposalId: string,
  support: VoteSupport,
  governorAddress?: GovernorTarget | string,
  chainId: number = CHAIN_IDS.ARB_ONE
): PreparedTransaction {
  const to = resolveGovernorAddress(governorAddress);
  log("prepareCastVote for proposal %s, support %d, governor %s", proposalId, support, to);

  const data = governorInterface.encodeFunctionData("castVote", [
    BigNumber.from(proposalId),
    support,
  ]);

  return {
    to,
    data: data as `0x${string}`,
    value: "0",
    chain: chainIdToChain(chainId),
    chainId,
    description: `castVote(${supportLabel(support)}) on proposal ${proposalId}`,
  };
}

/**
 * Prepare a castVoteWithReason transaction.
 *
 * Same as castVote but includes an on-chain reason string.
 *
 * @param proposalId - The proposal ID to vote on
 * @param support - Vote support: 0 (Against), 1 (For), 2 (Abstain)
 * @param reason - On-chain reason for the vote
 * @param governorAddress - Governor contract address or shorthand
 * @param chainId - Chain ID (default: 42161)
 */
export function prepareCastVoteWithReason(
  proposalId: string,
  support: VoteSupport,
  reason: string,
  governorAddress?: GovernorTarget | string,
  chainId: number = CHAIN_IDS.ARB_ONE
): PreparedTransaction {
  const to = resolveGovernorAddress(governorAddress);
  log("prepareCastVoteWithReason for proposal %s, support %d", proposalId, support);

  const data = governorInterface.encodeFunctionData("castVoteWithReason", [
    BigNumber.from(proposalId),
    support,
    reason,
  ]);

  return {
    to,
    data: data as `0x${string}`,
    value: "0",
    chain: chainIdToChain(chainId),
    chainId,
    description: `castVoteWithReason(${supportLabel(support)}) on proposal ${proposalId}`,
  };
}

/**
 * Prepare a castVoteWithReasonAndParams transaction.
 *
 * Most flexible voting method — includes reason and arbitrary params bytes.
 * Used by governors with custom counting modules.
 *
 * @param proposalId - The proposal ID to vote on
 * @param support - Vote support: 0 (Against), 1 (For), 2 (Abstain)
 * @param reason - On-chain reason for the vote
 * @param params - ABI-encoded params bytes (interpretation depends on counting module)
 * @param governorAddress - Governor contract address or shorthand
 * @param chainId - Chain ID (default: 42161)
 */
export function prepareCastVoteWithReasonAndParams(
  proposalId: string,
  support: VoteSupport,
  reason: string,
  params: string,
  governorAddress?: GovernorTarget | string,
  chainId: number = CHAIN_IDS.ARB_ONE
): PreparedTransaction {
  const to = resolveGovernorAddress(governorAddress);
  log("prepareCastVoteWithReasonAndParams for proposal %s, support %d", proposalId, support);

  const data = governorInterface.encodeFunctionData("castVoteWithReasonAndParams", [
    BigNumber.from(proposalId),
    support,
    reason,
    params,
  ]);

  return {
    to,
    data: data as `0x${string}`,
    value: "0",
    chain: chainIdToChain(chainId),
    chainId,
    description: `castVoteWithReasonAndParams(${supportLabel(support)}) on proposal ${proposalId}`,
  };
}
