/**
 * Security Council Election Tracking
 *
 * Provides functions to check election status and prepare election creation transactions.
 * Based on SecurityCouncilElectionTracker from governance repo.
 *
 * @module election
 */

import { ethers, BigNumber } from "ethers";
import { ADDRESSES, TIMING } from "./constants";
import { queryWithRetry } from "./utils/rpc-utils";
import {
  PreparedTransaction,
  ProposalCreatedEventArgs,
  ProposalState,
  CohortType,
  ElectionPhase,
  ElectionProposalStatus,
  ElectionStatus,
} from "./types";
import { getL1BlockNumberFromL2 } from "./utils/timing";
import { saltFromDescription } from "./utils/salt-computation";
import { loggers } from "./utils/logger";

const log = loggers.election;
import {
  NOMINEE_ELECTION_GOVERNOR_ABI,
  MEMBER_ELECTION_GOVERNOR_ABI,
  proposalCreatedInterface,
  governorInterface,
} from "./abis";

/**
 * Prepared election creation transaction
 */
export interface PreparedElectionCreation {
  /** Transaction to send */
  transaction: PreparedTransaction;
  /** Election index being created */
  electionIndex: number;
}

/**
 * Election proposal parameters needed for execute() call
 */
export interface ElectionProposalParams {
  /** Target addresses */
  targets: string[];
  /** ETH values */
  values: BigNumber[];
  /** Call data for each target */
  calldatas: string[];
  /** Proposal description */
  description: string;
  /** Keccak256 hash of description */
  descriptionHash: string;
}

// Helper functions

/** Create a nominee election governor contract instance */
function getNomineeGovernor(
  address: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  provider?: ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(address, NOMINEE_ELECTION_GOVERNOR_ABI, provider);
}

/** Create a member election governor contract instance */
function getMemberGovernor(
  address: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  provider?: ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(address, MEMBER_ELECTION_GOVERNOR_ABI, provider);
}

// Core Functions

/**
 * Check the status of the Security Council election
 *
 * Determines if a new election can be created and when the next one is scheduled.
 *
 * @param l2Provider - Arbitrum One provider
 * @param l1Provider - Ethereum mainnet provider (for L1 timestamp)
 * @param nomineeGovernorAddress - Optional override for nominee election governor address
 * @returns Election status information
 *
 * @example
 * ```typescript
 * const status = await checkElectionStatus(l2Provider, l1Provider);
 *
 * if (status.canCreateElection) {
 *   console.log("Election ready to create!");
 * } else {
 *   console.log(`Next election in ${status.timeUntilElection}`);
 * }
 * ```
 */
