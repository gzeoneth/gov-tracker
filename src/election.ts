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
  ElectionContender,
  ElectionNominee,
  MemberElectionNominee,
  NomineeElectionDetails,
  MemberElectionDetails,
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
  nomineeElectionGovernorInterface,
} from "./abis";
import { multicall, buildCallInput } from "./utils/multicall";

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

/** Get block range for log queries based on proposal snapshot */
async function getLogQueryBlockRange(
  governor: ethers.Contract,
  proposalId: string,
  provider: ethers.providers.Provider,
  offsetFromSnapshot: number = 1000,
  fallbackRange: number = 100000
): Promise<{ fromBlock: number; toBlock: number }> {
  const toBlock = await queryWithRetry(() => provider.getBlockNumber());
  let fromBlock: number;
  try {
    const snapshot = await queryWithRetry<BigNumber>(() => governor.proposalSnapshot(proposalId));
    fromBlock = Math.max(0, snapshot.toNumber() - offsetFromSnapshot);
  } catch {
    fromBlock = Math.max(0, toBlock - fallbackRange);
  }
  return { fromBlock, toBlock };
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
    await queryWithRetry(() => governor.nomineeVetter());
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

const PROPOSAL_STATES: readonly ProposalState[] = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

function stateToString(state: number): ProposalState {
  const result = PROPOSAL_STATES[state];
  if (!result) {
    throw new Error(`Unknown proposal state number: ${state}`);
  }
  return result;
}

function determineElectionPhase(
  nomineeProposalState: ProposalState | null,
  memberProposalId: string | null,
  memberProposalState: ProposalState | null,
  isInVettingPeriod: boolean
): ElectionPhase {
  if (memberProposalState === "Executed") {
    return "COMPLETED";
  }
  if (memberProposalId) {
    if (memberProposalState === "Succeeded" || memberProposalState === "Queued") {
      return "PENDING_EXECUTION";
    }
    return "MEMBER_ELECTION";
  }
  if (nomineeProposalState === "Executed") {
    return "PENDING_EXECUTION";
  }
  if (isInVettingPeriod) {
    return "VETTING_PERIOD";
  }
  if (nomineeProposalState === "Active" || nomineeProposalState === "Pending") {
    return "NOMINEE_SELECTION";
  }
  if (nomineeProposalState === "Succeeded") {
    return "PENDING_EXECUTION";
  }
  return "NOT_STARTED";
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
      canExecuteMember: false,
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

  // Check for member proposal using computed proposal ID (same scheme as nominee governor)
  let memberProposalId: string | null = null;
  let memberProposalState: ProposalState | null = null;

  // Compute member proposal ID using getProposeArgs + hashProposal (same as nominee)
  const computedMemberProposalId = await computeElectionProposalId(electionIndex, memberGovernor);

  try {
    // queryWithRetry handles rate limits but won't retry on revert (non-existent proposals)
    const memberState: number = await queryWithRetry(() =>
      memberGovernor.state(computedMemberProposalId)
    );
    // If we get here without reverting, the proposal exists
    memberProposalId = computedMemberProposalId;
    memberProposalState = stateToString(memberState);
  } catch {
    // Member election not yet created (state() reverts for non-existent proposals)
  }

  const phase = determineElectionPhase(
    nomineeProposalState,
    memberProposalId,
    memberProposalState,
    isInVettingPeriod
  );

  const canProceedToMemberPhase =
    nomineeProposalState === "Succeeded" &&
    !isInVettingPeriod &&
    compliantNomineeCount >= TIMING.SECURITY_COUNCIL_TARGET_NOMINEES &&
    !memberProposalId;

  const canExecuteMember = memberProposalState === "Succeeded";

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
    canExecuteMember,
  };
}

/**
 * Get the proposal ID for a given election index from any election governor
 *
 * Uses getProposeArgs to get proposal parameters and hashProposal to calculate the proposal ID.
 * Both nominee and member governors use the same proposal ID scheme via ElectionGovernor base.
 *
 * @param electionIndex - Election index
 * @param governor - Election governor contract instance
 * @returns Proposal ID as string
 */
async function computeElectionProposalId(
  electionIndex: number,
  governor: ethers.Contract
): Promise<string> {
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

  return BigNumber.from(proposalId).toString();
}

