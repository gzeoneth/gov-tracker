/**
 * Chunked log search with early exit optimization
 *
 * Critical performance pattern: 10-40x faster than naive log search
 */

import { ethers } from "ethers";
import { DEFAULT_CHUNKING_CONFIG } from "../constants";
import { delay, queryWithRetry } from "./rpc-utils";
import { loggers } from "./logger";

const log = loggers.rpc;

/**
 * Log filter parameters
 */
export interface LogFilter {
  address?: string | string[];
  topics?: (string | string[] | null)[];
  fromBlock: number;
  toBlock: number;
}

/**
 * Search result with metadata
 */
export interface LogSearchResult {
  logs: ethers.providers.Log[];
  searchedBlocks: number;
  chunksProcessed: number;
  earlyExit: boolean;
  /** The log that triggered early exit (if earlyExitCheck returned one) */
  matchedLog?: ethers.providers.Log;
}

/**
 * Options for log search
 */
export interface LogSearchOptions {
  chunkSize?: number;
  delayBetweenChunks?: number;
  earlyExitCheck?: (logs: ethers.providers.Log[]) => ethers.providers.Log | undefined;
  maxChunks?: number;
  reverseDirection?: boolean;
}

/**
 * Search for logs in chunks with early exit optimization
 *
 * @example
 * ```typescript
 * // Search for CallExecuted events, stop when found
 * const result = await searchLogsInChunks(
 *   l2Provider,
 *   {
 *     address: timelockAddress,
 *     topics: [EVENT_TOPICS.CALL_EXECUTED, operationId],
 *     fromBlock: queueBlock,
 *     toBlock: currentBlock
 *   },
 *   {
 *     chunkSize: 10_000_000,
 *     earlyExitCheck: (logs) => logs.find(l => l.topics[1] === operationId) ?? null
 *   }
 * );
 * ```
 */
export async function searchLogsInChunks(
  provider: ethers.providers.Provider,
  filter: LogFilter,
  options: LogSearchOptions = {}
): Promise<LogSearchResult> {
  const {
    chunkSize = DEFAULT_CHUNKING_CONFIG.l2ChunkSize,
    delayBetweenChunks = DEFAULT_CHUNKING_CONFIG.delayBetweenChunks,
    earlyExitCheck,
    maxChunks,
    reverseDirection = false,
  } = options;

  const allLogs: ethers.providers.Log[] = [];
  let chunksProcessed = 0;
  let earlyExit = false;
  let matchedLog: ethers.providers.Log | undefined;

  const { fromBlock, toBlock } = filter;
  const totalBlocks = toBlock - fromBlock + 1;
  const searchStart = Date.now();

  const addressStr = Array.isArray(filter.address)
    ? `[${filter.address.length} addrs]`
    : filter.address;
  log(
    "searchLogsInChunks: %s blocks=%d-%d (%d blocks, ~%d chunks)",
    addressStr,
    fromBlock,
    toBlock,
    totalBlocks,
    Math.ceil(totalBlocks / chunkSize)
  );

  if (totalBlocks <= 0) {
    return { logs: [], searchedBlocks: 0, chunksProcessed: 0, earlyExit: false };
  }

  // Generate chunk ranges
  const chunks: Array<{ start: number; end: number }> = [];

  if (reverseDirection) {
    // Search backwards (useful for finding most recent events)
    for (let end = toBlock; end >= fromBlock; end -= chunkSize) {
      const start = Math.max(end - chunkSize + 1, fromBlock);
      chunks.push({ start, end });
    }
  } else {
    // Search forwards (default)
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, toBlock);
      chunks.push({ start, end });
    }
  }

  // Process chunks and track actual blocks searched
  let actualBlocksSearched = 0;

  for (const { start, end } of chunks) {
    if (maxChunks && chunksProcessed >= maxChunks) {
      break;
    }

    const chunkStart = Date.now();
    const logs = await queryWithRetry(() =>
      provider.getLogs({
        address: filter.address as string | undefined,
        topics: filter.topics,
        fromBlock: start,
        toBlock: end,
      })
    );
    const chunkMs = Date.now() - chunkStart;

    log(
      "  chunk %d: blocks=%d-%d found=%d logs (%dms)",
      chunksProcessed + 1,
      start,
      end,
      logs.length,
      chunkMs
    );

    allLogs.push(...logs);
    chunksProcessed++;
    actualBlocksSearched += end - start + 1;

    // Early exit check - critical optimization
    if (earlyExitCheck && logs.length > 0) {
      const match = earlyExitCheck(logs);
      if (match) {
        earlyExit = true;
        matchedLog = match;
        break;
      }
    }

    // Rate limiting between chunks
    if (end < toBlock && delayBetweenChunks > 0) {
      await delay(delayBetweenChunks);
    }
  }

  const totalMs = Date.now() - searchStart;

  log(
    "searchLogsInChunks done: %d logs, %d chunks, %dms%s",
    allLogs.length,
    chunksProcessed,
    totalMs,
    earlyExit ? " (early exit)" : ""
  );

  return {
    logs: allLogs,
    searchedBlocks: actualBlocksSearched,
    chunksProcessed,
    earlyExit,
    matchedLog,
  };
}

/**
 * Search for a single log matching a predicate
 * Returns immediately when found (early exit optimization)
 */
export async function findLog(
  provider: ethers.providers.Provider,
  filter: LogFilter,
  predicate: (log: ethers.providers.Log) => boolean,
  options: Omit<LogSearchOptions, "earlyExitCheck"> = {}
): Promise<ethers.providers.Log | undefined> {
  const result = await searchLogsInChunks(provider, filter, {
    ...options,
    earlyExitCheck: (logs) => logs.find(predicate),
  });

  // Use matchedLog from early exit to avoid double-searching
  return result.matchedLog;
}

/**
 * Generic find and parse event - consolidates the common pattern:
 * getSearchDefaults → findLog → parse → null check
 *
 * Reduces boilerplate in timelock-discovery.ts and similar modules.
 */
export async function findAndParseEvent<T>(
  provider: ethers.providers.Provider,
  filter: LogFilter,
  predicate: (log: ethers.providers.Log) => boolean,
  parser: (log: ethers.providers.Log) => T | null,
  options: Omit<LogSearchOptions, "earlyExitCheck"> = {}
): Promise<T | null> {
  const log = await findLog(provider, filter, predicate, options);
  if (!log) return null;
  return parser(log);
}

/**
 * Create a predicate that matches operationId in topics[1]
 * Common pattern for timelock event filtering
 */
export function createOperationIdPredicate(
  operationId: string,
  addressEquals: (a: string, b: string) => boolean
): (log: ethers.providers.Log) => boolean {
  return (log) => (log.topics[1] ? addressEquals(log.topics[1], operationId) : false);
}
