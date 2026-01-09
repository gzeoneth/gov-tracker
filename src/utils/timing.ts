/**
 * Timing utilities for ETA calculations
 *
 * Handles block-based timing across L1 and L2
 */

import { BigNumber, ethers } from "ethers";
import { NodeInterface__factory } from "@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory";
import { getFirstBlockForL1Block as sdkGetFirstBlockForL1Block } from "@arbitrum/sdk/dist/lib/utils/lib";
import type { StageType, TrackedStage } from "../types";
import { BLOCK_TIMES as BLOCK_TIMES_CONST, GOVERNANCE_STAGE_DURATION_DAYS } from "../constants";
import { queryWithRetry } from "./rpc-utils";
import { loggers } from "./logger";

const NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8";
const NEARBY_L1_BLOCK_ATTEMPTS = 5;

const log = loggers.rpc;

/**
 * Get the completion timestamp from a stage's transactions.
 *
 * For stages with multiple transactions (e.g., timelock stages with both
 * "queued" and "executed" txs), this finds the tx with description "executed"
 * or falls back to the last transaction in the array.
 */
function getCompletionTimestamp(stage: TrackedStage): number | undefined {
  if (!stage.transactions?.length) return undefined;

  // Find tx with description "executed", or use last tx
  const execTx =
    stage.transactions.find((tx) => tx.description === "executed") ??
    stage.transactions[stage.transactions.length - 1];

  return execTx?.timestamp;
}

/**
 * Convert block number to estimated timestamp
 */
export function estimateTimestampFromBlock(
  blockNumber: number,
  currentBlock: number,
  currentTimestamp: number,
  blockTime: number = BLOCK_TIMES_CONST.L2
): number {
  const blockDiff = blockNumber - currentBlock;
  const timeDiff = blockDiff * blockTime;
  return Math.floor(currentTimestamp + timeDiff);
}

/**
 * Calculate ETA for a future block
 */
export function calculateEta(
  targetBlock: number,
  currentBlock: number,
  currentTimestamp: number,
  blockTime: number = BLOCK_TIMES_CONST.L2
): number | null {
  if (targetBlock <= currentBlock) {
    return null; // Already passed
  }

  return estimateTimestampFromBlock(targetBlock, currentBlock, currentTimestamp, blockTime);
}

/**
 * Calculate remaining time in seconds
 */
export function calculateRemainingSeconds(
  targetBlock: number,
  currentBlock: number,
  blockTime: number = BLOCK_TIMES_CONST.L2
): number {
  const blockDiff = targetBlock - currentBlock;
  if (blockDiff <= 0) {
    return 0;
  }
  return Math.floor(blockDiff * blockTime);
}

// Short-lived cache for getCurrentBlockInfo (2 seconds TTL)
// Uses WeakMap to avoid memory leaks when providers are garbage collected
const blockInfoCache = new WeakMap<
  ethers.providers.Provider,
  { blockNumber: number; timestamp: number; fetchedAt: number }
>();
const BLOCK_INFO_CACHE_TTL_MS = 2000; // 2 seconds - short enough for L2's fast blocks

/**
 * Get current block info from a provider
 *
 * Results are cached for 2 seconds to reduce redundant RPC calls during a single
 * tracking operation. The cache is per-provider.
 */
export async function getCurrentBlockInfo(
  provider: ethers.providers.Provider
): Promise<{ blockNumber: number; timestamp: number }> {
  const cached = blockInfoCache.get(provider);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < BLOCK_INFO_CACHE_TTL_MS) {
    log("getBlock(latest): block=%d (cached)", cached.blockNumber);
    return { blockNumber: cached.blockNumber, timestamp: cached.timestamp };
  }

  const start = now;
  const block = await queryWithRetry(() => provider.getBlock("latest"));
  log("getBlock(latest): block=%d (%dms)", block.number, Date.now() - start);

  const result = {
    blockNumber: block.number,
    timestamp: block.timestamp,
    fetchedAt: now,
  };
  blockInfoCache.set(provider, result);

  return { blockNumber: result.blockNumber, timestamp: result.timestamp };
}

