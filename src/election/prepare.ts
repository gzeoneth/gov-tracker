import { ethers } from "ethers";
import { ADDRESSES } from "../constants";
import { ElectionProposalStatus, ElectionStatus, PreparedTransaction } from "../types";
import { loggers } from "../utils/logger";
import { getNomineeGovernor } from "./contracts";
import {
  buildExecuteTransaction,
  getElectionProposalParams,
  getMemberElectionProposalParams,
} from "./params";

const log = loggers.election;

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
