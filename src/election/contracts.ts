import { ethers, BigNumber } from "ethers";
import { ADDRESSES } from "../constants";
import { queryWithRetry, getErrorMessage } from "../utils/rpc-utils";
import { NOMINEE_ELECTION_GOVERNOR_ABI, MEMBER_ELECTION_GOVERNOR_ABI } from "../abis";
import { loggers } from "../utils/logger";

const log = loggers.election;

export function getNomineeGovernor(
  address: string = ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  provider?: ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(address, NOMINEE_ELECTION_GOVERNOR_ABI, provider);
}

export function getMemberGovernor(
  address: string = ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  provider?: ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(address, MEMBER_ELECTION_GOVERNOR_ABI, provider);
}

export async function getLogQueryBlockRange(
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
  } catch (err) {
    log(
      "proposalSnapshot failed for %s, using fallback range: %s",
      proposalId,
      getErrorMessage(err)
    );
    fromBlock = Math.max(0, toBlock - fallbackRange);
  }
  return { fromBlock, toBlock };
}
