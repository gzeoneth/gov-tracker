import { ethers, BigNumber } from "ethers";
import { ADDRESSES, MAINNET_ELECTION_CONFIG, proposalStateToString } from "../constants";
import { formatDuration } from "../utils/formatters";
import { queryWithRetry } from "../utils/rpc-utils";
import {
  CohortType,
  ElectionConfig,
  ElectionPhase,
  ElectionProposalStatus,
  ElectionStatus,
  ProposalState,
} from "../types";
import { TIMING } from "../constants";
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
 * Full status + phase lookup for a specific election.
 *
 * Returns a complete `ElectionProposalStatus` with all fields populated from
 * on-chain data: proposal states, compliant nominee count, vetting deadline,
 * cohort, and derived phase. Replaces the pattern of calling multiple SDK
 * functions and manually assembling the result.
 *
 * The returned `ElectionProposalStatus.stages` field is not populated (use
 * the full tracking pipeline via `ProposalStageTracker.trackElection()` for
 * stage-level tracking).
 *
 * @param l2Provider - L2 provider (also used for L1 block number via ArbSys)
 * @param electionIndex - The election index to check (0-based)
 * @param config - Deployment config with contract addresses (defaults to mainnet)
 */
export async function getElectionStatus(
  l2Provider: ethers.providers.Provider,
  electionIndex: number,
  config: ElectionConfig = MAINNET_ELECTION_CONFIG
): Promise<ElectionProposalStatus> {
  const { nomineeGovernorAddress, memberGovernorAddress } = config;

  const nominee = getNomineeGovernor(nomineeGovernorAddress, l2Provider);

  const [proposalIds, cohortRaw] = await Promise.all([
    getElectionProposalIds(electionIndex, l2Provider, {
      nomineeGovernorAddress,
      memberGovernorAddress,
    }),
    queryWithRetry<number>(() => nominee.electionIndexToCohort(electionIndex)),
  ]);

  const { nomineeProposalId, memberProposalId } = proposalIds;
  const cohort = cohortRaw as CohortType;

  let nomineeProposalState: ProposalState | null = null;
  let memberProposalState: ProposalState | null = null;
  let isInVettingPeriod = false;
  let vettingDeadline: number | null = null;
  let compliantNomineeCount = 0;

  if (nomineeProposalId) {
    const [stateNum, compliantCount] = await Promise.all([
      queryWithRetry<number>(() => nominee.state(nomineeProposalId)),
      queryWithRetry<BigNumber>(() => nominee.compliantNomineeCount(nomineeProposalId)).catch(() =>
        BigNumber.from(0)
      ),
    ]);

    nomineeProposalState = proposalStateToString(stateNum);
    compliantNomineeCount = compliantCount.toNumber();

    if (nomineeProposalState === "Succeeded") {
      try {
        const deadline = await queryWithRetry<BigNumber>(() =>
          nominee.proposalVettingDeadline(nomineeProposalId)
        );
        vettingDeadline = deadline.toNumber();
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

  const canProceedToMemberPhase =
    nomineeProposalState === "Succeeded" &&
    !isInVettingPeriod &&
    compliantNomineeCount >= TIMING.SECURITY_COUNCIL_TARGET_NOMINEES &&
    !memberProposalId;

  const canExecuteMember = memberProposalState === "Succeeded" || memberProposalState === "Queued";

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
 * Batch fetch status for all elections.
 *
 * Fetches the election count, then queries each election in parallel.
 * More efficient than calling `getElectionStatus` in a loop since it
 * shares the `checkElectionStatus` call.
 *
 * @param l2Provider - L2 provider
 * @param config - Deployment config (defaults to mainnet)
 */
export async function getAllElectionStatuses(
  l2Provider: ethers.providers.Provider,
  config: ElectionConfig = MAINNET_ELECTION_CONFIG
): Promise<ElectionProposalStatus[]> {
  const count = await getElectionCount(l2Provider, config.nomineeGovernorAddress);

  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      getElectionStatus(l2Provider, i, config).catch((err) => {
        log("Failed to fetch election %d: %s", i, err instanceof Error ? err.message : err);
        return null;
      })
    )
  );

  return results.filter((r): r is ElectionProposalStatus => r !== null);
}
