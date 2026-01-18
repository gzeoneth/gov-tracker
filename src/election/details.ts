import { ethers, BigNumber } from "ethers";
import { ADDRESSES, TIMING } from "../constants";
import { queryWithRetry } from "../utils/rpc-utils";
import { memberElectionGovernorInterface } from "../abis";
import { loggers } from "../utils/logger";
import {
  NomineeElectionDetails,
  MemberElectionDetails,
  MemberElectionNominee,
  ElectionNominee,
  SerializableNominee,
  SerializableMemberNominee,
  SerializableNomineeDetails,
  SerializableMemberDetails,
} from "../types";
import { multicall, buildCallInput } from "../utils/multicall";
import { getNomineeGovernor, getMemberGovernor } from "./contracts";
import { computeElectionProposalId, getElectionProposalId } from "./proposal-ids";
import { getContenders, getNomineesWithVotes } from "./participants";

const log = loggers.election;

// ============================================================================
// Serialization Helpers
// ============================================================================

function serializeNominee(n: ElectionNominee): SerializableNominee {
  return {
    address: n.address,
    votesReceived: n.votesReceived.toString(),
    isExcluded: n.isExcluded,
    nominatedAtBlock: n.nominatedAtBlock,
    excludedAtBlock: n.excludedAtBlock,
    exclusionTxHash: n.exclusionTxHash,
  };
}

function serializeMemberNominee(n: MemberElectionNominee): SerializableMemberNominee {
  return {
    address: n.address,
    weightReceived: n.weightReceived.toString(),
    isWinner: n.isWinner,
    rank: n.rank,
  };
}

// ============================================================================
// Election Details Functions
// ============================================================================

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

export async function getMemberElectionDetails(
  electionIndex: number,
  provider: ethers.providers.Provider,
  memberGovernorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<MemberElectionDetails | null> {
  log("getMemberElectionDetails for election %d", electionIndex);

  const memberGovernor = getMemberGovernor(memberGovernorAddress, provider);
  const nomineeGovernor = getNomineeGovernor(nomineeGovernorAddress, provider);

  const memberProposalId = await computeElectionProposalId(electionIndex, memberGovernor);

  try {
    await queryWithRetry<number>(() => memberGovernor.state(memberProposalId));
  } catch {
    log("No member proposal found for election %d", electionIndex);
    return null;
  }

  const [memberResults, nomineeProposalId] = await Promise.all([
    multicall(provider, [
      buildCallInput<string[]>(
        memberGovernorAddress,
        memberElectionGovernorInterface,
        "topNominees",
        [memberProposalId]
      ),
      buildCallInput<BigNumber>(
        memberGovernorAddress,
        memberElectionGovernorInterface,
        "proposalDeadline",
        [memberProposalId]
      ),
      buildCallInput<BigNumber>(
        memberGovernorAddress,
        memberElectionGovernorInterface,
        "fullWeightVotingDeadline",
        [memberProposalId]
      ),
    ]),
    getElectionProposalId(electionIndex, provider, nomineeGovernorAddress),
  ]);

  const winners = (memberResults[0] as string[]) ?? [];
  const deadline = (memberResults[1] as BigNumber) ?? BigNumber.from(0);
  const fullWeightDeadline = (memberResults[2] as BigNumber) ?? BigNumber.from(0);

  const allNominees = nomineeProposalId
    ? await queryWithRetry<string[]>(() => nomineeGovernor.compliantNominees(nomineeProposalId))
    : [];

  const winnersSet = new Set(winners.map((w) => w.toLowerCase()));

  let nomineeWeights: { addr: string; weight: BigNumber }[] = [];
  if (allNominees.length > 0) {
    const weightCalls = allNominees.map((addr) =>
      buildCallInput<BigNumber>(
        memberGovernorAddress,
        memberElectionGovernorInterface,
        "weightReceived",
        [memberProposalId, addr]
      )
    );
    const weights = await multicall(provider, weightCalls);
    nomineeWeights = allNominees.map((addr, i) => ({
      addr,
      weight: (weights[i] as BigNumber) ?? BigNumber.from(0),
    }));
  }

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

/**
 * Convert NomineeElectionDetails to serializable format for caching.
 * Converts BigNumber fields to strings.
 */
export function serializeNomineeDetails(
  details: NomineeElectionDetails
): SerializableNomineeDetails {
  return {
    proposalId: details.proposalId,
    electionIndex: details.electionIndex,
    contenders: details.contenders.map((c) => ({
      address: c.address,
      registeredAtBlock: c.registeredAtBlock,
      registrationTxHash: c.registrationTxHash,
    })),
    nominees: details.nominees.map(serializeNominee),
    compliantNominees: details.compliantNominees.map(serializeNominee),
    excludedNominees: details.excludedNominees.map(serializeNominee),
    quorumThreshold: details.quorumThreshold.toString(),
    targetNomineeCount: details.targetNomineeCount,
  };
}

/**
 * Convert MemberElectionDetails to serializable format for caching.
 * Converts BigNumber fields to strings.
 */
export function serializeMemberDetails(details: MemberElectionDetails): SerializableMemberDetails {
  return {
    proposalId: details.proposalId,
    electionIndex: details.electionIndex,
    nominees: details.nominees.map(serializeMemberNominee),
    winners: details.winners,
    fullWeightDeadline: details.fullWeightDeadline,
    proposalDeadline: details.proposalDeadline,
  };
}
