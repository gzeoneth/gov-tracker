import { ethers, BigNumber } from "ethers";
import { ADDRESSES } from "../constants";
import { queryWithRetry } from "../utils/rpc-utils";
import { proposalCreatedInterface, governorInterface } from "../abis";
import { saltFromDescription } from "../utils/salt-computation";
import { loggers } from "../utils/logger";
import { PreparedTransaction, ProposalCreatedEventArgs } from "../types";
import { getNomineeGovernor, getMemberGovernor } from "./contracts";
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
