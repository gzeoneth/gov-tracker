/**
 * Governance read helpers for wagmi/viem consumers.
 *
 * Each function returns a plain object compatible with wagmi's
 * `useReadContract` and `useReadContracts` (multicall) hooks:
 *
 * @example Single read
 * ```typescript
 * import { readProposalState } from "@gzeoneth/gov-tracker";
 * const { data } = useReadContract(readProposalState(proposalId));
 * ```
 *
 * @example Batched reads (multicall)
 * ```typescript
 * const { data } = useReadContracts({
 *   contracts: delegates.map(d => readVotingPower(d, snapshotBlock)),
 * });
 * ```
 */

import { ADDRESSES, CHAIN_IDS } from "../constants";
import {
  governorReadAbi,
  erc20VotesAbi,
  nomineeElectionGovernorReadAbi,
  memberElectionGovernorReadAbi,
} from "../abis-json";
import { resolveGovernorAddress } from "./write";
import type { GovernorTarget } from "./write";

/**
 * Shape compatible with wagmi's useReadContract parameters.
 * Consumers pass this directly: `useReadContract(readProposalState(id))`.
 */
export interface ReadContractParameters {
  address: `0x${string}`;
  abi: readonly Record<string, unknown>[];
  functionName: string;
  args: readonly unknown[];
  chainId?: number;
}

type GovernorAddress = GovernorTarget | `0x${string}`;

// ============================================================================
// Governor reads
// ============================================================================

export function readProposalState(
  proposalId: bigint | string,
  governor?: GovernorAddress,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: resolveGovernorAddress(governor),
    abi: governorReadAbi,
    functionName: "state",
    args: [BigInt(proposalId)],
    chainId,
  };
}

export function readProposalVotes(
  proposalId: bigint | string,
  governor?: GovernorAddress,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: resolveGovernorAddress(governor),
    abi: governorReadAbi,
    functionName: "proposalVotes",
    args: [BigInt(proposalId)],
    chainId,
  };
}

export function readProposalSnapshot(
  proposalId: bigint | string,
  governor?: GovernorAddress,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: resolveGovernorAddress(governor),
    abi: governorReadAbi,
    functionName: "proposalSnapshot",
    args: [BigInt(proposalId)],
    chainId,
  };
}

export function readProposalDeadline(
  proposalId: bigint | string,
  governor?: GovernorAddress,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: resolveGovernorAddress(governor),
    abi: governorReadAbi,
    functionName: "proposalDeadline",
    args: [BigInt(proposalId)],
    chainId,
  };
}

export function readQuorum(
  blockNumber: bigint | number,
  governor?: GovernorAddress,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: resolveGovernorAddress(governor),
    abi: governorReadAbi,
    functionName: "quorum",
    args: [BigInt(blockNumber)],
    chainId,
  };
}

// ============================================================================
// Token / voting power reads
// ============================================================================

export function readVotingPower(
  account: `0x${string}` | string,
  blockNumber: bigint | number,
  tokenAddress: `0x${string}` | string = ADDRESSES.ARB_TOKEN,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: tokenAddress as `0x${string}`,
    abi: erc20VotesAbi,
    functionName: "getPastVotes",
    args: [account, BigInt(blockNumber)],
    chainId,
  };
}

export function readGetVotes(
  account: `0x${string}` | string,
  blockNumber: bigint | number,
  governor?: GovernorAddress,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: resolveGovernorAddress(governor),
    abi: governorReadAbi,
    functionName: "getVotes",
    args: [account, BigInt(blockNumber)],
    chainId,
  };
}

export function readHasVoted(
  proposalId: bigint | string,
  account: `0x${string}` | string,
  governor?: GovernorAddress,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: resolveGovernorAddress(governor),
    abi: governorReadAbi,
    functionName: "hasVoted",
    args: [BigInt(proposalId), account],
    chainId,
  };
}

export function readCurrentVotingPower(
  account: `0x${string}` | string,
  tokenAddress: `0x${string}` | string = ADDRESSES.ARB_TOKEN,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: tokenAddress as `0x${string}`,
    abi: erc20VotesAbi,
    functionName: "getVotes",
    args: [account],
    chainId,
  };
}

export function readDelegate(
  account: `0x${string}` | string,
  tokenAddress: `0x${string}` | string = ADDRESSES.ARB_TOKEN,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: tokenAddress as `0x${string}`,
    abi: erc20VotesAbi,
    functionName: "delegates",
    args: [account],
    chainId,
  };
}

// ============================================================================
// Election reads
// ============================================================================

export function readNomineeElectionState(
  proposalId: bigint | string,
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "state",
    args: [BigInt(proposalId)],
    chainId,
  };
}

export function readMemberElectionState(
  proposalId: bigint | string,
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: memberElectionGovernorReadAbi,
    functionName: "state",
    args: [BigInt(proposalId)],
    chainId,
  };
}

export function readElectionCount(
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "electionCount",
    args: [],
    chainId,
  };
}

export function readVotesUsed(
  proposalId: bigint | string,
  account: `0x${string}` | string,
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "votesUsed",
    args: [BigInt(proposalId), account],
    chainId,
  };
}

export function readIsContender(
  proposalId: bigint | string,
  account: `0x${string}` | string,
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "isContender",
    args: [BigInt(proposalId), account],
    chainId,
  };
}

export function readGovernorName(
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "name",
    args: [],
    chainId,
  };
}
