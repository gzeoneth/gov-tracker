import { ethers, BigNumber } from "ethers";
import { ADDRESSES } from "../constants";
import { queryWithRetry } from "../utils/rpc-utils";
import { governorInterface } from "../abis";
import { multicall, buildCallInput } from "../utils/multicall";
import { saltFromDescription } from "../utils/salt-computation";
import { BlockScopedCache } from "../utils/block-cache";
import { loggers } from "../utils/logger";
import { getNomineeGovernor, getMemberGovernor } from "./contracts";
import { checkElectionStatus } from "./status";

const log = loggers.election;

export interface ElectionProposalIds {
  nomineeProposalId: string | null;
  memberProposalId: string | null;
}

export interface GetElectionProposalIdsOptions {
  nomineeGovernorAddress?: string;
  memberGovernorAddress?: string;
  blockNumber?: number;
  skipCache?: boolean;
}

const electionProposalIdsCache = new BlockScopedCache<number, ElectionProposalIds>({
  isImmutable: (result) => {
    return result.nomineeProposalId === null || result.memberProposalId !== null;
  },
});

export function clearElectionProposalIdsCache(): void {
  electionProposalIdsCache.clear();
}

export function clearElectionCache(): void {
  clearElectionProposalIdsCache();
}

export async function computeElectionProposalId(
  electionIndex: number,
  governor: ethers.Contract
): Promise<string> {
  const proposeArgs = (await queryWithRetry(() => governor.getProposeArgs(electionIndex))) as [
    string[],
    BigNumber[],
    string[],
    string,
  ];

  const [targets, values, calldatas, description] = proposeArgs;
  const descriptionHash = saltFromDescription(description);

  const proposalId = await queryWithRetry(() =>
    governor.hashProposal(targets, values, calldatas, descriptionHash)
  );

  return BigNumber.from(proposalId).toString();
}

export async function getElectionProposalId(
  electionIndex: number,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<string | null> {
  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);
  const proposalId = await computeElectionProposalId(electionIndex, governor);

  try {
    await queryWithRetry(() => governor.state(proposalId));
    return proposalId;
  } catch {
    return null;
  }
}

export async function getMemberElectionProposalId(
  electionIndex: number,
  provider: ethers.providers.Provider,
  memberGovernorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR
): Promise<string> {
  const governor = getMemberGovernor(memberGovernorAddress, provider);
  return computeElectionProposalId(electionIndex, governor);
}

export async function getElectionProposalIds(
  electionIndex: number,
  provider: ethers.providers.Provider,
  options: GetElectionProposalIdsOptions = {}
): Promise<ElectionProposalIds> {
  const {
    nomineeGovernorAddress = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
    memberGovernorAddress = ADDRESSES.ELECTION_MEMBER_GOVERNOR,
    blockNumber,
    skipCache,
  } = options;

  const cached = electionProposalIdsCache.get(electionIndex, blockNumber, { skipCache });
  if (cached) {
    return cached;
  }

  const nomineeGovernor = getNomineeGovernor(nomineeGovernorAddress, provider);
  const memberGovernor = getMemberGovernor(memberGovernorAddress, provider);

  const [nomineeProposalId, computedMemberProposalId] = await Promise.all([
    computeElectionProposalId(electionIndex, nomineeGovernor),
    computeElectionProposalId(electionIndex, memberGovernor),
  ]);

  const stateResults = await multicall(provider, [
    buildCallInput<number>(nomineeGovernorAddress, governorInterface, "state", [nomineeProposalId]),
    buildCallInput<number>(memberGovernorAddress, governorInterface, "state", [
      computedMemberProposalId,
    ]),
  ]);

  const nomineeStateResult = stateResults[0];
  const memberStateResult = stateResults[1];

  const result: ElectionProposalIds = {
    nomineeProposalId: nomineeStateResult !== null ? nomineeProposalId : null,
    memberProposalId: memberStateResult !== null ? computedMemberProposalId : null,
  };

  electionProposalIdsCache.set(electionIndex, result, blockNumber);

  return result;
}

/**
 * Find the election index for a given proposal ID (nominee or member).
 *
 * Searches through all elections to find which one contains the given proposal ID.
 * Returns null if the proposal ID is not found in any election.
 */
export async function getElectionIndexForProposalId(
  proposalId: string,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  options: { novaProvider?: ethers.providers.Provider; blockNumber?: number } = {}
): Promise<number | null> {
  const { blockNumber } = options;
  log("getElectionIndexForProposalId: searching for proposal %s", proposalId);

  const status = await checkElectionStatus(l2Provider, l1Provider);
  const electionCount = status.electionCount;

  for (let i = electionCount - 1; i >= 0; i--) {
    log("checking election %d", i);
    try {
      const { nomineeProposalId, memberProposalId } = await getElectionProposalIds(i, l2Provider, {
        blockNumber,
      });
      log("got election %d proposal IDs", i);

      const nomMatch = nomineeProposalId === proposalId;
      const memMatch = memberProposalId === proposalId;

      log("election %d: nomId=%s nomMatch=%s", i, nomineeProposalId, nomMatch);

      if (nomMatch) {
        log("Found proposal %s as nominee proposal for election %d", proposalId, i);
        return i;
      }
      if (memMatch) {
        log("Found proposal %s as member proposal for election %d", proposalId, i);
        return i;
      }
    } catch (err) {
      log("  -> error: %s", (err as Error).message);
      continue;
    }
  }

  log("Proposal %s not found in any election", proposalId);
  return null;
}
