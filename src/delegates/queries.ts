/**
 * Live delegate queries (requires provider, makes RPC calls)
 *
 * Uses the existing multicall utility for batch efficiency.
 */

import { ethers } from "ethers";
import type { DelegateCache, DelegateNotVoted } from "../types/delegates";
import { multicall, buildCallInput } from "../utils/multicall";
import { governorInterface, erc20VotesInterface } from "../abis";
import { ADDRESSES } from "../constants";
import { loggers } from "../utils/logger";
import { loadBundledDelegateCache, getTopDelegates } from "./cache";

const log = loggers.delegates;

const DEFAULT_LIMIT = 5;
const DEFAULT_MAX_DELEGATES_TO_CHECK = 100;
const DEFAULT_BATCH_SIZE = 20;

export interface QueryDelegatesNotVotedOptions {
  cache?: DelegateCache;
  /** Max non-voters to return (default: 5) */
  limit?: number;
  /** Max delegates to check from top of cache (default: 100) */
  maxDelegatesToCheck?: number;
  /** Calls per multicall batch (default: 20) */
  batchSize?: number;
}

/**
 * Batch-check which of the top delegates haven't voted on a proposal.
 *
 * Loads top delegates from cache, batches hasVoted() multicalls,
 * returns non-voters with rank info. Stops early once limit is reached.
 */
export async function queryDelegatesNotVoted(
  provider: ethers.providers.Provider,
  proposalId: string,
  governorAddress: `0x${string}` | string,
  options: QueryDelegatesNotVotedOptions = {}
): Promise<DelegateNotVoted[]> {
  const {
    limit = DEFAULT_LIMIT,
    maxDelegatesToCheck = DEFAULT_MAX_DELEGATES_TO_CHECK,
    batchSize = DEFAULT_BATCH_SIZE,
  } = options;

  if (batchSize < 1 || maxDelegatesToCheck < 1 || limit < 1) {
    return [];
  }

  const cache = options.cache ?? loadBundledDelegateCache();
  const topDelegates = getTopDelegates(cache, maxDelegatesToCheck);

  if (topDelegates.length === 0) return [];

  log("checking hasVoted for top %d delegates on proposal %s", topDelegates.length, proposalId);

  const result: DelegateNotVoted[] = [];

  for (let i = 0; i < topDelegates.length && result.length < limit; i += batchSize) {
    const batch = topDelegates.slice(i, Math.min(i + batchSize, topDelegates.length));

    const calls = batch.map((d) =>
      buildCallInput<boolean>(governorAddress as string, governorInterface, "hasVoted", [
        proposalId,
        d.address,
      ])
    );

    const results = await multicall(provider, calls, false);

    for (let j = 0; j < batch.length && result.length < limit; j++) {
      const hasVoted = results[j];
      if (hasVoted === false) {
        result.push({
          address: batch[j].address,
          votingPower: batch[j].votingPower,
          rank: i + j + 1,
        });
      }
    }
  }

  log("found %d non-voters", result.length);
  return result;
}

/**
 * Batch-fetch current voting power for a list of addresses.
 *
 * Uses multicall for efficiency. Returns Map<lowercase_address, votingPower_wei>.
 */
export async function queryDelegateVotingPowers(
  provider: ethers.providers.Provider,
  addresses: (`0x${string}` | string)[],
  tokenAddress: `0x${string}` | string = ADDRESSES.ARB_TOKEN
): Promise<Map<string, string>> {
  if (addresses.length === 0) return new Map();

  log("fetching voting power for %d addresses", addresses.length);

  const calls = addresses.map((addr) =>
    buildCallInput<ethers.BigNumber>(tokenAddress as string, erc20VotesInterface, "getVotes", [
      addr,
    ])
  );

  const results = await multicall(provider, calls, false);
  const powerMap = new Map<string, string>();

  for (let i = 0; i < addresses.length; i++) {
    const power = results[i];
    if (power !== undefined) {
      powerMap.set(addresses[i].toLowerCase(), power.toString());
    }
  }

  return powerMap;
}
