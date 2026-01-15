/**
 * Timelock discovery module
 *
 * Parse CallScheduled events, check timelock state, find operations
 */

import { BigNumber, ethers } from "ethers";
import {
  CallExecutedData,
  CallScheduledData,
  TimelockOperationState,
  TimelockState,
  SearchHint,
} from "../types";
import { ADDRESSES, EVENT_TOPICS, GOVERNANCE_START_BLOCKS, CHUNK_SIZES } from "../constants";
import { searchLogsInChunks } from "../utils/log-search";
import { findAndParseEvent, createOperationIdPredicate } from "../utils/log-search";
import { findAndParseLogs } from "../utils/log-filters";
import { queryWithRetry } from "../utils/rpc-utils";
import { getCurrentBlockInfo } from "../utils/timing";
import { addressEquals, isAddressIn } from "../utils/chain";
import { timelockInterface } from "../abis";
import { multicall, buildCallInput } from "../utils/multicall";

const L2_TIMELOCKS = [
  ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
] as const;

/**
 * Check if address is a known L2 timelock
 */
export function isKnownL2Timelock(address: string): boolean {
  return isAddressIn(address, L2_TIMELOCKS);
}

/**
 * Check if address is the L1 timelock
 */
export function isL1Timelock(address: string): boolean {
  return addressEquals(address, ADDRESSES.L1_TIMELOCK);
}

/**
 * Get search defaults for timelock event searches.
 * Encapsulates chain-appropriate chunk sizes, default blocks, and direction logic.
 *
 * @param hint.chunkSize - Override chunk size (uses chain-appropriate default if not specified)
 */
async function getSearchDefaults(
  timelockAddress: string,
  provider: ethers.providers.Provider,
  hint?: SearchHint
): Promise<{
  chunkSize: number;
  fromBlock: number;
  toBlock: number;
  reverseDirection: boolean;
}> {
  const isL1 = isL1Timelock(timelockAddress);
  const defaultChunkSize = isL1 ? CHUNK_SIZES.L1 : CHUNK_SIZES.L2;
  const chunkSize = hint?.chunkSize ?? defaultChunkSize;
  const defaultStartBlock = isL1 ? GOVERNANCE_START_BLOCKS.L1 : GOVERNANCE_START_BLOCKS.L2;
  const toBlock = hint?.endBlock ?? (await getCurrentBlockInfo(provider)).blockNumber;
  const fromBlock = hint?.startBlock ?? defaultStartBlock;
  // When startBlock is provided, default to forward search (more efficient)
  // When no startBlock, default to backward search (find most recent)
  const reverseDirection =
    hint?.direction === "backward" || (hint?.direction !== "forward" && !hint?.startBlock);

  return { chunkSize, fromBlock, toBlock, reverseDirection };
}

/**
 * Timelock operation state from contract reads
 */
export interface TimelockContractState {
  state: TimelockOperationState;
  isOperation: boolean;
  isPending: boolean;
  isReady: boolean;
  isDone: boolean;
  timestamp: BigNumber;
}

/**
 * Get timelock operation state directly from contract (fast path)
 *
 * This is the critical fast-path optimization: 4 cheap state reads
 * instead of expensive log searches
 */
export async function getTimelockOperationState(
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider
): Promise<TimelockContractState> {
  // Batch all 5 state checks into a single RPC request
  const results = await multicall(provider, [
    buildCallInput<boolean>(timelockAddress, timelockInterface, "isOperation", [operationId]),
    buildCallInput<boolean>(timelockAddress, timelockInterface, "isOperationPending", [
      operationId,
    ]),
    buildCallInput<boolean>(timelockAddress, timelockInterface, "isOperationReady", [operationId]),
    buildCallInput<boolean>(timelockAddress, timelockInterface, "isOperationDone", [operationId]),
    buildCallInput<BigNumber>(timelockAddress, timelockInterface, "getTimestamp", [operationId]),
  ]);

  const isOperation = (results[0] as boolean) ?? false;
  const isPending = (results[1] as boolean) ?? false;
  const isReady = (results[2] as boolean) ?? false;
  const isDone = (results[3] as boolean) ?? false;
  const timestamp = (results[4] as BigNumber) ?? BigNumber.from(0);

  let state: TimelockOperationState = "UNKNOWN";

  if (!isOperation) {
    state = "UNKNOWN";
  } else if (isDone) {
    state = "DONE";
  } else if (isReady) {
    state = "READY";
  } else if (isPending) {
    state = "PENDING";
  }

  return {
    state,
    isOperation,
    isPending,
    isReady,
    isDone,
    timestamp,
  };
}

/**
 * Parse CallScheduled event data
 */
