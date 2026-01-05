/**
 * Test-only election helper functions
 *
 * These were removed from the production API as they're only needed for tests.
 */

import { BigNumber, ethers } from "ethers";
import { queryWithRetry } from "../../src/utils/rpc-utils";

const NOMINEE_ELECTION_GOVERNOR_ABI = [
  "function proposalVettingDeadline(uint256 proposalId) view returns (uint256)",
];

/**
 * Get the vetting deadline for a proposal
 *
 * Only applicable for SecurityCouncilNomineeElectionGovernor proposals.
 */
export async function getVettingDeadline(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider
): Promise<BigNumber | undefined> {
  const governor = new ethers.Contract(governorAddress, NOMINEE_ELECTION_GOVERNOR_ABI, provider);

  try {
    const deadline = await queryWithRetry<BigNumber>(() =>
      governor.proposalVettingDeadline(proposalId)
    );
    return deadline;
  } catch {
    return undefined;
  }
}
