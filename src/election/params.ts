import { ethers, BigNumber } from "ethers";
import { ADDRESSES } from "../constants";
import { queryWithRetry } from "../utils/rpc-utils";
import { proposalCreatedInterface, governorInterface } from "../abis";
import { saltFromDescription } from "../utils/salt-computation";
import { loggers } from "../utils/logger";
import {
  ElectionProposalStatus,
  ElectionStatus,
  PreparedTransaction,
  ProposalCreatedEventArgs,
} from "../types";
import { getNomineeGovernor, getMemberGovernor, getLogQueryBlockRange } from "./contracts";
import { computeElectionProposalId, getElectionProposalId } from "./proposal-ids";

const log = loggers.election;

export interface ElectionProposalParams {
  targets: string[];
  values: BigNumber[];
  calldatas: string[];
  description: string;
  descriptionHash: string;
}

async function findProposalCreatedParams(
  proposalId: string,
  governorAddress: string,
  governor: ethers.Contract,
  provider: ethers.providers.Provider
): Promise<ElectionProposalParams | null> {
  const topic = proposalCreatedInterface.getEventTopic("ProposalCreated");

  const { fromBlock, toBlock } = await getLogQueryBlockRange(governor, proposalId, provider);

  const logs = await queryWithRetry(() =>
    provider.getLogs({
      address: governorAddress,
      topics: [topic],
      fromBlock,
      toBlock,
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
          values: parsed.args[3], // `values` collides with ethers.js internals
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

export function buildExecuteTransaction(
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

export async function getMemberElectionProposalParams(
  electionIndex: number,
  provider: ethers.providers.Provider,
  memberGovernorAddress: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR
): Promise<ElectionProposalParams | null> {
  log("getMemberElectionProposalParams for index %d", electionIndex);

  const memberGovernor = getMemberGovernor(memberGovernorAddress, provider);
  const memberProposalId = await computeElectionProposalId(electionIndex, memberGovernor);

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

// ============================================================================
// Transaction Preparation
// ============================================================================

export interface PreparedElectionCreation {
  transaction: PreparedTransaction;
  electionIndex: number;
}

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