export async function checkElectionStatus(
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionStatus> {
  log("checkElectionStatus for %s", nomineeGovernorAddress);

  const governor = getNomineeGovernor(nomineeGovernorAddress, l2Provider);

  // Get L1 block number as seen from L2
  const l1BlockNumber = await getL1BlockNumberFromL2(l2Provider);
  log("L1 block number from L2: %s", l1BlockNumber.toString());

  // Get L1 timestamp for that block
  const l1Block = await queryWithRetry(() => l1Provider.getBlock(l1BlockNumber.toNumber()));
  if (!l1Block) {
    throw new Error(
      `L1 block ${l1BlockNumber.toString()} not found. ` +
        `If using a fork, ensure L1 is forked at a block >= ${l1BlockNumber.toString()}`
    );
  }
  const currentL1Timestamp = l1Block.timestamp;
  log("L1 timestamp: %d", currentL1Timestamp);

  // Get election count, cohort, and next election timestamp
  const electionCount = await queryWithRetry<BigNumber>(() => governor.electionCount());
  const [nextElectionTimestamp, cohort] = await Promise.all([
    queryWithRetry<BigNumber>(() => governor.electionToTimestamp(electionCount)),
    queryWithRetry<number>(() => governor.electionIndexToCohort(electionCount)),
  ]);
  log(
    "electionCount=%s nextTimestamp=%s cohort=%d",
    electionCount.toString(),
    nextElectionTimestamp.toString(),
    cohort
  );

  const secondsUntilElection = Math.max(0, nextElectionTimestamp.toNumber() - currentL1Timestamp);
  const canCreateElection = secondsUntilElection === 0;

  return {
    electionCount: electionCount.toNumber(),
    cohort: cohort as CohortType,
    nextElectionTimestamp: nextElectionTimestamp.toNumber(),
    currentL1Timestamp,
    canCreateElection,
    secondsUntilElection,
    timeUntilElection: formatDuration(secondsUntilElection),
  };
}

/**
 * Prepare a transaction to create a new Security Council election
 *
 * Only call this if checkElectionStatus indicates canCreateElection is true.
 *
 * @param electionStatus - Status from checkElectionStatus (provides current election count)
 * @param nomineeGovernorAddress - Optional override for nominee election governor address
 * @returns Prepared transaction for creating the election
 *
 * @example
 * ```typescript
 * const status = await checkElectionStatus(l2Provider, l1Provider);
 *
 * if (status.canCreateElection) {
 *   const { transaction, electionIndex } = prepareElectionCreation(status);
 *   console.log(`Creating election #${electionIndex}`);
 *   // Execute with your signer
 *   const tx = await signer.sendTransaction({
 *     to: transaction.to,
 *     data: transaction.data,
 *   });
 *   await tx.wait();
 * }
 * ```
 */
export function prepareElectionCreation(
  electionStatus: Pick<ElectionStatus, "electionCount">,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): PreparedElectionCreation {
  const governor = getNomineeGovernor(nomineeGovernorAddress);

  const calldata = governor.interface.encodeFunctionData("createElection", []);

  return {
    transaction: {
      to: nomineeGovernorAddress,
      data: calldata,
      value: "0",
      chain: "arb1",
      chainId: 42161,
      description: `createElection() on SecurityCouncilNomineeElectionGovernor for election #${electionStatus.electionCount}`,
    },
    electionIndex: electionStatus.electionCount,
  };
}

/**
 * Check if a governor has a vetting period (is a nominee election governor)
 *
 * @param governorAddress - Address of the governor to check
 * @param provider - Provider for the chain the governor is on
 * @returns True if the governor has a vetting period
 */
export async function hasVettingPeriod(
  governorAddress: string,
  provider: ethers.providers.Provider
): Promise<boolean> {
  const governor = getNomineeGovernor(governorAddress, provider);

  try {
    await governor.nomineeVetter();
    return true;
  } catch {
    return false;
  }
}

// Helpers

/**
 * Format a duration in seconds to a human-readable string
 */
function formatDuration(seconds: number): string {
  if (seconds <= 0) return "now";

  // Ensure we're working with integers for clean display
  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && parts.length < 2) parts.push(`${secs}s`);

  return parts.join(" ") || "0s";
}

/**
 * Convert numeric proposal state to string
 */
function stateToString(state: number): ProposalState {
  const states: ProposalState[] = [
    "Pending",
    "Active",
    "Canceled",
    "Defeated",
    "Succeeded",
    "Queued",
    "Expired",
    "Executed",
  ];
  const result = states[state];
  if (!result) {
    throw new Error(`Unknown proposal state number: ${state}`);
  }
  return result;
}

// Election Proposal Tracking

/**
 * Track the status of a Security Council election by its index
 *
 * This function provides detailed tracking of an election's progress through
 * the nominee selection, vetting, and member election phases.
 *
 * @param electionIndex - The election index to track
 * @param l2Provider - Arbitrum One provider
 * @param l1Provider - Ethereum mainnet provider (for L1 block number)
 * @param options - Optional address overrides
 * @returns Detailed election proposal status
 *
 * @example
 * ```typescript
 * const status = await trackElectionProposal(
 *   5, // election index
 *   l2Provider,
 *   l1Provider
 * );
 *
 * if (status.phase === "VETTING_PERIOD") {
 *   console.log(`${status.compliantNomineeCount}/6 nominees compliant`);
 * }
 * ```
 */
