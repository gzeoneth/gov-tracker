import { ethers, BigNumber } from "ethers";
import { ADDRESSES } from "../constants";
import { formatDuration } from "../utils/formatters";
import { queryWithRetry } from "../utils/rpc-utils";
import { CohortType, ElectionPhase, ElectionStatus, ProposalState } from "../types";
import { getL1BlockNumberFromL2 } from "../utils/timing";
import { loggers } from "../utils/logger";
import { nomineeElectionGovernorInterface } from "../abis";
import { getNomineeGovernor } from "./contracts";
import { multicall, buildCallInput } from "../utils/multicall";

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
  if (nomineeProposalState === "Active" || nomineeProposalState === "Pending") {
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

  const electionCount = electionCountResult[0] as BigNumber;
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

  const nextElectionTimestamp = electionResults[0] as BigNumber;
  const cohort = electionResults[1] as number;
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