export function parseCallScheduledEvent(log: ethers.providers.Log): CallScheduledData | null {
  try {
    const parsed = timelockInterface.parseLog(log);

    return {
      operationId: parsed.args.id,
      index: parsed.args.index,
      target: parsed.args.target,
      value: parsed.args.value,
      data: parsed.args.data,
      predecessor: parsed.args.predecessor,
      delay: parsed.args.delay,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      timelockAddress: log.address,
    };
  } catch {
    return null;
  }
}

/**
 * Parse CallExecuted event data
 */
export function parseCallExecutedEvent(log: ethers.providers.Log): CallExecutedData | null {
  try {
    const parsed = timelockInterface.parseLog(log);

    return {
      operationId: parsed.args.id,
      index: parsed.args.index,
      target: parsed.args.target,
      value: parsed.args.value,
      data: parsed.args.data,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
    };
  } catch {
    return null;
  }
}

/**
 * Find CallScheduled event by operation ID
 *
 * @param hint - Search optimization hint. When startBlock is provided, defaults to forward search.
 */
export async function findCallScheduledEvent(
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider,
  hint?: SearchHint
): Promise<CallScheduledData | null> {
  const { chunkSize, fromBlock, toBlock, reverseDirection } = await getSearchDefaults(
    timelockAddress,
    provider,
    hint
  );

  return findAndParseEvent(
    provider,
    {
      address: timelockAddress,
      topics: [EVENT_TOPICS.CALL_SCHEDULED, operationId],
      fromBlock,
      toBlock,
    },
    createOperationIdPredicate(operationId, addressEquals),
    parseCallScheduledEvent,
    { chunkSize, reverseDirection }
  );
}

/**
 * Find CallScheduled event by transaction hash
 */
export async function findCallScheduledByTxHash(
  txHash: string,
  provider: ethers.providers.Provider
): Promise<CallScheduledData[] | undefined> {
  const receipt = await queryWithRetry(() => provider.getTransactionReceipt(txHash));

  if (!receipt) {
    return undefined;
  }

  const results = findAndParseLogs(
    receipt.logs,
    { topic: EVENT_TOPICS.CALL_SCHEDULED },
    parseCallScheduledEvent
  );

  return results.length > 0 ? results : undefined;
}

/**
 * Find CallExecuted event by operation ID
 *
 * @param hint - Search optimization hint. When startBlock is provided, defaults to forward search.
 */
export async function findCallExecutedEvent(
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider,
  hint?: SearchHint
): Promise<CallExecutedData | null> {
  const { chunkSize, fromBlock, toBlock, reverseDirection } = await getSearchDefaults(
    timelockAddress,
    provider,
    hint
  );

  return findAndParseEvent(
    provider,
    {
      address: timelockAddress,
      topics: [EVENT_TOPICS.CALL_EXECUTED, operationId],
      fromBlock,
      toBlock,
    },
    createOperationIdPredicate(operationId, addressEquals),
    parseCallExecutedEvent,
    { chunkSize, reverseDirection }
  );
}

/**
 * Get full timelock state with fast-path optimization
 *
 * CRITICAL: Always use fast-path first, then search logs only when needed
 *
 * @param options.fromBlock - REQUIRED when not skipping log search. Start block for event searches.
 * @param options.scheduledData - Pre-fetched CallScheduledData to skip log search
 * @param options.chunkSize - Override chunk size for log searches (uses chain-appropriate default if not specified)
 */
