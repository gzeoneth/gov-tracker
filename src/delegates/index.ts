/**
 * Delegate Indexing & Query Module
 *
 * Provides delegate voting power caching, lookup, and live queries
 * for Arbitrum governance token delegates.
 */

// Cache access (sync, no RPC)
export {
  loadBundledDelegateCache,
  getBundledDelegateCachePath,
  extractDelegates,
  getDelegateCacheStats,
  validateDelegateCache,
  serializeDelegateCache,
  DELEGATE_CACHE_VERSION,
} from "./cache";

// Query helpers (sync, operate on loaded cache)
export {
  getTopDelegates,
  getDelegateRankInfo,
  filterDelegatesByMinPower,
  filterDelegatesByAddress,
} from "./cache";

// Live queries (requires provider)
export { queryDelegatesNotVoted, queryDelegateVotingPowers } from "./queries";
export type { QueryDelegatesNotVotedOptions } from "./queries";

// Indexer
export { buildDelegateCache } from "./indexer";
export type { BuildDelegateCacheOptions } from "./indexer";