/**
 * Get current L1 block number as seen from L2
 *
 * Arbitrum L2 blocks include the L1 block number in their metadata.
 * This returns the L1 block number from the latest L2 block.
 *
 * IMPORTANT: This returns the actual L1 block number, not the L2 block number.
 * Use this for comparing against vetting deadlines which are in L1 blocks.
 */
export async function getL1BlockNumberFromL2(
  l2Provider: ethers.providers.Provider
): Promise<BigNumber> {
  const jsonRpcProvider = l2Provider as ethers.providers.JsonRpcProvider;
  if (typeof jsonRpcProvider.send !== "function") {
    throw new Error("Provider does not support direct RPC calls (send method required)");
  }

  const start = Date.now();
  const rawBlock = await queryWithRetry(() =>
    jsonRpcProvider.send("eth_getBlockByNumber", ["latest", false])
  );

  if (!rawBlock || !rawBlock.l1BlockNumber) {
    throw new Error("Could not get L1 block number from latest L2 block");
  }

  const l1Block = BigNumber.from(rawBlock.l1BlockNumber);
  log("getL1BlockNumberFromL2: l1Block=%s (%dms)", l1Block.toString(), Date.now() - start);
  return l1Block;
}

/**
 * Get the corresponding L1 block number for an L2 block.
 *
 * Arbitrum L2 blocks include the L1 block number at the time they were created.
 * This is exposed via the `l1BlockNumber` field in the raw block data.
 *
 * This is useful for determining search ranges when looking for L1 events
 * that correspond to L2 actions.
 *
 * Note: This relies on Arbitrum-specific block metadata and requires a
 * JsonRpcProvider that supports the `send` method for raw RPC calls.
 */
export async function getL1BlockForL2Block(
  l2Provider: ethers.providers.Provider,
  l2BlockNumber: number
): Promise<number> {
  const jsonRpcProvider = l2Provider as ethers.providers.JsonRpcProvider;
  if (typeof jsonRpcProvider.send !== "function") {
    throw new Error("Provider does not support direct RPC calls (send method required)");
  }

  const rawBlock = await queryWithRetry(() =>
    jsonRpcProvider.send("eth_getBlockByNumber", ["0x" + l2BlockNumber.toString(16), false])
  );

  if (!rawBlock || !rawBlock.l1BlockNumber) {
    throw new Error(`Could not get L1 block number for L2 block ${l2BlockNumber}`);
  }

  // Use BigNumber.from for consistent parsing (handles both hex and decimal)
  // This matches getL1BlockNumberFromL2's approach
  const l1Block = BigNumber.from(rawBlock.l1BlockNumber);
  return l1Block.toNumber();
}

/**
 * Get the first L2 block for a given L1 block number.
 *
 * Arbitrum governors use L1 block numbers for voting deadlines. This function
 * finds the corresponding L2 block for searching L2 logs.
 *
 * WHY NOT USE SDK's getFirstBlockForL1Block DIRECTLY:
 * The SDK's getFirstBlockForL1Block uses a binary search (~23 RPC calls, ~14s).
 * NodeInterface.l2BlockRangeForL1() is a single RPC call (~1s) when the L1 block
 * has corresponding L2 blocks. We try exact + nearby L1 blocks first, falling
 * back to SDK only when 6 consecutive blocks have no L2 blocks (rare).
 *
 * @param l2Provider - L2 provider (must be JsonRpcProvider)
 * @param targetL1Block - Target L1 block number
 * @param options.minL2Block - Minimum L2 block to search from (for SDK fallback)
 * @param options.maxL2Block - Maximum L2 block to search to (for SDK fallback)
 * @returns First L2 block for the given L1 block, or undefined if not found
 */
