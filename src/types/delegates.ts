/**
 * Delegate indexing and query types
 *
 * Used by the delegate cache module for tracking voting power
 * and querying delegate participation.
 */

/** Individual delegate record (indexer output) */
export interface DelegateInfo {
  address: `0x${string}`;
  /** Voting power in wei as decimal string */
  votingPower: string;
  lastChangeBlock: number;
}

/**
 * Bundled delegate cache (shipped in package + CLI output).
 *
 * Only includes addresses with ≥10 ARB delegated voting power
 * (configurable via DEFAULT_MIN_VOTING_POWER / --min-power flag).
 * On-disk format uses compact keys ({a, vp, b}); deserialized at load time.
 */
export interface DelegateCache {
  version: number;
  /** ISO timestamp */
  generatedAt: string;
  /** Latest indexed block */
  snapshotBlock: number;
  /** First block scanned */
  startBlock: number;
  chainId: number;
  /** Sum of all delegates' voting power (wei) */
  totalVotingPower: string;
  /** ARB token totalSupply (wei) */
  totalSupply: string;
  /** Sorted by votingPower descending */
  delegates: DelegateInfo[];
  stats: {
    totalDelegates: number;
  };
}

/** Result from queryDelegatesNotVoted */
export interface DelegateNotVoted {
  address: `0x${string}`;
  votingPower: string;
  /** 1-indexed position in cache */
  rank: number;
}

/** Stats for display */
export interface DelegateCacheStats {
  totalDelegates: number;
  snapshotBlock: number;
  generatedAt: string;
  totalVotingPower: string;
  totalSupply: string;
}
