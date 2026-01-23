/**
 * Utilities for filtering and parsing transaction receipt logs
 *
 * These helpers reduce duplication across discovery and stage modules
 * that need to find specific events in transaction receipts.
 */

import { ethers } from "ethers";
import { addressEquals } from "./chain";

type Log = ethers.providers.Log;

/**
 * Filter options for finding logs in a receipt
 */
export interface LogFilterOptions {
  /** Event topic (topics[0]) to match */
  topic?: string;
  /** Contract address to match */
  address?: string;
}

/**
 * Filter logs from a receipt by topic and/or address
 *
 * @example
 * // Find all CallScheduled events
 * const logs = filterLogs(receipt.logs, { topic: EVENT_TOPICS.CALL_SCHEDULED });
 *
 * @example
 * // Find L2ToL1Tx events from ArbSys
 * const logs = filterLogs(receipt.logs, { topic: l2ToL1Topic, address: ARB_SYS });
 */
export function filterLogs(logs: Log[], options: LogFilterOptions): Log[] {
  return logs.filter((log) => {
    if (options.topic && log.topics?.[0] !== options.topic) {
      return false;
    }
    if (options.address && !addressEquals(log.address, options.address)) {
      return false;
    }
    return true;
  });
}

/**
 * Parse logs with a parser function, silently skipping parse failures
 *
 * @example
 * const events = parseLogsSafe(logs, parseCallScheduledEvent);
 */
export function parseLogsSafe<T>(logs: Log[], parser: (log: Log) => T | null): T[] {
  return logs.flatMap((log) => {
    try {
      const parsed = parser(log);
      return parsed !== null ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Find and parse logs in one operation
 *
 * Combines filterLogs and parseLogsSafe for the common pattern of
 * filtering logs by topic/address and parsing them.
 *
 * @example
 * const events = findAndParseLogs(
 *   receipt.logs,
 *   { topic: EVENT_TOPICS.CALL_SCHEDULED },
 *   parseCallScheduledEvent
 * );
 */
export function findAndParseLogs<T>(
  logs: Log[],
  options: LogFilterOptions,
  parser: (log: Log) => T | null
): T[] {
  const filtered = filterLogs(logs, options);
  return parseLogsSafe(filtered, parser);
}

/**
 * Find first matching log and parse it
 *
 * @example
 * const event = findFirstLog(
 *   receipt.logs,
 *   { topic: EVENT_TOPICS.PROPOSAL_CREATED },
 *   parseProposalCreatedEvent
 * );
 */
export function findFirstLog<T>(
  logs: Log[],
  options: LogFilterOptions,
  parser: (log: Log) => T | null
): T | null {
  for (const log of logs) {
    if (options.topic && log.topics[0] !== options.topic) continue;
    if (options.address && !addressEquals(log.address, options.address)) continue;

    try {
      const parsed = parser(log);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // Continue to next log
    }
  }
  return null;
}

/**
 * Count logs by address after filtering by topic
 */
export function countLogsByAddress(
  logs: Log[],
  options: Omit<LogFilterOptions, "address">
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const log of logs) {
    if (options.topic && log.topics[0] !== options.topic) continue;

    const addr = log.address.toLowerCase();
    counts.set(addr, (counts.get(addr) ?? 0) + 1);
  }

  return counts;
}