export async function getFirstL2BlockForL1Block(
  l2Provider: ethers.providers.Provider,
  targetL1Block: number,
  options: { minL2Block?: number; maxL2Block?: number } = {}
): Promise<number | undefined> {
  const start = Date.now();
  const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, l2Provider);

  // Try exact block (offset=0) then nearby L1 blocks (offset=1..5)
  // L1 blocks can be skipped on L2, but adjacent blocks usually have L2 blocks
  for (let offset = 0; offset < NEARBY_L1_BLOCK_ATTEMPTS; offset++) {
    const l1Block = targetL1Block - offset;
    if (l1Block <= 0) break;

    try {
      const range = await nodeInterface.l2BlockRangeForL1(l1Block);
      // For exact match (offset=0), return firstBlock
      // For nearby blocks, return lastBlock+1 as the first block >= targetL1Block
      const result = offset === 0 ? range.firstBlock.toNumber() : range.lastBlock.toNumber() + 1;
      log(
        "getFirstL2BlockForL1Block: L1=%d -> L2=%d (%s, %d RPC, %dms)",
        targetL1Block,
        result,
        offset === 0 ? "fast path" : `nearby L1=${l1Block}`,
        offset + 1,
        Date.now() - start
      );
      return result;
    } catch {
      // l2BlockRangeForL1 reverts if no L2 block exists for this L1 block
    }
  }

  // Slow path: SDK binary search fallback
  // This should rarely be reached - only when 6 consecutive L1 blocks have no L2 blocks
  log(
    "getFirstL2BlockForL1Block: L1=%d falling back to SDK binary search (%dms)",
    targetL1Block,
    Date.now() - start
  );

  const jsonRpcProvider = l2Provider as ethers.providers.JsonRpcProvider;
  const result = await sdkGetFirstBlockForL1Block({
    arbitrumProvider: jsonRpcProvider,
    forL1Block: targetL1Block,
    allowGreater: true,
    minArbitrumBlock: options.minL2Block,
    maxArbitrumBlock: options.maxL2Block,
  });

  if (result !== undefined) {
    log(
      "getFirstL2BlockForL1Block: L1=%d -> L2=%d (SDK fallback, bounds: %s-%s, %dms)",
      targetL1Block,
      result,
      options.minL2Block ?? "start",
      options.maxL2Block ?? "latest",
      Date.now() - start
    );
  }

  return result;
}

/**
 * Find a block number shortly after a delay expires.
 *
 * Instead of using a hardcoded block time which can overshoot or undershoot,
 * this function checks actual block timestamps and adjusts iteratively.
 *
 * IMPORTANT: This function errs on the side of being EARLY rather than late.
 * When searching for events, it's better to start searching a bit before the
 * target time than to miss the event by starting too late.
 *
 * @param provider - Provider to fetch block data
 * @param startBlock - The block number where the delay started
 * @param delaySeconds - The delay duration in seconds
 * @param estimatedBlockTime - Estimated seconds per block (default: 12 for L1)
 * @returns A block number at or shortly before timestamp >= startTimestamp + delaySeconds
 */
export async function blockAfterDelay(
  provider: ethers.providers.Provider,
  startBlock: number,
  delaySeconds: number,
  estimatedBlockTime: number = BLOCK_TIMES_CONST.L1
): Promise<number> {
  const start = Date.now();

  // Get the start block timestamp
  const startBlockData = await queryWithRetry(() => provider.getBlock(startBlock));
  if (!startBlockData) {
    throw new Error(`Could not fetch block ${startBlock}`);
  }
  const targetTimestamp = startBlockData.timestamp + delaySeconds;

  // Get current block for upper bound
  const { blockNumber: currentBlock, timestamp: currentTimestamp } =
    await getCurrentBlockInfo(provider);

  // If current time hasn't passed the target, return startBlock (too early to have executed)
  if (currentTimestamp < targetTimestamp) {
    log(
      "blockAfterDelay: delay not yet passed, returning startBlock=%d (%dms)",
      startBlock,
      Date.now() - start
    );
    return startBlock;
  }

  // Initial estimate
  let resultBlock = startBlock + Math.floor(delaySeconds / estimatedBlockTime);

  // Clamp to valid range
  resultBlock = Math.min(resultBlock, currentBlock);
  resultBlock = Math.max(resultBlock, startBlock + 1);

  // Safety margin: 100 blocks on L1 (~20 min), ensures we start before target
  const safetyMargin = 100;

  // Iteratively refine until we're before the target timestamp
  const maxIterations = 10;
  for (let i = 0; i < maxIterations; i++) {
    const block = await queryWithRetry(() => provider.getBlock(resultBlock));
    if (!block) {
      log("blockAfterDelay: could not fetch block %d, using estimate", resultBlock);
      break;
    }

    const diff = block.timestamp - targetTimestamp;

    if (diff < 0) {
      // We're before the target - perfect, this is where we want to be
      log(
        "blockAfterDelay: found block=%d (diff=%ds before target) in %d iterations (%dms)",
        resultBlock,
        -diff,
        i + 1,
        Date.now() - start
      );
      return resultBlock;
    }

    // We're at or after the target - backtrack
    // Backtrack by the overshoot amount plus safety margin
    const blocksToBacktrack = Math.ceil(diff / estimatedBlockTime) + safetyMargin;
    const previousBlock = resultBlock;
    resultBlock = Math.max(startBlock + 1, resultBlock - blocksToBacktrack);

    log(
      "blockAfterDelay: block %d is +%ds after target, backtracking %d blocks to %d",
      previousBlock,
      diff,
      blocksToBacktrack,
      resultBlock
    );

    // Prevent infinite loop if we can't go back further
    if (resultBlock === startBlock + 1) {
      log("blockAfterDelay: can't backtrack further, using startBlock+1=%d", resultBlock);
      return resultBlock;
    }
  }

  log(
    "blockAfterDelay: returning block=%d after max iterations (%dms)",
    resultBlock,
    Date.now() - start
  );
  return resultBlock;
}

