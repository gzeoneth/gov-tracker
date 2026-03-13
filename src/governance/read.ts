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

type GovernorAddress = "constitutional" | "non-constitutional" | `0x${string}`;

function resolveGovernor(governor?: GovernorAddress): `0x${string}` {
  if (!governor || governor === "constitutional") return ADDRESSES.CONSTITUTIONAL_GOVERNOR;
  if (governor === "non-constitutional") return ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR;
  return governor;
}

// ============================================================================
// Governor reads
// ============================================================================

export function readProposalState(
  proposalId: bigint | string,
  governor?: GovernorAddress
): ReadContractParameters {
  return {
    address: resolveGovernor(governor),
    abi: governorReadAbi,
    functionName: "state",
    args: [BigInt(proposalId)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

export function readProposalVotes(
  proposalId: bigint | string,
  governor?: GovernorAddress
): ReadContractParameters {
  return {
    address: resolveGovernor(governor),
    abi: governorReadAbi,
    functionName: "proposalVotes",
    args: [BigInt(proposalId)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

export function readProposalSnapshot(
  proposalId: bigint | string,
  governor?: GovernorAddress
): ReadContractParameters {
  return {
    address: resolveGovernor(governor),
    abi: governorReadAbi,
    functionName: "proposalSnapshot",
    args: [BigInt(proposalId)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

export function readProposalDeadline(
  proposalId: bigint | string,
  governor?: GovernorAddress
): ReadContractParameters {
  return {
    address: resolveGovernor(governor),
    abi: governorReadAbi,
    functionName: "proposalDeadline",
    args: [BigInt(proposalId)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

export function readQuorum(
  blockNumber: bigint | number,
  governor?: GovernorAddress
): ReadContractParameters {
  return {
    address: resolveGovernor(governor),
    abi: governorReadAbi,
    functionName: "quorum",
    args: [BigInt(blockNumber)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

// ============================================================================
// Token / voting power reads
// ============================================================================

export function readVotingPower(
  account: `0x${string}` | string,
  blockNumber: bigint | number,
  tokenAddress: `0x${string}` | string = ADDRESSES.ARB_TOKEN
): ReadContractParameters {
  return {
    address: tokenAddress as `0x${string}`,
    abi: erc20VotesAbi,
    functionName: "getPastVotes",
    args: [account, BigInt(blockNumber)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

export function readGetVotes(
  account: `0x${string}` | string,
  blockNumber: bigint | number,
  governor?: GovernorAddress
): ReadContractParameters {
  return {
    address: resolveGovernor(governor),
    abi: governorReadAbi,
    functionName: "getVotes",
    args: [account, BigInt(blockNumber)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

// ============================================================================
// Election reads
// ============================================================================

export function readNomineeElectionState(
  proposalId: bigint | string,
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "state",
    args: [BigInt(proposalId)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

export function readMemberElectionState(
  proposalId: bigint | string,
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_MEMBER_GOVERNOR
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: memberElectionGovernorReadAbi,
    functionName: "state",
    args: [BigInt(proposalId)],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}

export function readElectionCount(
  governorAddress: `0x${string}` | string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): ReadContractParameters {
  return {
    address: governorAddress as `0x${string}`,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "electionCount",
    args: [],
    chainId: CHAIN_IDS.ARB_ONE,
  };
}
