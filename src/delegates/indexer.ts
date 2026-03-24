/**
 * Delegate cache indexer
 *
 * Scans DelegateVotesChanged events from the ARB token contract
 * and produces a DelegateCache snapshot.
 *
 * Uses adaptive chunking to handle event-dense periods (e.g., ARB airdrop)
 * where even moderate block ranges exceed RPC log limits.
 *
 * Processes events into a Map per-chunk to avoid OOM on full genesis builds
 * (~millions of events over 370M+ blocks).
 */

import { ethers } from "ethers";
import type { DelegateCache, DelegateInfo } from "../types/delegates";
import { queryWithRetry, getErrorMessage } from "../utils/rpc-utils";
import { delay } from "../utils/rpc-utils";
import { compareBigNumbers } from "../utils/chain";
import { loggers } from "../utils/logger";
import { erc20VotesInterface } from "../abis";
import {
  ADDRESSES,
  CHAIN_IDS,
  DELEGATE_START_BLOCK,
  DEFAULT_MIN_VOTING_POWER,
  EXCLUDED_DELEGATE_ADDRESSES,
  EVENT_TOPICS,
} from "../constants";

const log = loggers.delegates;

import { DELEGATE_CACHE_VERSION } from "./cache";
const DEFAULT_CHUNK_SIZE = 1_000_000;
const MIN_CHUNK_SIZE = 1_000;
const DELAY_BETWEEN_CHUNKS = 100;
const SUCCESSES_BEFORE_GROW = 3;

export interface BuildDelegateCacheOptions {
  existingCache?: DelegateCache;
  force?: boolean;
  startBlock?: number;
  /** Minimum voting power in wei (default: 10 ARB) */
  minVotingPower?: string;
  /** Token contract address (default: ADDRESSES.ARB_TOKEN) */
  tokenAddress?: string;
  onProgress?: (pct: number, block: number) => void;
}

function isLogLimitError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes("exceeds limit") ||
    msg.includes("too many") ||
    msg.includes("response size exceeded")
  );
}

/**
 * Process a batch of DelegateVotesChanged logs into the delegate map.
 * Later events overwrite earlier ones (Map dedup). Zero-balance removes entry.
 */
function processLogs(logs: ethers.providers.Log[], delegateMap: Map<string, DelegateInfo>): void {
  for (const eventLog of logs) {
    const parsed = erc20VotesInterface.parseLog(eventLog);
    const delegate = parsed.args[0] as string;
    const newBalance = (parsed.args[2] as ethers.BigNumber).toString();
    const key = delegate.toLowerCase();

    if (ethers.BigNumber.from(newBalance).isZero()) {
      delegateMap.delete(key);
    } else {
      delegateMap.set(key, {
        address: delegate.toLowerCase() as `0x${string}`,
        votingPower: newBalance,
        lastChangeBlock: eventLog.blockNumber,
      });
    }
  }
}

/**
 * Scan logs with adaptive chunk sizing, processing each chunk into the map
 * immediately to avoid accumulating millions of raw logs in memory.
 */
async function scanAndProcessAdaptive(
  provider: ethers.providers.Provider,
  address: string,
  topic: string,
  fromBlock: number,
  toBlock: number,
  delegateMap: Map<string, DelegateInfo>,
  onProgress?: (pct: number, block: number) => void
): Promise<number> {
  let chunkSize = DEFAULT_CHUNK_SIZE;
  let consecutiveSuccesses = 0;
  let cursor = fromBlock;
  let totalEvents = 0;
  const totalBlocks = toBlock - fromBlock + 1;

  while (cursor <= toBlock) {
    const end = Math.min(cursor + chunkSize - 1, toBlock);

    try {
      const logs = await queryWithRetry(() =>
        provider.getLogs({
          address,
          topics: [topic],
          fromBlock: cursor,
          toBlock: end,
        })
      );

      processLogs(logs, delegateMap);
      totalEvents += logs.length;
      log("  chunk %d-%d: %d logs (chunkSize=%d)", cursor, end, logs.length, chunkSize);

      cursor = end + 1;
      consecutiveSuccesses++;

      if (consecutiveSuccesses >= SUCCESSES_BEFORE_GROW && chunkSize < DEFAULT_CHUNK_SIZE) {
        chunkSize = Math.min(chunkSize * 2, DEFAULT_CHUNK_SIZE);
        consecutiveSuccesses = 0;
        log("  growing chunk size to %d", chunkSize);
      }

      if (onProgress) {
        const pct = Math.min(99, Math.round(((cursor - fromBlock) / totalBlocks) * 100));
        onProgress(pct, cursor);
      }

      if (cursor <= toBlock) {
        await delay(DELAY_BETWEEN_CHUNKS);
      }
    } catch (err) {
      if (isLogLimitError(err) && chunkSize > MIN_CHUNK_SIZE) {
        chunkSize = Math.max(Math.floor(chunkSize / 2), MIN_CHUNK_SIZE);
        consecutiveSuccesses = 0;
        log("  log limit exceeded, reducing chunk size to %d", chunkSize);
        continue;
      }
      throw err;
    }
  }

  return totalEvents;
}

