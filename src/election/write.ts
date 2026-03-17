/**
 * Election write action preparation
 *
 * Prepares transactions and typed data for election participation:
 * - Contender registration (EIP-712 sign → addContender)
 * - Vote casting (castVoteWithReasonAndParams with encoded params)
 *
 * Following the SDK's prepare-only philosophy: this module builds
 * transaction data and typed data structures, but never executes.
 */

import { ethers, BigNumber } from "ethers";
import { ADDRESSES, CHAIN_IDS } from "../constants";
import { nomineeElectionGovernorInterface, memberElectionGovernorInterface } from "../abis";
import { PreparedTransaction, chainIdToChain } from "../types";
import { loggers } from "../utils/logger";

const log = loggers.election;

// ============================================================================
// Types
// ============================================================================

/**
 * EIP-712 typed data for wallet signing (framework-agnostic)
 *
 * Compatible with:
 * - ethers v5: signer._signTypedData(domain, types, message)
 * - ethers v6: signer.signTypedData(domain, types, message)
 * - wagmi v2: useSignTypedData({ domain, types, primaryType, message })
 * - viem: signTypedData(client, { domain, types, primaryType, message })
 */
export interface AddContenderTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: {
    AddContenderMessage: Array<{ name: string; type: string }>;
  };
  primaryType: "AddContenderMessage";
  message: {
    proposalId: bigint;
  };
}

/**
 * Result of preparing a contender registration.
 * The caller must first get the user's signature using the typedData,
 * then submit the transaction.
 */
export interface PreparedContenderRegistration {
  typedData: AddContenderTypedData;
  buildTransaction: (signature: string) => PreparedTransaction;
}

// ============================================================================
// Vote Parameter Encoding
// ============================================================================

/**
 * Encode vote parameters for election castVoteWithReasonAndParams.
 *
 * Both NomineeElectionGovernor and MemberElectionGovernor use the same
 * param encoding: abi.encode(address target, uint256 votes).
 *
 * @param target - Address of the contender/nominee to vote for
 * @param votes - Vote amount in wei (full 18-decimal precision)
 * @returns ABI-encoded bytes string
 */
export function encodeElectionVoteParams(target: string, votes: string | BigNumber): string {
  if (!ethers.utils.isAddress(target)) {
    throw new Error(`Invalid target address: ${target}`);
  }
  const votesBN = BigNumber.isBigNumber(votes) ? votes : BigNumber.from(votes);
  return ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [target, votesBN]);
}

/**
 * Decode vote parameters from election castVoteWithReasonAndParams.
 *
 * @param params - ABI-encoded bytes from castVoteWithReasonAndParams
 * @returns Decoded target address and vote amount
 */
export function decodeElectionVoteParams(params: string): {
  target: string;
  votes: BigNumber;
} {
  const [target, votes] = ethers.utils.defaultAbiCoder.decode(["address", "uint256"], params);
  return { target: target as string, votes: votes as BigNumber };
}

// ============================================================================
// Contender Registration
// ============================================================================

/**
 * Build EIP-712 typed data for contender registration signing.
 *
 * The nominee election governor requires an EIP-712 signature of
 * AddContenderMessage(uint256 proposalId) to register as a contender.
 *
 * @param governorName - The name() of the nominee election governor
 * @param proposalId - The nominee election proposal ID
 * @param governorAddress - NomineeElectionGovernor contract address
 * @param chainId - Chain ID (default: 42161 for Arbitrum One)
 */
export function getAddContenderTypedData(
  governorName: string,
  proposalId: string,
  governorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): AddContenderTypedData {
  return {
    domain: {
      name: governorName,
      version: "1",
      chainId,
      verifyingContract: ethers.utils.getAddress(governorAddress) as `0x${string}`,
    },
    types: {
      AddContenderMessage: [{ name: "proposalId", type: "uint256" }],
    },
    primaryType: "AddContenderMessage",
    message: {
      proposalId: BigInt(proposalId),
    },
  };
}

/**
 * Prepare the addContender transaction.
 *
 * @param proposalId - The nominee election proposal ID
 * @param signature - The EIP-712 signature bytes
 * @param governorAddress - NomineeElectionGovernor contract address
 * @param chainId - Chain ID (default: 42161 for Arbitrum One)
 */