// Simple ETA Calculation for Individual Stages

/**
 * Stage duration mapping for ETA calculations (in days)
 */
const STAGE_DURATION_DAYS: Partial<Record<StageType, number>> = {
  VOTING_ACTIVE: GOVERNANCE_STAGE_DURATION_DAYS.VOTING,
  L2_TIMELOCK: GOVERNANCE_STAGE_DURATION_DAYS.L2_CONSTITUTIONAL_TIMELOCK,
  L2_TO_L1_MESSAGE: GOVERNANCE_STAGE_DURATION_DAYS.CHALLENGE_PERIOD,
  L1_TIMELOCK: GOVERNANCE_STAGE_DURATION_DAYS.L1_TIMELOCK,
};

/**
 * Calculate expected ETA for a stage that hasn't started yet
 *
 * Estimates when a future stage will complete based on:
 * 1. Finding a reference point (completed stage timestamp or existing ETA)
 * 2. Calculating cumulative delays from that reference to the target stage
 *
 * @param stages - Array of tracked stages from a TrackingResult
 * @param stageIndex - Index of the stage to calculate ETA for
 * @returns Estimated completion timestamp in seconds, or undefined if cannot calculate
 *
 * @example
 * ```typescript
 * const result = await tracker.trackFromGovernor(governor, proposalId);
 * for (let i = 0; i < result.stages.length; i++) {
 *   const stage = result.stages[i];
 *   if (stage.status === "NOT_STARTED") {
 *     const eta = calculateExpectedEta(result.stages, i);
 *     if (eta) {
 *       console.log(`${stage.type}: Expected ~${new Date(eta * 1000).toISOString()}`);
 *     }
 *   }
 * }
 * ```
 */
export function calculateExpectedEta(
  stages: TrackedStage[],
  stageIndex: number
): number | undefined {
  let baseEta: number | undefined;
  let baseIndex = -1;

  for (let i = stageIndex - 1; i >= 0; i--) {
    const stage = stages[i];

    if (stage.timing?.eta) {
      baseEta = stage.timing.eta;
      baseIndex = i;
      break;
    }

    if (stage.status === "COMPLETED") {
      const completionTs = getCompletionTimestamp(stage);
      if (completionTs !== undefined) {
        baseEta = completionTs;
        baseIndex = i;
        break;
      }
    }
  }

  if (baseEta === undefined) {
    return undefined;
  }

  let cumulativeDelayDays = 0;
  for (let i = baseIndex + 1; i <= stageIndex; i++) {
    const stageType = stages[i].type;
    cumulativeDelayDays += STAGE_DURATION_DAYS[stageType] ?? 0;
  }

  const delaySeconds = cumulativeDelayDays * 24 * 60 * 60;
  return baseEta + delaySeconds;
}
