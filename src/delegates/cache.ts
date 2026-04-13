/**
 * Delegate cache loading, validation, and query helpers
 *
 * All functions are synchronous and operate on a loaded DelegateCache.
 * No RPC calls — pure data access.
 */

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { safeJsonParse } from "../utils/sanitize";
import type { DelegateCache, DelegateCacheStats, DelegateInfo } from "../types/delegates";

export const DELEGATE_CACHE_VERSION = 1;

const rankLookupCache = new WeakMap<DelegateCache, Map<string, number>>();

function serializeDelegate(d: DelegateInfo): { a: string; vp: string; b: number } {
  return { a: d.address, vp: d.votingPower, b: d.lastChangeBlock };
}

function deserializeDelegate(d: { a: string; vp: string; b: number }): DelegateInfo {
  return { address: d.a as `0x${string}`, votingPower: d.vp, lastChangeBlock: d.b };
}

export function serializeDelegateCache(cache: DelegateCache): Record<string, unknown> {
  return {
    version: DELEGATE_CACHE_VERSION,
    generatedAt: cache.generatedAt,
    snapshotBlock: cache.snapshotBlock,
    startBlock: cache.startBlock,
    chainId: cache.chainId,
    totalVotingPower: cache.totalVotingPower,
    totalSupply: cache.totalSupply,
    delegates: cache.delegates.map(serializeDelegate),
    stats: cache.stats,
  };
}

function getRankMap(cache: DelegateCache): Map<string, number> {
  let map = rankLookupCache.get(cache);
  if (!map) {
    map = new Map();
    for (let i = 0; i < cache.delegates.length; i++) {
      map.set(cache.delegates[i].address.toLowerCase(), i);
    }
    rankLookupCache.set(cache, map);
  }
  return map;
}

/**
 * Get the path to the bundled delegate cache shipped with the package.
 * Tries multiple candidate paths to support dist/ and src/ layouts.
 */
export function getBundledDelegateCachePath(): string | undefined {
  const candidates = [
    path.join(__dirname, "..", "data", "delegate-cache.json"), // dist/delegates -> dist/data
    path.join(__dirname, "..", "..", "data", "delegate-cache.json"), // src/delegates -> data (dev)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Load the bundled delegate cache shipped with the package.
 * Returns the parsed DelegateCache object.
 */
export function loadBundledDelegateCache(): DelegateCache {
  const cachePath = getBundledDelegateCachePath();
  if (!cachePath) {
    throw new Error("Delegate cache not found. Run 'yarn cache:delegates' to generate it.");
  }
  const raw = fs.readFileSync(cachePath, "utf8");
  const data = safeJsonParse<DelegateCache>(raw);
  if (!data || !validateDelegateCache(data)) {
    throw new Error("Invalid delegate cache format at " + cachePath);
  }
  return data;
}

/** Extract the delegates array from a cache */
export function extractDelegates(cache: DelegateCache): DelegateInfo[] {
  return cache.delegates;
}

/** Extract display statistics from a cache */
export function getDelegateCacheStats(cache: DelegateCache): DelegateCacheStats {
  return {
    totalDelegates: cache.stats.totalDelegates,
    snapshotBlock: cache.snapshotBlock,
    generatedAt: cache.generatedAt,
    totalVotingPower: cache.totalVotingPower,
    totalSupply: cache.totalSupply,
  };
}

/** Get top N delegates by voting power (already sorted in cache) */
export function getTopDelegates(cache: DelegateCache, limit?: number): DelegateInfo[] {
  if (limit === undefined || limit >= cache.delegates.length) {
    return cache.delegates;
  }
  return cache.delegates.slice(0, limit);
}

/**
 * Look up a delegate's rank and cached voting power.
 * Returns undefined if address not found.
 * Uses pre-computed Map for O(1) lookup.
 */
export function getDelegateRankInfo(
  cache: DelegateCache,
  address: `0x${string}` | string
): { rank: number; votingPower: string } | undefined {
  const map = getRankMap(cache);
  const index = map.get(address.toLowerCase());
  if (index === undefined) return undefined;
  const delegate = cache.delegates[index];
  return { rank: index + 1, votingPower: delegate.votingPower };
}

/** Filter delegates by minimum voting power threshold (wei) */
export function filterDelegatesByMinPower(
  delegates: DelegateInfo[],
  minVotingPower: string
): DelegateInfo[] {
  const threshold = ethers.BigNumber.from(minVotingPower);
  return delegates.filter((d) => ethers.BigNumber.from(d.votingPower).gte(threshold));
}

/** Filter delegates by address substring match (case-insensitive) */
export function filterDelegatesByAddress(
  delegates: DelegateInfo[],
  addressFilter: string
): DelegateInfo[] {
  const lower = addressFilter.toLowerCase();
  return delegates.filter((d) => d.address.toLowerCase().includes(lower));
}

/**
 * Runtime validation that an unknown value is a valid DelegateCache.
 * Expects compact delegate keys ({a, vp, b}) and expands them in-place.
 */
export function validateDelegateCache(data: unknown): data is DelegateCache {
  if (data === null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "number") return false;
  if (typeof obj.generatedAt !== "string") return false;
  if (typeof obj.snapshotBlock !== "number") return false;
  if (typeof obj.startBlock !== "number") return false;
  if (typeof obj.chainId !== "number") return false;
  if (typeof obj.totalVotingPower !== "string") return false;
  if (typeof obj.totalSupply !== "string") return false;
  if (!Array.isArray(obj.delegates)) return false;

  const stats = obj.stats;
  if (stats === null || typeof stats !== "object") return false;
  if (typeof (stats as Record<string, unknown>).totalDelegates !== "number") return false;

  if (obj.delegates.length > 0) {
    const first = obj.delegates[0] as Record<string, unknown>;
    if (typeof first.a !== "string" || typeof first.vp !== "string" || typeof first.b !== "number")
      return false;
    obj.delegates = (obj.delegates as { a: string; vp: string; b: number }[]).map(
      deserializeDelegate
    );
  }

  return true;
}
