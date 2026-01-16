import { ethers, BigNumber } from "ethers";
import { ADDRESSES } from "../constants";
import { queryWithRetry } from "../utils/rpc-utils";
import { nomineeElectionGovernorInterface } from "../abis";
import { loggers } from "../utils/logger";
import { ElectionContender, ElectionNominee } from "../types";
import { multicall, buildCallInput } from "../utils/multicall";
import { getNomineeGovernor, getLogQueryBlockRange } from "./contracts";

const log = loggers.election;

export async function getContenders(
  proposalId: string,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionContender[]> {
  log("getContenders for proposal %s", proposalId);

  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);
  const iface = nomineeElectionGovernorInterface;
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
          address: (parsed.args.contender as string).toLowerCase(),
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

  const nominees: ElectionNominee[] = nomineeAddresses.map((addr, i) => ({
    address: addr.toLowerCase(),
    votesReceived: (results[i * 2] as BigNumber) ?? BigNumber.from(0),
    isExcluded: (results[i * 2 + 1] as boolean) ?? false,
  }));

  log("Found %d nominees for proposal %s", nominees.length, proposalId);
  return nominees;
}

export async function getExcludedNominees(
  proposalId: string,
  provider: ethers.providers.Provider,
  nomineeGovernorAddress: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR
): Promise<ElectionNominee[]> {
  log("getExcludedNominees for proposal %s", proposalId);

  const governor = getNomineeGovernor(nomineeGovernorAddress, provider);
  const iface = nomineeElectionGovernorInterface;
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

  if (parsedLogs.length === 0) {
    return [];
  }

  const calls = parsedLogs.map(({ nominee }) =>
    buildCallInput<BigNumber>(
      nomineeGovernorAddress,
      nomineeElectionGovernorInterface,
      "votesReceived",
      [proposalId, nominee]
    )
  );

  const results = await multicall(provider, calls);

  const excluded = parsedLogs.map(({ eventLog, nominee }, i) => ({
    address: nominee.toLowerCase(),
    votesReceived: (results[i] as BigNumber) ?? BigNumber.from(0),
    isExcluded: true,
    excludedAtBlock: eventLog.blockNumber,
    exclusionTxHash: eventLog.transactionHash,
  }));

  log("Found %d excluded nominees for proposal %s", excluded.length, proposalId);
  return excluded;
}
