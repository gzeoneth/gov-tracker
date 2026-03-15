import { ethers, BigNumber } from "ethers";
import { ADDRESSES, MAINNET_ELECTION_CONFIG, PROPOSAL_STATE_MAP } from "../constants";
import { formatDuration } from "../utils/formatters";
import { queryWithRetry } from "../utils/rpc-utils";
import {
  CohortType,
  ElectionConfig,
  ElectionPhase,
  ElectionStatus,
  ElectionStatusWithPhase,
  ProposalState,
} from "../types";
import { getL1BlockNumberFromL2 } from "../utils/timing";
import { loggers } from "../utils/logger";
import { nomineeElectionGovernorInterface } from "../abis";
import { getNomineeGovernor, getMemberGovernor } from "./contracts";
import { multicall, buildCallInput } from "../utils/multicall";
import { getElectionProposalIds } from "./proposal-ids";

const log = loggers.election;

/**
 * Get the current election count without fetching full status.
 * This is a lightweight call that only fetches the count (single multicall).
 *
 * @param l2Provider - Arbitrum One provider
 * @param nomineeGovernorAddress - Optional custom nominee governor address
 * @returns The number of elections that have been created
 */
export async function getElectionCount(
  l2Provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<number> {
  log("getElectionCount for %s", nomineeGovernorAddress);

  const [electionCount] = await multicall(l2Provider, [
    buildCallInput<BigNumber>(
      nomineeGovernorAddress,
      nomineeElectionGovernorInterface,
      "electionCount",
      []
    ),
  ]);

  return (electionCount as BigNumber).toNumber();
}

export function determineElectionPhase(
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
  if (nomineeProposalState === "Pending") {
    return "CONTENDER_SUBMISSION";
  }
  if (nomineeProposalState === "Active") {
    return "NOMINEE_SELECTION";
  }
  if (nomineeProposalState === "Succeeded") {
    return "PENDING_EXECUTION";
  }
  return "NOT_STARTED";
}

export async function checkElectionStatus(
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionStatus> {
  log("checkElectionStatus for %s", nomineeGovernorAddress);

  const [l1BlockNumber, electionCountResult] = await Promise.all([
    getL1BlockNumberFromL2(l2Provider),
    multicall(l2Provider, [
      buildCallInput<BigNumber>(
        nomineeGovernorAddress,
        nomineeElectionGovernorInterface,
        "electionCount",
        []
      ),
    ]),
  ]);

  const electionCount = electionCountResult[0] as BigNumber | undefined;
  if (!electionCount) {
    throw new Error("Failed to fetch election count from nominee governor");
  }
  log("L1 block number from L2: %s", l1BlockNumber.toString());

  const l1Block = await queryWithRetry(() => l1Provider.getBlock(l1BlockNumber.toNumber()));
  if (!l1Block) {
    throw new Error(
      `L1 block ${l1BlockNumber.toString()} not found. ` +
        `If using a fork, ensure L1 is forked at a block >= ${l1BlockNumber.toString()}`
    );
  }
  const currentL1Timestamp = l1Block.timestamp;
  log("L1 timestamp: %d", currentL1Timestamp);

  const electionResults = await multicall(l2Provider, [
    buildCallInput<BigNumber>(
      nomineeGovernorAddress,
      nomineeElectionGovernorInterface,
      "electionToTimestamp",
      [electionCount]
    ),
    buildCallInput<number>(
      nomineeGovernorAddress,
      nomineeElectionGovernorInterface,
      "electionIndexToCohort",
      [electionCount]
    ),
  ]);

  const nextElectionTimestamp = electionResults[0] as BigNumber | undefined;
  const cohort = electionResults[1] as number | undefined;
  if (!nextElectionTimestamp || cohort === undefined) {
    throw new Error("Failed to fetch election details from nominee governor");
  }
  log(
    "electionCount=%s nextTimestamp=%s cohort=%d",
    electionCount.toString(),
    nextElectionTimestamp.toString(),
    cohort
  );

  const secondsUntilElection = Math.max(0, nextElectionTimestamp.toNumber() - currentL1Timestamp);
  const canCreateElection = secondsUntilElection === 0;

  const result: ElectionStatus = {
    electionCount: electionCount.toNumber(),
    cohort: cohort as CohortType,
    nextElectionTimestamp: nextElectionTimestamp.toNumber(),
    currentL1Timestamp,
    canCreateElection,
    secondsUntilElection,
    timeUntilElection: formatDuration(secondsUntilElection),
  };

  return result;
}

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

/**
 * Combined status + phase lookup for a specific election.
 *
 * Returns both the global election creation status (from `checkElectionStatus`)
 * and the lifecycle phase of the specified `electionIndex`. The `status` field
 * describes whether a new election can be created; the `phase` field describes
 * where the specified election is in its lifecycle.
 *
 * @param l2Provider - L2 provider
 * @param l1Provider - L1 provider
 * @param electionIndex - The election index to check (0-based)
 * @param config - Deployment config with contract addresses (defaults to mainnet)
 */
export async function getElectionStatus(
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  electionIndex: number,
  config: ElectionConfig = MAINNET_ELECTION_CONFIG
): Promise<ElectionStatusWithPhase> {
  const { nomineeGovernorAddress, memberGovernorAddress } = config;

  const [status, proposalIds] = await Promise.all([
    checkElectionStatus(l2Provider, l1Provider, nomineeGovernorAddress),
    getElectionProposalIds(electionIndex, l2Provider, {
      nomineeGovernorAddress,
      memberGovernorAddress,
    }),
  ]);

  const { nomineeProposalId, memberProposalId } = proposalIds;

  let nomineeProposalState: ProposalState | null = null;
  let memberProposalState: ProposalState | null = null;
  let isInVettingPeriod = false;

  if (nomineeProposalId) {
    const nominee = getNomineeGovernor(nomineeGovernorAddress, l2Provider);
    const stateNum = await queryWithRetry<number>(() => nominee.state(nomineeProposalId));
    nomineeProposalState = proposalStateToString(stateNum);

    if (nomineeProposalState === "Succeeded") {
      try {
        const deadline = await queryWithRetry<BigNumber>(() =>
          nominee.proposalVettingDeadline(nomineeProposalId)
        );
        const l1BlockNumber = await getL1BlockNumberFromL2(l2Provider);
        isInVettingPeriod = l1BlockNumber.lte(deadline);
      } catch {
        // No vetting period on this governor
      }
    }
  }

  if (memberProposalId) {
    const member = getMemberGovernor(memberGovernorAddress, l2Provider);
    const stateNum = await queryWithRetry<number>(() => member.state(memberProposalId));
    memberProposalState = proposalStateToString(stateNum);
  }

  const phase = determineElectionPhase(
    nomineeProposalState,
    memberProposalId,
    memberProposalState,
    isInVettingPeriod
  );

  return {
    status,
    phase,
    nomineeProposalId,
    memberProposalId,
    nomineeProposalState,
    memberProposalState,
  };
}

function proposalStateToString(state: number): ProposalState {
  const name = PROPOSAL_STATE_MAP[state];
  if (!name) throw new Error(`Unknown proposal state: ${state}`);
  return name;
}
