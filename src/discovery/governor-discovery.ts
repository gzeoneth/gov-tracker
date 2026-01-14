/**
 * Governor discovery module
 *
 * Find proposals, detect governor type, parse ProposalCreated events.
 * Also includes proposal discovery functions for block range scanning.
 */

import { BigNumber, ethers } from "ethers";
import {
  GovernorCapability,
  ProposalType,
  ProposalData,
  ProposalState,
  VotingData,
  SearchHint,
  ProposalCreatedEventArgs,
} from "../types";
import {
  ADDRESSES,
  EVENT_TOPICS,
  GOVERNANCE_START_BLOCKS,
  PROPOSAL_STATE_MAP,
  CHUNK_SIZES,
} from "../constants";
import { findLog, findAndParseEvent, searchLogsInChunks } from "../utils/log-search";
import { findFirstLog } from "../utils/log-filters";
import { queryWithRetry } from "../utils/rpc-utils";
import { getCurrentBlockInfo, getL1BlockNumberFromL2 } from "../utils/timing";
import {
  GOVERNOR_ABI,
  proposalCreatedInterface,
  proposalQueuedInterface,
  governorInterface,
} from "../abis";
import { hasVettingPeriod } from "../election";
import { multicall, buildCallInput } from "../utils/multicall";
import { addressEquals } from "../utils/chain";
import { truncateDescription } from "../utils/sanitize";

// Discovery Types (merged from monitor-discovery.ts)

/** Discovered proposal from ProposalCreated event */
export interface DiscoveredProposal {
  governorAddress: string;
  proposalId: string;
  creationTxHash: string;
  creationBlock: number;
}

/**
 * Detect governor type from address
 */
export function detectProposalType(governorAddress: string): ProposalType {
  if (addressEquals(governorAddress, ADDRESSES.CONSTITUTIONAL_GOVERNOR)) return "CONSTITUTIONAL";
  if (addressEquals(governorAddress, ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR))
    return "NON_CONSTITUTIONAL";
  if (addressEquals(governorAddress, ADDRESSES.ELECTION_NOMINEE_GOVERNOR))
    return "ELECTION_NOMINEE";
  if (addressEquals(governorAddress, ADDRESSES.ELECTION_MEMBER_GOVERNOR)) return "ELECTION_MEMBER";
  return "UNKNOWN";
}

/**
 * Check if a governor type is a Security Council election governor
 */
export function isElectionProposal(proposalType: ProposalType): boolean {
  return proposalType === "ELECTION_NOMINEE" || proposalType === "ELECTION_MEMBER";
}

/**
 * Check if a governor has a timelock() function
 *
 * Governors with timelock route proposals through L2 timelock before execution.
 */