export function prepareAddContender(
  proposalId: string,
  signature: string,
  governorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): PreparedTransaction {
  log("prepareAddContender for proposal %s", proposalId);

  const calldata = nomineeElectionGovernorInterface.encodeFunctionData("addContender", [
    BigNumber.from(proposalId),
    signature,
  ]);

  return {
    to: ethers.utils.getAddress(governorAddress) as `0x${string}`,
    data: calldata as `0x${string}`,
    value: "0",
    chain: chainIdToChain(chainId),
    chainId,
    description: `addContender(${proposalId}) on NomineeElectionGovernor`,
  };
}

/**
 * Prepare contender registration with both typed data and transaction builder.
 *
 * Usage:
 * 1. Get governorName from the contract (e.g., via provider)
 * 2. Call prepareContenderRegistration(governorName, proposalId)
 * 3. Have the user sign the typedData
 * 4. Call result.buildTransaction(signature) to get the PreparedTransaction
 *
 * @param governorName - The name() of the nominee election governor
 * @param proposalId - The nominee election proposal ID
 * @param governorAddress - NomineeElectionGovernor contract address
 * @param chainId - Chain ID (default: 42161 for Arbitrum One)
 */
export function prepareContenderRegistration(
  governorName: string,
  proposalId: string,
  governorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): PreparedContenderRegistration {
  log("prepareContenderRegistration for proposal %s", proposalId);

  return {
    typedData: getAddContenderTypedData(governorName, proposalId, governorAddress, chainId),
    buildTransaction: (signature: string) =>
      prepareAddContender(proposalId, signature, governorAddress, chainId),
  };
}

// ============================================================================
// Vote Casting
// ============================================================================

/**
 * Prepare a castVoteWithReasonAndParams transaction for a nominee election.
 *
 * Used during NOMINEE_SELECTION phase to vote for contenders.
 *
 * @param proposalId - The nominee election proposal ID
 * @param target - Address of the contender to vote for
 * @param votes - Vote amount in wei
 * @param reason - Optional vote reason (default: "")
 * @param governorAddress - NomineeElectionGovernor contract address
 * @param chainId - Chain ID (default: 42161)
 */
export function prepareNomineeElectionVote(
  proposalId: string,
  target: string,
  votes: string | BigNumber,
  reason: string = "",
  governorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): PreparedTransaction {
  log("prepareNomineeElectionVote for proposal %s, target %s", proposalId, target);

  const params = encodeElectionVoteParams(target, votes);
  const calldata = nomineeElectionGovernorInterface.encodeFunctionData(
    "castVoteWithReasonAndParams",
    [BigNumber.from(proposalId), 1, reason, params]
  );

  return {
    to: ethers.utils.getAddress(governorAddress) as `0x${string}`,
    data: calldata as `0x${string}`,
    value: "0",
    chain: chainIdToChain(chainId),
    chainId,
    description: `castVoteWithReasonAndParams on NomineeElectionGovernor for ${target}`,
  };
}

/**
 * Prepare a castVoteWithReasonAndParams transaction for a member election.
 *
 * Used during MEMBER_ELECTION phase to vote for nominees.
 *
 * @param proposalId - The member election proposal ID
 * @param target - Address of the nominee to vote for
 * @param votes - Vote amount in wei
 * @param reason - Optional vote reason (default: "")
 * @param governorAddress - MemberElectionGovernor contract address
 * @param chainId - Chain ID (default: 42161)
 */
export function prepareMemberElectionVote(
  proposalId: string,
  target: string,
  votes: string | BigNumber,
  reason: string = "",
  governorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  chainId: number = CHAIN_IDS.ARB_ONE
): PreparedTransaction {
  log("prepareMemberElectionVote for proposal %s, target %s", proposalId, target);

  const params = encodeElectionVoteParams(target, votes);
  const calldata = memberElectionGovernorInterface.encodeFunctionData(
    "castVoteWithReasonAndParams",
    [BigNumber.from(proposalId), 1, reason, params]
  );

  return {
    to: ethers.utils.getAddress(governorAddress) as `0x${string}`,
    data: calldata as `0x${string}`,
    value: "0",
    chain: chainIdToChain(chainId),
    chainId,
    description: `castVoteWithReasonAndParams on MemberElectionGovernor for ${target}`,
  };
}