/**
 * Get the proposal ID for a given election index
 *
 * Uses getProposeArgs to get proposal parameters and hashProposal to calculate the proposal ID.
 * Verifies the proposal exists by checking state() - returns null if proposal doesn't exist.
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
  const proposalId = await computeElectionProposalId(electionIndex, governor);

  // Verify the proposal exists by checking state() - reverts for non-existent proposals
  try {
    await queryWithRetry(() => governor.state(proposalId));
    return proposalId;
  } catch {
    // Proposal doesn't exist (state() reverts for unknown proposal IDs)
    return null;
  }
}

/**
 * Get the member election proposal ID for a given election index
 *
 * @param electionIndex - Election index
 * @param provider - L2 provider
 * @param memberGovernorAddress - Optional governor address override
 * @returns Member proposal ID as string
 */
export async function getMemberElectionProposalId(
  electionIndex: number,
  provider: ethers.providers.Provider,
  memberGovernorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR
): Promise<string> {
  const governor = getMemberGovernor(memberGovernorAddress, provider);
  return computeElectionProposalId(electionIndex, governor);
}

// Member Election Trigger Functions

/**
 * Search for ProposalCreated event and extract proposal parameters
 *
 * Common helper used by both nominee and member election param lookups.
 */
async function findProposalCreatedParams(
  proposalId: string,
  governorAddress: string,
  governor: ethers.Contract,
  provider: ethers.providers.Provider
): Promise<ElectionProposalParams | null> {
  const topic = proposalCreatedInterface.getEventTopic("ProposalCreated");

  let startBlock: number;
  try {
    const snapshot = await queryWithRetry<BigNumber>(() => governor.proposalSnapshot(proposalId));
    startBlock = Math.max(0, snapshot.toNumber() - 1000);
  } catch {
    const currentBlock = await queryWithRetry(() => provider.getBlockNumber());
    startBlock = Math.max(0, currentBlock - 10000);
  }

  const currentBlock = await queryWithRetry(() => provider.getBlockNumber());

  const logs = await queryWithRetry(() =>
    provider.getLogs({
      address: governorAddress,
      topics: [topic],
      fromBlock: startBlock,
      toBlock: currentBlock,
    })
  );

  for (const eventLog of logs) {
    try {
      const parsed = proposalCreatedInterface.parseLog(eventLog);
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
 * Build a prepared execute() transaction from proposal params
 */
function buildExecuteTransaction(
  params: ElectionProposalParams,
  governorAddress: string,
  description: string
): PreparedTransaction {
  const calldata = governorInterface.encodeFunctionData("execute", [
    params.targets,
    params.values,
    params.calldatas,
    params.descriptionHash,
  ]);

  return {
    to: governorAddress,
    data: calldata,
    value: "0",
    chain: "arb1",
    chainId: 42161,
    description,
  };
}

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

  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);
  return findProposalCreatedParams(proposalId, nomineeGovernorAddress, governor, provider);
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

  const params = await getElectionProposalParams(
    electionStatus.electionIndex,
    provider,
    nomineeGovernorAddress
  );

  if (!params) {
    log("Could not find proposal params for election %d", electionStatus.electionIndex);
    return null;
  }

  return buildExecuteTransaction(
    params,
    nomineeGovernorAddress,
    `execute() on NomineeElectionGovernor to trigger member election #${electionStatus.electionIndex}`
  );
}

/**
 * Get proposal parameters for a member election
 *
 * Retrieves the targets, values, calldatas, and description hash needed to
 * execute a member election proposal.
 *
 * @param electionIndex - Election index
 * @param provider - L2 provider
 * @param memberGovernorAddress - Optional governor address override
 * @returns Proposal parameters or null if not found
 */
export async function getMemberElectionProposalParams(
  electionIndex: number,
  provider: ethers.providers.Provider,
  memberGovernorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR
): Promise<ElectionProposalParams | null> {
  log("getMemberElectionProposalParams for index %d", electionIndex);

  const memberGovernor = getMemberGovernor(memberGovernorAddress, provider);

  // Compute proposal ID using getProposeArgs + hashProposal
  const memberProposalId = await computeElectionProposalId(electionIndex, memberGovernor);

  // Verify proposal exists by checking state
  try {
    await queryWithRetry<number>(() => memberGovernor.state(memberProposalId));
  } catch {
    log("No member proposal found for election %d", electionIndex);
    return null;
  }

  return findProposalCreatedParams(
    memberProposalId,
    memberGovernorAddress,
    memberGovernor,
    provider
  );
}

/**
 * Prepare a transaction to execute member election result
 *
 * After member voting succeeds, calling execute() on the MemberElectionGovernor
 * installs the new Security Council members.
 *
 * @param electionStatus - Status from trackElectionProposal (must have canExecuteMember=true)
 * @param provider - L2 provider
 * @param memberGovernorAddress - Optional governor address override
 * @returns Prepared transaction or null if not ready
 *
 * @example
 * ```typescript
 * const status = await trackElectionProposal(5, l2Provider, l1Provider);
 *
 * if (status.canExecuteMember) {
 *   const prepared = await prepareMemberElectionExecution(status, l2Provider);
 *   if (prepared) {
 *     const tx = await signer.sendTransaction({
 *       to: prepared.to,
 *       data: prepared.data,
 *     });
 *     await tx.wait();
 *     console.log("New Security Council members installed!");
 *   }
 * }
 * ```
 */
export async function prepareMemberElectionExecution(
  electionStatus: Pick<ElectionProposalStatus, "electionIndex" | "canExecuteMember">,
  provider: ethers.providers.Provider,
  memberGovernorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR
): Promise<PreparedTransaction | null> {
  log("prepareMemberElectionExecution for election %d", electionStatus.electionIndex);

  if (!electionStatus.canExecuteMember) {
    log("Cannot execute member election - not ready");
    return null;
  }

  const params = await getMemberElectionProposalParams(
    electionStatus.electionIndex,
    provider,
    memberGovernorAddress
  );

  if (!params) {
    log("Could not find proposal params for member election %d", electionStatus.electionIndex);
    return null;
  }

  return buildExecuteTransaction(
    params,
    memberGovernorAddress,
    `execute() on MemberElectionGovernor to install new Security Council members for election #${electionStatus.electionIndex}`
  );
}

// Election Discovery & Batch Tracking

/**
 * Find the election index for a given proposal ID
 *
 * Searches through elections to find which one contains the given proposal ID
 * (either as nominee or member proposal).
 *
 * @param proposalId - The proposal ID to find
 * @param l2Provider - L2 provider
 * @param l1Provider - L1 provider (needed for trackElectionProposal)
 * @returns Election index or null if not found
 */
export async function getElectionIndexForProposalId(
  proposalId: string,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider
): Promise<number | null> {
  log("getElectionIndexForProposalId: searching for proposal %s", proposalId);

  // Get current election count
  const status = await checkElectionStatus(l2Provider, l1Provider);
  const electionCount = status.electionCount;

  // Search through elections (most recent first for efficiency)
  for (let i = electionCount - 1; i >= 0; i--) {
    try {
      const electionStatus = await trackElectionProposal(i, l2Provider, l1Provider);

      if (electionStatus.nomineeProposalId === proposalId) {
        log("Found proposal %s as nominee proposal for election %d", proposalId, i);
        return i;
      }
      if (electionStatus.memberProposalId === proposalId) {
        log("Found proposal %s as member proposal for election %d", proposalId, i);
        return i;
      }
    } catch {
      // Skip elections that fail to track
      continue;
    }
  }

  log("Proposal %s not found in any election", proposalId);
  return null;
}

/**
 * Track all active elections (not yet completed)
 *
 * Returns election statuses for all elections that are still in progress.
 *
 * @param l2Provider - L2 provider
 * @param l1Provider - L1 provider
 * @returns Array of election statuses for active elections
 */
export async function trackAllElections(
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider
): Promise<ElectionProposalStatus[]> {
  log("trackAllElections: fetching all active elections");

  const status = await checkElectionStatus(l2Provider, l1Provider);
  const electionCount = status.electionCount;
  const results: ElectionProposalStatus[] = [];

  // Track all elections (including completed for history)
  for (let i = 0; i < electionCount; i++) {
    try {
      const electionStatus = await trackElectionProposal(i, l2Provider, l1Provider);
      results.push(electionStatus);
    } catch (err) {
      log("Failed to track election %d: %s", i, err);
      // Skip failed elections
    }
  }

  log("Tracked %d elections", results.length);
  return results;
}

/**
 * Track only incomplete elections (not yet completed)
 *
 * Returns election statuses for elections that are still in progress.
 * Completed elections are excluded.
 *
 * @param l2Provider - L2 provider
 * @param l1Provider - L1 provider
 * @returns Array of election statuses for incomplete elections
 */
export async function trackIncompleteElections(
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider
): Promise<ElectionProposalStatus[]> {
  const all = await trackAllElections(l2Provider, l1Provider);
  return all.filter((e) => e.phase !== "COMPLETED");
}

// ============================================================================
// Detailed Election Tracking
// ============================================================================

/**
 * Get all contenders who registered for a nominee election
 *
 * Fetches ContenderAdded events to build the list of registered contenders.
 *
 * @param proposalId - Nominee election proposal ID
 * @param provider - L2 provider
 * @param nomineeGovernorAddress - Optional governor address override
 * @returns Array of contenders with registration info
 */
export async function getContenders(
  proposalId: string,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionContender[]> {
  log("getContenders for proposal %s", proposalId);

  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);
  const iface = new ethers.utils.Interface(NOMINEE_ELECTION_GOVERNOR_ABI);
  const { fromBlock, toBlock } = await getLogQueryBlockRange(governor, proposalId, provider);

  const logs = await queryWithRetry(() =>
    provider.getLogs({
      address: nomineeGovernorAddress,
      topics: [
        iface.getEventTopic("ContenderAdded"),
        ethers.utils.hexZeroPad(BigNumber.from(proposalId).toHexString(), 32),
      ],
      fromBlock,
      toBlock,
    })
  );

  const contenders = logs.flatMap((eventLog) => {
    try {
      const parsed = iface.parseLog(eventLog);
      return [
        {
          address: parsed.args.contender as string,
          registeredAtBlock: eventLog.blockNumber,
          registrationTxHash: eventLog.transactionHash,
        },
      ];
    } catch {
      return [];
    }
  });

  log("Found %d contenders for proposal %s", contenders.length, proposalId);
  return contenders;
}

/**
 * Get all nominees for a nominee election with their vote counts
 *
 * Fetches nominee list from contract and enriches with vote data.
 *
 * @param proposalId - Nominee election proposal ID
 * @param provider - L2 provider
 * @param nomineeGovernorAddress - Optional governor address override
 * @returns Array of nominees with vote and exclusion data
 */
export async function getNomineesWithVotes(
  proposalId: string,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionNominee[]> {
  log("getNomineesWithVotes for proposal %s", proposalId);

  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);
  const nomineeAddresses = await queryWithRetry<string[]>(() => governor.nominees(proposalId));

  if (nomineeAddresses.length === 0) {
    return [];
  }

  // Batch all votesReceived and isExcluded calls into a single RPC request
  // Order: [votes0, excluded0, votes1, excluded1, ...]
  const calls = nomineeAddresses.flatMap((addr) => [
    buildCallInput<BigNumber>(
      nomineeGovernorAddress,
      nomineeElectionGovernorInterface,
      "votesReceived",
      [proposalId, addr]
    ),
    buildCallInput<boolean>(
      nomineeGovernorAddress,
      nomineeElectionGovernorInterface,
      "isExcluded",
      [proposalId, addr]
    ),
  ]);

  const results = await multicall(provider, calls);

  // Reconstruct nominees from interleaved results
  const nominees: ElectionNominee[] = nomineeAddresses.map((addr, i) => ({
    address: addr,
    votesReceived: (results[i * 2] as BigNumber) ?? BigNumber.from(0),
    isExcluded: (results[i * 2 + 1] as boolean) ?? false,
  }));

  log("Found %d nominees for proposal %s", nominees.length, proposalId);
  return nominees;
}

/**
 * Get excluded nominees with exclusion details
 *
 * Fetches NomineeExcluded events to get exclusion information.
 *
 * @param proposalId - Nominee election proposal ID
 * @param provider - L2 provider
 * @param nomineeGovernorAddress - Optional governor address override
 * @returns Array of excluded nominees with exclusion tx info
 */
export async function getExcludedNominees(
  proposalId: string,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionNominee[]> {
  log("getExcludedNominees for proposal %s", proposalId);

  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);
  const iface = new ethers.utils.Interface(NOMINEE_ELECTION_GOVERNOR_ABI);
  const { fromBlock, toBlock } = await getLogQueryBlockRange(governor, proposalId, provider, 0);

  const logs = await queryWithRetry(() =>
    provider.getLogs({
      address: nomineeGovernorAddress,
      topics: [
        iface.getEventTopic("NomineeExcluded"),
        ethers.utils.hexZeroPad(BigNumber.from(proposalId).toHexString(), 32),
      ],
      fromBlock,
      toBlock,
    })
  );

  const parsedLogs = logs.flatMap((eventLog) => {
    try {
      const parsed = iface.parseLog(eventLog);
      return [{ eventLog, nominee: parsed.args.nominee as string }];
    } catch {
      return [];
    }
  });

  const excluded = await Promise.all(
    parsedLogs.map(async ({ eventLog, nominee }) => {
      const votesReceived = await queryWithRetry<BigNumber>(() =>
        governor.votesReceived(proposalId, nominee)
      );
      return {
        address: nominee,
        votesReceived,
        isExcluded: true,
        excludedAtBlock: eventLog.blockNumber,
        exclusionTxHash: eventLog.transactionHash,
      };
    })
  );

  log("Found %d excluded nominees for proposal %s", excluded.length, proposalId);
  return excluded;
}

/**
 * Get detailed nominee election information
 *
 * Aggregates contenders, nominees, excluded nominees, and voting data.
 *
 * @param electionIndex - Election index
 * @param provider - L2 provider
 * @param nomineeGovernorAddress - Optional governor address override
 * @returns Detailed nominee election data or null if not found
 */
export async function getNomineeElectionDetails(
  electionIndex: number,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<NomineeElectionDetails | null> {
  log("getNomineeElectionDetails for election %d", electionIndex);

  const proposalId = await getElectionProposalId(electionIndex, provider, nomineeGovernorAddress);
  if (!proposalId) {
    log("No proposal found for election %d", electionIndex);
    return null;
  }

  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);

  const [contenders, nominees, snapshotBlock] = await Promise.all([
    getContenders(proposalId, provider, nomineeGovernorAddress),
    getNomineesWithVotes(proposalId, provider, nomineeGovernorAddress),
    queryWithRetry<BigNumber>(() => governor.proposalSnapshot(proposalId)),
  ]);

  const quorumThreshold = await queryWithRetry<BigNumber>(() =>
    governor.quorum(snapshotBlock.toNumber())
  );

  const compliantNominees = nominees.filter((n) => !n.isExcluded);
  const excludedNominees = nominees.filter((n) => n.isExcluded);

  return {
    proposalId,
    electionIndex,
    contenders,
    nominees,
    compliantNominees,
    excludedNominees,
    quorumThreshold,
    targetNomineeCount: TIMING.SECURITY_COUNCIL_TARGET_NOMINEES,
  };
}

/**
 * Get member election results with weighted votes
 *
 * Fetches top nominees (winners) and their weighted vote totals.
 *
 * @param electionIndex - Election index
 * @param provider - L2 provider
 * @param memberGovernorAddress - Optional governor address override
 * @param nomineeGovernorAddress - Optional nominee governor address override
 * @returns Detailed member election data or null if not found
 */
export async function getMemberElectionDetails(
  electionIndex: number,
  provider: ethers.providers.Provider,
  memberGovernorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<MemberElectionDetails | null> {
  log("getMemberElectionDetails for election %d", electionIndex);

  const memberGovernor = getMemberGovernor(memberGovernorAddress, provider);
  const nomineeGovernor = getNomineeGovernor(nomineeGovernorAddress, provider);

  // Compute proposal ID using getProposeArgs + hashProposal (same scheme as nominee governor)
  const memberProposalId = await computeElectionProposalId(electionIndex, memberGovernor);

  // Verify proposal exists by checking state (reverts for non-existent proposals)
  try {
    await queryWithRetry<number>(() => memberGovernor.state(memberProposalId));
  } catch {
    log("No member proposal found for election %d", electionIndex);
    return null;
  }

  const [winners, deadline, fullWeightDeadline, nomineeProposalId] = await Promise.all([
    queryWithRetry<string[]>(() => memberGovernor.topNominees(memberProposalId)).catch(() => []),
    queryWithRetry<BigNumber>(() => memberGovernor.proposalDeadline(memberProposalId)),
    queryWithRetry<BigNumber>(() => memberGovernor.fullWeightVotingDeadline(memberProposalId)),
    getElectionProposalId(electionIndex, provider, nomineeGovernorAddress),
  ]);

  const allNominees = nomineeProposalId
    ? await queryWithRetry<string[]>(() => nomineeGovernor.compliantNominees(nomineeProposalId))
    : [];

  const winnersSet = new Set(winners.map((w) => w.toLowerCase()));

  const nomineeWeights = await Promise.all(
    allNominees.map(async (addr) => ({
      addr,
      weight: await queryWithRetry<BigNumber>(() =>
        memberGovernor.weightReceived(memberProposalId, addr)
      ),
    }))
  );

  const nomineeDetails: MemberElectionNominee[] = nomineeWeights
    .sort((a, b) => (b.weight.gt(a.weight) ? 1 : -1))
    .map((n, i) => ({
      address: n.addr,
      weightReceived: n.weight,
      isWinner: winnersSet.has(n.addr.toLowerCase()),
      rank: i + 1,
    }));

  return {
    proposalId: memberProposalId,
    electionIndex,
    nominees: nomineeDetails,
    winners,
    fullWeightDeadline: fullWeightDeadline.toNumber(),
    proposalDeadline: deadline.toNumber(),
  };
}