async function hasTimelock(
  governorAddress: string,
  provider: ethers.providers.Provider
): Promise<boolean> {
  const governor = new ethers.Contract(governorAddress, GOVERNOR_ABI, provider);
  try {
    await queryWithRetry(() => governor.timelock());
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect governor capabilities by probing the contract
 *
 * This function determines the execution path for proposals:
 * - WITH_TIMELOCK: Governor -> L2Timelock -> (optional L1 round-trip)
 * - WITH_VETTING: Same as WITH_TIMELOCK but with vetting period
 * - NO_TIMELOCK: Direct governor.execute() without timelock
 *
 * The detection order matters:
 * 1. Check for timelock() first - most governors have this
 * 2. Check for nomineeVetter() - only Security Council Nominee Election Governor
 * 3. Default to NO_TIMELOCK - Security Council Member Election Governor
 */
export async function detectGovernorCapabilities(
  governorAddress: string,
  provider: ethers.providers.Provider
): Promise<GovernorCapability> {
  // Check for timelock first (most common case)
  if (await hasTimelock(governorAddress, provider)) {
    return "WITH_TIMELOCK";
  }

  // Check for vetting period (Security Council Nominee Election)
  if (await hasVettingPeriod(governorAddress, provider)) {
    return "WITH_VETTING";
  }

  // No timelock and no vetting - direct execution
  return "NO_TIMELOCK";
}

/**
 * Get the timelock address for a governor
 */
export async function getTimelockAddress(
  governorAddress: string,
  provider: ethers.providers.Provider
): Promise<string> {
  const governor = new ethers.Contract(governorAddress, GOVERNOR_ABI, provider);

  return queryWithRetry(() => governor.timelock());
}

/**
 * Get proposal state from governor contract
 */
export async function getProposalState(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider
): Promise<ProposalState> {
  const governor = new ethers.Contract(governorAddress, GOVERNOR_ABI, provider);

  const stateNum = (await queryWithRetry(() => governor.state(BigNumber.from(proposalId)))) as
    | number
    | BigNumber;

  const stateNumber = typeof stateNum === "number" ? stateNum : (stateNum as BigNumber).toNumber();
  const state = PROPOSAL_STATE_MAP[stateNumber];
  if (!state) {
    throw new Error(`Unknown proposal state number: ${stateNumber}`);
  }
  return state;
}

/**
 * Parse ProposalCreated event data
 */
export function parseProposalCreatedEvent(log: ethers.providers.Log): ProposalData | null {
  try {
    const parsed = proposalCreatedInterface.parseLog(log);
    // Cast through unknown required due to ethers' Result type structure
    const args = parsed.args as unknown as ProposalCreatedEventArgs;

    return {
      proposalId: args.proposalId.toString(),
      proposer: args.proposer,
      targets: args.targets,
      values: parsed.args[3], // `values` collides with ethers.js internals
      signatures: args.signatures,
      calldatas: args.calldatas,
      startBlock: args.startBlock,
      endBlock: args.endBlock,
      description: truncateDescription(args.description),
      creationBlock: log.blockNumber,
      creationTxHash: log.transactionHash,
    };
  } catch {
    return null;
  }
}

/**
 * Find ProposalCreated event by proposal ID
 *
 * @param hint - Search optimization hint. Default is backward search from current block.
 */
export async function findProposalCreatedEvent(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider,
  hint?: SearchHint
): Promise<ProposalData | null> {
  const { blockNumber: currentBlock } = await getCurrentBlockInfo(provider);

  // Apply search hint (default: search backward from current block)
  const fromBlock = hint?.startBlock ?? GOVERNANCE_START_BLOCKS.L2;
  const toBlock = hint?.endBlock ?? currentBlock;
  const reverseDirection = hint?.direction === "backward" || !hint?.direction;

  // Note: ProposalCreated event does NOT have indexed proposalId
  // We filter by event topic only and use predicate for exact matching
  return findAndParseEvent(
    provider,
    { address: governorAddress, topics: [EVENT_TOPICS.PROPOSAL_CREATED], fromBlock, toBlock },
    (l) => parseProposalCreatedEvent(l)?.proposalId === proposalId,
    parseProposalCreatedEvent,
    { chunkSize: hint?.chunkSize ?? CHUNK_SIZES.L2, reverseDirection }
  );
}

/**
 * Find ProposalCreated event by transaction hash
 */
export async function findProposalByTxHash(
  txHash: string,
  provider: ethers.providers.Provider
): Promise<ProposalData | null> {
  const receipt = await queryWithRetry(() => provider.getTransactionReceipt(txHash));

  if (!receipt) {
    return null;
  }

  return findFirstLog(
    receipt.logs,
    { topic: EVENT_TOPICS.PROPOSAL_CREATED },
    parseProposalCreatedEvent
  );
}

interface ProposalVotes {
  againstVotes: BigNumber;
  forVotes: BigNumber;
  abstainVotes: BigNumber;
}

/**
 * Get voting information for a proposal
 */
export async function getVotingData(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider
): Promise<VotingData> {
  const proposalIdBN = BigNumber.from(proposalId);

  // First batch: proposalSnapshot, proposalDeadline, proposalVotes + getCurrentBlockInfo in parallel
  const [firstBatchResults, { blockNumber: currentBlock }] = await Promise.all([
    multicall(provider, [
      buildCallInput<BigNumber>(governorAddress, governorInterface, "proposalSnapshot", [
        proposalIdBN,
      ]),
      buildCallInput<BigNumber>(governorAddress, governorInterface, "proposalDeadline", [
        proposalIdBN,
      ]),
      // Custom decoder for proposalVotes which returns multiple values
      {
        targetAddr: governorAddress,
        encoder: () => governorInterface.encodeFunctionData("proposalVotes", [proposalIdBN]),
        decoder: (returnData: string): ProposalVotes => {
          const result = governorInterface.decodeFunctionResult("proposalVotes", returnData);
          return {
            againstVotes: result.againstVotes,
            forVotes: result.forVotes,
            abstainVotes: result.abstainVotes,
          };
        },
      },
    ]),
    getCurrentBlockInfo(provider),
  ]);

  const startBlock = firstBatchResults[0] as BigNumber;
  const deadline = firstBatchResults[1] as BigNumber;
  const votes = firstBatchResults[2] as ProposalVotes;

  // Second batch: quorum (needs startBlock), proposalExtendedDeadline, proposalVettingDeadline
  // Note: proposalExtendedDeadline and proposalVettingDeadline may not exist on all governors
  // With requireSuccess=false, failed calls return undefined
  const secondBatchResults = await multicall(provider, [
    buildCallInput<BigNumber>(governorAddress, governorInterface, "quorum", [startBlock]),
    buildCallInput<BigNumber>(governorAddress, governorInterface, "proposalExtendedDeadline", [
      proposalIdBN,
    ]),
    buildCallInput<BigNumber>(governorAddress, governorInterface, "proposalVettingDeadline", [
      proposalIdBN,
    ]),
  ]);

  const quorum = secondBatchResults[0] as BigNumber;
  const extendedResult = secondBatchResults[1] as BigNumber | undefined;
  const vettingResult = secondBatchResults[2] as BigNumber | undefined;

  const extendedDeadline = extendedResult?.gt(0) ? extendedResult : undefined;

  // Handle vetting deadline (L1 block number comparison)
  let vettingDeadline: BigNumber | undefined;
  let isVettingPeriod = false;
  if (vettingResult?.gt(0)) {
    vettingDeadline = vettingResult;
    const l1Block = await getL1BlockNumberFromL2(provider);
    isVettingPeriod = l1Block.lte(vettingResult);
  }

  const effectiveDeadline = extendedDeadline ?? deadline;
  const hasReachedQuorum = votes.forVotes.gte(quorum);
  const isVotingPeriodOver = BigNumber.from(currentBlock).gt(effectiveDeadline);

  return {
    startBlock,
    endBlock: deadline,
    deadline: effectiveDeadline,
    forVotes: votes.forVotes,
    againstVotes: votes.againstVotes,
    abstainVotes: votes.abstainVotes,
    quorum,
    hasReachedQuorum,
    isVotingPeriodOver,
    extendedDeadline,
    vettingDeadline,
    isVettingPeriod,
  };
}

/**
 * Find ProposalQueued event for a proposal
 *
 * Note: ProposalQueued(uint256 proposalId, uint256 eta) has NON-INDEXED parameters,
 * so we cannot filter by proposalId in topics. We must search for all ProposalQueued
 * events and decode the data to find the matching proposalId.
 *
 * @param hint - Search optimization hint. Default is backward search from current block.
 */
export async function findProposalQueuedEvent(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider,
  hint?: SearchHint
): Promise<{
  blockNumber: number;
  txHash: string;
  eta: BigNumber;
} | null> {
  const { blockNumber: currentBlock } = await getCurrentBlockInfo(provider);

  // Apply search hint (default: search backward from current block)
  const fromBlock = hint?.startBlock ?? GOVERNANCE_START_BLOCKS.L2;
  const toBlock = hint?.endBlock ?? currentBlock;
  const reverseDirection = hint?.direction === "backward" || !hint?.direction;

  const targetProposalId = BigNumber.from(proposalId);

  // ProposalQueued has non-indexed parameters, so we search by event signature only
  // and decode the data to match the proposalId
  const log = await findLog(
    provider,
    {
      address: governorAddress,
      topics: [EVENT_TOPICS.PROPOSAL_QUEUED],
      fromBlock,
      toBlock,
    },
    (logEntry) => {
      try {
        const parsed = proposalQueuedInterface.parseLog(logEntry);
        return parsed.args.proposalId.eq(targetProposalId);
      } catch {
        return false;
      }
    },
    { chunkSize: hint?.chunkSize ?? CHUNK_SIZES.L2, reverseDirection }
  );

  if (!log) {
    return null;
  }

  try {
    const parsed = proposalQueuedInterface.parseLog(log);
    return {
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      eta: parsed.args.eta,
    };
  } catch {
    return null;
  }
}

// Discovery Functions (merged from monitor-discovery.ts)

/** Discover proposals from a governor in a block range */
export async function discoverProposals(
  governorAddress: string,
  fromBlock: number,
  toBlock: number,
  provider: ethers.providers.Provider,
  options: { chunkSize?: number } = {}
): Promise<DiscoveredProposal[]> {
  if (fromBlock >= toBlock) return [];

  const { logs } = await searchLogsInChunks(
    provider,
    { address: governorAddress, topics: [EVENT_TOPICS.PROPOSAL_CREATED], fromBlock, toBlock },
    { chunkSize: options.chunkSize ?? CHUNK_SIZES.L2 }
  );

  const seen = new Set<string>();
  return logs.flatMap((log) => {
    if (seen.has(log.transactionHash)) return [];
    seen.add(log.transactionHash);
    const parsed = parseProposalCreatedEvent(log);
    return parsed
      ? [
          {
            governorAddress,
            proposalId: parsed.proposalId,
            creationTxHash: log.transactionHash,
            creationBlock: log.blockNumber,
          },
        ]
      : [];
  });
}

/** Discover a proposal by transaction hash */
export async function discoverProposalByTxHash(
  txHash: string,
  provider: ethers.providers.Provider
): Promise<DiscoveredProposal | null> {
  const receipt = await queryWithRetry(() => provider.getTransactionReceipt(txHash));
  if (!receipt) return null;

  const log = receipt.logs.find((l) => l.topics[0] === EVENT_TOPICS.PROPOSAL_CREATED);
  if (!log) return null;

  const parsed = parseProposalCreatedEvent(log);
  return parsed
    ? {
        governorAddress: log.address,
        proposalId: parsed.proposalId,
        creationTxHash: txHash,
        creationBlock: receipt.blockNumber,
      }
    : null;
}