export async function getTimelockState(
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider,
  options: {
    fromBlock?: number;
    toBlock?: number;
    skipLogSearch?: boolean;
    /** Skip CallExecuted search - use when caller handles execution search separately */
    skipExecutedSearch?: boolean;
    /** Pre-fetched scheduled data - skips CallScheduled search if provided */
    scheduledData?: CallScheduledData;
    /** All scheduled data for batch operations */
    allScheduledData?: CallScheduledData[];
    /** Override chunk size for log searches */
    chunkSize?: number;
    /** Pre-fetched contract state to avoid duplicate multicalls */
    contractState?: TimelockContractState;
  } = {}
): Promise<TimelockState> {
  // FAST PATH: Check state before expensive log search
  const contractState =
    options.contractState ??
    (await getTimelockOperationState(timelockAddress, operationId, provider));

  const state: TimelockState = {
    operationId,
    state: contractState.state,
    isReady: contractState.isReady,
    isDone: contractState.isDone,
  };

  // Calculate ETA from timestamp
  if (contractState.timestamp.gt(0) && !contractState.isDone) {
    state.eta = contractState.timestamp.toNumber();
  }

  // Use pre-fetched scheduled data if provided (avoids log search entirely)
  if (options.scheduledData) {
    state.scheduledData = options.scheduledData;
    if (options.allScheduledData && options.allScheduledData.length > 1) {
      state.allScheduledData = options.allScheduledData;
      state.isBatch = true;
    }
  }

  // SLOW PATH: Only search for logs when needed and not already provided
  if (!options.skipLogSearch && !state.scheduledData) {
    // fromBlock is required for log searches
    if (options.fromBlock === undefined) {
      throw new Error("fromBlock is required when searching logs in getTimelockState");
    }
    const fromBlock = options.fromBlock; // Store validated value for TypeScript

    // Only search for scheduled data if the operation exists
    if (contractState.isOperation) {
      const scheduledData = await findCallScheduledEvent(timelockAddress, operationId, provider, {
        startBlock: fromBlock,
        endBlock: options.toBlock,
        chunkSize: options.chunkSize,
      });
      if (scheduledData) {
        state.scheduledData = scheduledData;

        // Check if this is a batch operation by looking for multiple CallScheduled events
        // with the SAME operationId (not just any events in the same tx)
        const allScheduledData = await findAllCallScheduledInTx(
          scheduledData.txHash,
          provider,
          operationId
        );
        if (allScheduledData.length > 1) {
          state.allScheduledData = allScheduledData;
          state.isBatch = true;
        }
      }
    }
  }

  // Only search for executed data if the operation is done and caller wants it
  // Note: Caller may skip this to do an optimized search starting after the delay
  if (!options.skipLogSearch && !options.skipExecutedSearch && contractState.isDone) {
    // fromBlock is required for log searches
    if (options.fromBlock === undefined) {
      throw new Error("fromBlock is required when searching logs in getTimelockState");
    }
    // Use scheduledData blockNumber if available, otherwise use fromBlock
    const executedSearchStart = state.scheduledData?.blockNumber ?? options.fromBlock;
    const executedData = await findCallExecutedEvent(timelockAddress, operationId, provider, {
      startBlock: executedSearchStart,
      endBlock: options.toBlock,
      chunkSize: options.chunkSize,
    });
    if (executedData) {
      state.executedData = executedData;
    }
  }

  return state;
}

/**
 * Find all CallScheduled events from a transaction for a specific operation ID.
 *
 * A BATCH operation is when multiple CallScheduled events share the same `id` (operationId)
 * but have different `index` values. This is different from multiple SEPARATE operations
 * in a single transaction (which would have different `id` values).
 *
 * @param txHash - Transaction hash to search
 * @param provider - Provider to use
 * @param operationId - Operation ID to filter by (only includes events with this ID)
 * @returns Array of CallScheduledData for the specified operation, sorted by index
 */
export async function findAllCallScheduledInTx(
  txHash: string,
  provider: ethers.providers.Provider,
  operationId?: string
): Promise<CallScheduledData[]> {
  const receipt = await queryWithRetry(() => provider.getTransactionReceipt(txHash));

  if (!receipt) {
    return [];
  }

  const results: CallScheduledData[] = [];

  for (const log of receipt.logs) {
    if (log.topics[0] === EVENT_TOPICS.CALL_SCHEDULED) {
      const parsed = parseCallScheduledEvent(log);
      if (parsed) {
        // If operationId is specified, only include events with that ID
        // This distinguishes a batch (same ID, different index) from
        // multiple separate operations (different IDs)
        if (!operationId || addressEquals(parsed.operationId, operationId)) {
          results.push(parsed);
        }
      }
    }
  }

  // Sort by index to maintain order
  return results.sort((a, b) => a.index.toNumber() - b.index.toNumber());
}

/**
 * Get the L2 timelock address for a governor type
 */
export function getL2TimelockForGovernor(governorAddress: string): string | null {
  const normalized = governorAddress.toLowerCase();

  if (normalized === ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase()) {
    return ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;
  }

  if (normalized === ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR.toLowerCase()) {
    return ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK;
  }

  return null;
}

// Discovery Types and Functions (merged from monitor-discovery.ts)

/** Discovered timelock operation from CallScheduled event */
export interface DiscoveredTimelockOp {
  timelockAddress: string;
  operationId: string;
  scheduledTxHash: string;
  queueBlock: number;
}

/** Discover timelock operations in a block range */
export async function discoverTimelockOps(
  timelockAddress: string,
  fromBlock: number,
  toBlock: number,
  provider: ethers.providers.Provider,
  options: { chunkSize?: number } = {}
): Promise<DiscoveredTimelockOp[]> {
  if (fromBlock >= toBlock) return [];

  // Use chain-appropriate default chunk size
  const defaultChunkSize = isL1Timelock(timelockAddress) ? CHUNK_SIZES.L1 : CHUNK_SIZES.L2;
  const { logs } = await searchLogsInChunks(
    provider,
    { address: timelockAddress, topics: [EVENT_TOPICS.CALL_SCHEDULED], fromBlock, toBlock },
    { chunkSize: options.chunkSize ?? defaultChunkSize }
  );

  const seen = new Set<string>();
  return logs.flatMap((log) => {
    const operationId = log.topics[1];
    if (seen.has(operationId)) return [];
    seen.add(operationId);
    return [
      {
        timelockAddress,
        operationId,
        scheduledTxHash: log.transactionHash,
        queueBlock: log.blockNumber,
      },
    ];
  });
}