export async function trackElectionProposal(
  electionIndex: number,
  l2Provider: ethers.providers.Provider,
  _l1Provider: ethers.providers.Provider,
  options: {
    nomineeGovernorAddress?: string;
    memberGovernorAddress?: string;
  } = {}
): Promise<ElectionProposalStatus> {
  const nomineeGovernorAddress =
    options.nomineeGovernorAddress ?? ADDRESSES.ELECTION_NOMINEE_GOVERNOR;
  const memberGovernorAddress = options.memberGovernorAddress ?? ADDRESSES.ELECTION_MEMBER_GOVERNOR;

  log("trackElectionProposal for index %d", electionIndex);

  const nomineeGovernor = getNomineeGovernor(nomineeGovernorAddress, l2Provider);
  const memberGovernor = getMemberGovernor(memberGovernorAddress, l2Provider);

  // Get cohort for this election
  const cohort = (await queryWithRetry<number>(() =>
    nomineeGovernor.electionIndexToCohort(electionIndex)
  )) as CohortType;

  // Get nominee proposal ID for this election
  const nomineeProposalId = await getElectionProposalId(
    electionIndex,
    l2Provider,
    nomineeGovernorAddress
  );

  // If no nominee proposal, election hasn't started
  if (!nomineeProposalId) {
    return {
      electionIndex,
      phase: "NOT_STARTED",
      cohort,
      nomineeProposalId: null,
      memberProposalId: null,
      nomineeProposalState: null,
      memberProposalState: null,
      compliantNomineeCount: 0,
      targetNomineeCount: TIMING.SECURITY_COUNCIL_TARGET_NOMINEES,
      vettingDeadline: null,
      isInVettingPeriod: false,
      canProceedToMemberPhase: false,
    };
  }

  // Get nominee proposal state
  const nomineeState = await queryWithRetry<number>(() => nomineeGovernor.state(nomineeProposalId));
  const nomineeProposalState = stateToString(nomineeState);

  // Get vetting deadline
  const vettingDeadlineBN = await queryWithRetry<BigNumber>(() =>
    nomineeGovernor.proposalVettingDeadline(nomineeProposalId)
  );
  const vettingDeadline = vettingDeadlineBN.toNumber();

  // Get current L1 block number
  const currentL1Block = await getL1BlockNumberFromL2(l2Provider);

  // Determine if in vetting period
  const isInVettingPeriod =
    nomineeProposalState === "Succeeded" && currentL1Block.lte(vettingDeadlineBN);

  // Get compliant nominee count
  let compliantNomineeCount = 0;
  try {
    const count = await queryWithRetry<BigNumber>(() =>
      nomineeGovernor.compliantNomineeCount(nomineeProposalId)
    );
    compliantNomineeCount = count.toNumber();
  } catch {
    // May fail if no nominees yet
  }

  // Check for member proposal
  let memberProposalId: string | null = null;
  let memberProposalState: ProposalState | null = null;

  try {
    const memberPropId = await queryWithRetry<BigNumber>(() =>
      memberGovernor.electionIndexToProposalId(electionIndex)
    );
    if (!memberPropId.isZero()) {
      memberProposalId = memberPropId.toString();
      const memberState = await queryWithRetry<number>(() =>
        memberGovernor.state(memberProposalId)
      );
      memberProposalState = stateToString(memberState);
    }
  } catch {
    // Member election not yet created
  }

  // Determine phase
  let phase: ElectionPhase;
  if (memberProposalState === "Executed") {
    phase = "COMPLETED";
  } else if (memberProposalId) {
    if (memberProposalState === "Succeeded" || memberProposalState === "Queued") {
      phase = "PENDING_EXECUTION";
    } else {
      phase = "MEMBER_ELECTION";
    }
  } else if (isInVettingPeriod) {
    phase = "VETTING_PERIOD";
  } else if (nomineeProposalState === "Active" || nomineeProposalState === "Pending") {
    phase = "NOMINEE_SELECTION";
  } else if (nomineeProposalState === "Succeeded") {
    // Past vetting, waiting for member election creation
    phase = "PENDING_EXECUTION";
  } else {
    phase = "NOT_STARTED";
  }

  // Can proceed if vetting ended and has enough compliant nominees
  const canProceedToMemberPhase =
    nomineeProposalState === "Succeeded" &&
    !isInVettingPeriod &&
    compliantNomineeCount >= TIMING.SECURITY_COUNCIL_TARGET_NOMINEES &&
    !memberProposalId;

  return {
    electionIndex,
    phase,
    cohort,
    nomineeProposalId,
    memberProposalId,
    nomineeProposalState,
    memberProposalState,
    compliantNomineeCount,
    targetNomineeCount: TIMING.SECURITY_COUNCIL_TARGET_NOMINEES,
    vettingDeadline,
    isInVettingPeriod,
    canProceedToMemberPhase,
  };
}

/**
 * Get the proposal ID for a given election index
 *
 * Uses getProposeArgs to get proposal parameters and hashProposal to calculate the proposal ID.
 *
 * @param electionIndex - Election index
 * @param provider - L2 provider
 * @param nomineeGovernorAddress - Optional governor address override
 * @returns Proposal ID or null if election not yet created
 */
export async function getElectionProposalId(
  electionIndex: number,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<string | null> {
  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);

  // Get proposal arguments for this election
  // getProposeArgs returns: [targets, values, calldatas, description]
  const proposeArgs = (await queryWithRetry(() => governor.getProposeArgs(electionIndex))) as [
    string[],
    BigNumber[],
    string[],
    string,
  ];

  const [targets, values, calldatas, description] = proposeArgs;

  // Hash the description to get descriptionHash
  const descriptionHash = saltFromDescription(description);

  // Calculate proposal ID using hashProposal
  const proposalId = await queryWithRetry(() =>
    governor.hashProposal(targets, values, calldatas, descriptionHash)
  );

  // Convert bytes32 to decimal string
  return BigNumber.from(proposalId).toString();
}