/**
 * Build or incrementally update a delegate voting power cache.
 *
 * Scans DelegateVotesChanged events and aggregates the latest
 * voting power per delegate address.
 */
export async function buildDelegateCache(
  provider: ethers.providers.Provider,
  options: BuildDelegateCacheOptions = {}
): Promise<DelegateCache> {
  const {
    existingCache,
    force = false,
    minVotingPower = DEFAULT_MIN_VOTING_POWER,
    tokenAddress = ADDRESSES.ARB_TOKEN,
    onProgress,
  } = options;

  const currentBlock = await queryWithRetry(() => provider.getBlockNumber());

  let startBlock: number;
  if (options.startBlock !== undefined) {
    startBlock = options.startBlock;
  } else if (!force && existingCache) {
    startBlock = existingCache.snapshotBlock + 1;
  } else {
    startBlock = DELEGATE_START_BLOCK;
  }

  if (startBlock > currentBlock) {
    log("cache is already up to date (start=%d > current=%d)", startBlock, currentBlock);
    if (existingCache) return existingCache;
    return emptyCache(startBlock, currentBlock);
  }

  log(
    "scanning DelegateVotesChanged from block %d to %d (%d blocks)",
    startBlock,
    currentBlock,
    currentBlock - startBlock + 1
  );

  const delegateMap = new Map<string, DelegateInfo>();

  // Seed from existing cache if incremental (not when startBlock is explicitly overridden)
  const isIncremental = !force && existingCache && options.startBlock === undefined;
  if (isIncremental) {
    for (const d of existingCache.delegates) {
      delegateMap.set(d.address.toLowerCase(), { ...d });
    }
  }

  const totalEvents = await scanAndProcessAdaptive(
    provider,
    tokenAddress,
    EVENT_TOPICS.DELEGATE_VOTES_CHANGED,
    startBlock,
    currentBlock,
    delegateMap,
    onProgress
  );

  log("processed %d events, %d unique delegates in map", totalEvents, delegateMap.size);

  // Filter excluded addresses
  for (const addr of EXCLUDED_DELEGATE_ADDRESSES) {
    delegateMap.delete(addr.toLowerCase());
  }

  // Filter by minimum voting power
  const minPowerBn = ethers.BigNumber.from(minVotingPower);
  for (const [key, info] of delegateMap) {
    if (ethers.BigNumber.from(info.votingPower).lt(minPowerBn)) {
      delegateMap.delete(key);
    }
  }

  // Sort descending by voting power
  const delegates = Array.from(delegateMap.values()).sort((a, b) =>
    compareBigNumbers(ethers.BigNumber.from(b.votingPower), ethers.BigNumber.from(a.votingPower))
  );

  // Fetch totalSupply
  const tokenContract = new ethers.Contract(tokenAddress, erc20VotesInterface, provider);
  const totalSupply = await queryWithRetry<ethers.BigNumber>(() => tokenContract.totalSupply());

  // Sum voting power
  let totalVotingPower = ethers.BigNumber.from(0);
  for (const d of delegates) {
    totalVotingPower = totalVotingPower.add(d.votingPower);
  }

  if (onProgress) {
    onProgress(100, currentBlock);
  }

  log("built cache: %d delegates at block %d", delegates.length, currentBlock);

  return {
    version: DELEGATE_CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    snapshotBlock: currentBlock,
    startBlock: force ? startBlock : (existingCache?.startBlock ?? startBlock),
    chainId: CHAIN_IDS.ARB_ONE,
    totalVotingPower: totalVotingPower.toString(),
    totalSupply: totalSupply.toString(),
    delegates,
    stats: { totalDelegates: delegates.length },
  };
}

function emptyCache(startBlock: number, snapshotBlock: number): DelegateCache {
  return {
    version: DELEGATE_CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    snapshotBlock,
    startBlock,
    chainId: CHAIN_IDS.ARB_ONE,
    totalVotingPower: "0",
    totalSupply: "0",
    delegates: [],
    stats: { totalDelegates: 0 },
  };
}
