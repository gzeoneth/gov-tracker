/**
 * Test-only discovery helper functions
 *
 * These were removed from the production API as they're only needed for tests.
 */

import { ethers } from "ethers";
import { ADDRESSES } from "../../src/constants";

/** Check if an operation ID looks valid (not zero, proper length) */
export function isValidOperationId(operationId: string): boolean {
  if (!operationId || operationId === ethers.constants.HashZero) {
    return false;
  }
  return /^0x[a-fA-F0-9]{64}$/.test(operationId);
}

/** Get the L1 timelock address (constant) */
export function getL1TimelockAddress(): string {
  return ADDRESSES.L1_TIMELOCK;
}

/** Check if an address is a known Arbitrum governor */
export function isKnownGovernor(address: string): boolean {
  const normalized = address.toLowerCase();
  return [
    ADDRESSES.CONSTITUTIONAL_GOVERNOR,
    ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
    ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
    ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  ].some((known) => known.toLowerCase() === normalized);
}