// Member Election Trigger Functions

/**
 * Get the proposal parameters for an election proposal
 *
 * Searches for the ProposalCreated event to extract targets, values, calldatas,
 * and description needed for execute() call.
 *
 * @param electionIndex - Election index
 * @param provider - L2 provider
 * @param nomineeGovernorAddress - Optional governor address override
 * @returns Election proposal params or null if not found
 */
export async function getElectionProposalParams(
  electionIndex: number,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionProposalParams | null> {
  log("getElectionProposalParams for index %d", electionIndex);

  const proposalId = await getElectionProposalId(electionIndex, provider, nomineeGovernorAddress);
  if (!proposalId) {
    log("No proposal ID found for election %d", electionIndex);
    return null;
  }

  // Search for ProposalCreated event
  const topic = proposalCreatedInterface.getEventTopic("ProposalCreated");

  // Get proposal snapshot to narrow search range
  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);

  let startBlock: number;
  try {
    const snapshot = await governor.proposalSnapshot(proposalId);
    // Search from ~1000 blocks before snapshot (proposal is created before snapshot)
    startBlock = Math.max(0, snapshot.toNumber() - 1000);
  } catch {
    // Fallback: search last 10000 blocks
    const currentBlock = await provider.getBlockNumber();
    startBlock = Math.max(0, currentBlock - 10000);
  }

  const currentBlock = await provider.getBlockNumber();

  const logs = await queryWithRetry(() =>
    provider.getLogs({
      address: nomineeGovernorAddress,
      topics: [topic],
      fromBlock: startBlock,
      toBlock: currentBlock,
    })
  );

  // Find the log matching our proposal ID
  for (const eventLog of logs) {
    try {
      const parsed = proposalCreatedInterface.parseLog(eventLog);
      // Cast through unknown required due to ethers' Result type structure
      const args = parsed.args as unknown as ProposalCreatedEventArgs;
      if (args.proposalId.toString() === proposalId) {
        log("Found ProposalCreated event for proposal %s", proposalId);
        return {
          targets: args.targets,
          values: args.values,
          calldatas: args.calldatas,
          description: args.description,
          descriptionHash: saltFromDescription(args.description),
        };
      }
    } catch {
      continue;
    }
  }

  log("ProposalCreated event not found for proposal %s", proposalId);
  return null;
}

/**
 * Prepare a transaction to trigger member election creation
 *
 * After the vetting period ends with 6+ compliant nominees, calling execute()
 * on the NomineeElectionGovernor creates the member election proposal.
 *
 * @param electionStatus - Status from trackElectionProposal (must have canProceedToMemberPhase=true)
 * @param provider - L2 provider
 * @param nomineeGovernorAddress - Optional governor address override
 * @returns Prepared transaction or null if not ready
 *
 * @example
 * ```typescript
 * const status = await trackElectionProposal(5, l2Provider, l1Provider);
 *
 * if (status.canProceedToMemberPhase) {
 *   const prepared = await prepareMemberElectionTrigger(status, l2Provider);
 *   if (prepared) {
 *     const tx = await signer.sendTransaction({
 *       to: prepared.to,
 *       data: prepared.data,
 *     });
 *     await tx.wait();
 *     console.log("Member election created!");
 *   }
 * }
 * ```
 */
export async function prepareMemberElectionTrigger(
  electionStatus: Pick<ElectionProposalStatus, "electionIndex" | "canProceedToMemberPhase">,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<PreparedTransaction | null> {
  log("prepareMemberElectionTrigger for election %d", electionStatus.electionIndex);

  if (!electionStatus.canProceedToMemberPhase) {
    log("Cannot proceed to member phase - not ready");
    return null;
  }

  // Get proposal params
  const params = await getElectionProposalParams(
    electionStatus.electionIndex,
    provider,
    nomineeGovernorAddress
  );

  if (!params) {
    log("Could not find proposal params for election %d", electionStatus.electionIndex);
    return null;
  }

  // Build execute calldata using governor interface
  const calldata = governorInterface.encodeFunctionData("execute", [
    params.targets,
    params.values,
    params.calldatas,
    params.descriptionHash,
  ]);

  return {
    to: nomineeGovernorAddress,
    data: calldata,
    value: "0",
    chain: "arb1",
    chainId: 42161,
    description: `execute() on NomineeElectionGovernor to trigger member election #${electionStatus.electionIndex}`,
  };
}
