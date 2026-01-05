/**
 * Test-only timing helper functions
 *
 * These were removed from the production API as they're only needed for tests.
 * Implementations are inlined here to keep the public API minimal.
 */

import { BigNumber } from "ethers";
import { TIMING } from "../../src/constants";

/** Check if a deadline has passed */
export function hasDeadlinePassed(
  deadlineBlock: BigNumber | number,
  currentBlock: number
): boolean {
  const deadline = typeof deadlineBlock === "number" ? deadlineBlock : deadlineBlock.toNumber();
  return currentBlock >= deadline;
}

/** Calculate challenge period end block */
export function calculateChallengeEndBlock(currentL1Block: number): number {
  return currentL1Block + TIMING.CHALLENGE_PERIOD_BLOCKS_L1;
}

/** Check if challenge period is complete */
export function isChallengeComplete(firstExecutableBlock: number, currentL1Block: number): boolean {
  return currentL1Block >= firstExecutableBlock;
}

/** Check if timelock is ready to execute */
export function isTimelockReady(eta: number, currentTimestamp: number): boolean {
  return currentTimestamp >= eta;
}

/** Calculate voting end block with extension handling */
export function calculateVotingEndBlock(
  startBlock: BigNumber,
  votingPeriod: BigNumber,
  extension?: BigNumber
): BigNumber {
  let endBlock = startBlock.add(votingPeriod);
  if (extension && extension.gt(0)) {
    endBlock = extension;
  }
  return endBlock;
}

/** Calculate optimal search range for voting period */
export function getVotingSearchRange(
  creationBlock: number,
  currentBlock: number
): { fromBlock: number; toBlock: number } {
  return {
    fromBlock: creationBlock,
    toBlock: Math.min(creationBlock + TIMING.MAX_VOTING_PERIOD_BLOCKS_L2, currentBlock),
  };
}

/** Parse estimated duration string to min/max days */
export function parseEstimatedDurationRange(duration?: string): { min: number; max: number } {
  if (!duration) return { min: 0, max: 0 };

  const cleaned = duration.replace(/^~/, "").trim();

  const rangeMatch = cleaned.match(/(\d+)-(\d+)\s*days?/i);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
    };
  }

  const singleMatch = cleaned.match(/(\d+)\s*days?/i);
  if (singleMatch) {
    const days = parseInt(singleMatch[1], 10);
    return { min: days, max: days };
  }

  return { min: 0, max: 0 };
}

/** Estimate block number from timestamp (inverse of estimateTimestampFromBlock) */
export function estimateBlockFromTimestamp(
  timestamp: number,
  currentBlock: number,
  currentTimestamp: number,
  blockTime: number
): number {
  const timeDiff = timestamp - currentTimestamp;
  const blockDiff = Math.floor(timeDiff / blockTime);
  return currentBlock + blockDiff;
}
