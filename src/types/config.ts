/**
 * Configuration types for the tracker
 */

import { ethers } from "ethers";
import { TrackedStage } from "./stages";

/**
 * Tracking context for block-scoped caching and consistent state reads.
 *
 * When block numbers are provided:
 * - RPC calls use these blocks for state queries (immutable historical state)
 * - Results are cached keyed by block number
 * - Consistent results across multiple function calls in the same tracking session
 *
 * When block numbers are not provided:
 * - RPC calls query "latest" state (mutable)
 * - Results are only cached if they are known to be immutable (via isImmutable predicate)
 *
 * The context should be created once at the start of a tracking session and passed
 * through all function calls for consistency.
 */
export interface TrackingContext {
  /**
   * L2 (Arbitrum One) block number for block-scoped caching.
   * When provided, enables immutable historical state caching for L2 operations.
   */
  l2BlockNumber?: number;

  /**
   * L1 (Ethereum mainnet) block number for block-scoped caching.
   * When provided, enables immutable historical state caching for L1 operations.
   */
  l1BlockNumber?: number;

  /**
   * Nova block number for block-scoped caching.
   * When provided, enables immutable historical state caching for Nova operations.
   */
  novaBlockNumber?: number;

  /**
   * Unix timestamp (seconds) for consistent time-based calculations.
   * Used for ETA calculations, delay checks, and timing displays.
   * When provided, avoids repeated getBlock() calls to fetch current time.
   */
  timestamp?: number;

  /**
   * Override chunk size for log searches.
   * When provided, overrides the default chunk sizes from ChunkingConfig.
   */
  chunkSize?: number;

  /**
   * Skip cache lookups and force fresh RPC queries.
   * Useful for debugging or when cache might be stale.
   */
  skipCache?: boolean;
}

/**
 * Chunking configuration for log searches
 */
export interface ChunkingConfig {
  l2ChunkSize: number;
  l1ChunkSize: number;
  novaChunkSize?: number;
  delayBetweenChunks: number;
}

/**
 * Retry configuration for RPC calls
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * Progress callback for monitoring stage tracking
 *
 * Note: During active tracking, the `stage` field contains the stage being
 * processed. This may be a partial/incomplete stage while tracking is in
 * progress (e.g., status may be "PENDING" while data is still being fetched).
 * Only treat stages as final when `isComplete` is true.
 */
export interface TrackingProgress {
  /** Current stage being processed (may be partial during tracking) */
  stage: TrackedStage;
  /** All stages tracked so far */
  stages: TrackedStage[];
  /** Index of current stage in the full pipeline */
  currentIndex: number;
  /** Total number of stages in the pipeline */
  totalStages: number;
  /** Whether tracking has completed (all stages processed) */
  isComplete: boolean;
}

/**
 * Progress callback function type
 */
export type OnProgressCallback = (progress: TrackingProgress) => void | Promise<void>;

/**
 * Provider or RPC URL. When a string URL is provided, a StaticJsonRpcProvider is created.
 */
export type ProviderOrUrl = ethers.providers.Provider | string;

/**
 * Main tracker options
 *
 * Providers can be specified either as ethers Provider objects or as RPC URL strings.
 * When URL strings are provided, StaticJsonRpcProvider instances are created internally.
 *
 * @example Using RPC URLs (recommended for web apps)
 * ```typescript
 * const tracker = createTracker({
 *   l2Provider: "https://arb1.arbitrum.io/rpc",
 *   l1Provider: "https://eth.llamarpc.com",
 * });
 * ```
 *
 * @example Using providers
 * ```typescript
 * const tracker = createTracker({
 *   l2Provider: new ethers.providers.StaticJsonRpcProvider(ARB1_RPC),
 *   l1Provider: new ethers.providers.StaticJsonRpcProvider(ETH_RPC),
 * });
 * ```
 */
export interface TrackerOptions {
  /** Arbitrum One provider or RPC URL (required) */
  l2Provider?: ProviderOrUrl;
  /** Ethereum mainnet provider or RPC URL (required) */
  l1Provider: ProviderOrUrl;
  /** Arbitrum Nova provider or RPC URL (optional, defaults to public RPC) */
  novaProvider?: ProviderOrUrl;
  chunkingConfig?: ChunkingConfig;
  onProgress?: OnProgressCallback;
  /**
   * Path to cache file (Node.js only). Creates a FileCache internally.
   * For browser environments, use the `cache` option instead.
   */
  cachePath?: string;
  /**
   * Custom cache adapter instance. Use this for browser environments
   * or custom storage backends.
   *
   * @example
   * ```typescript
   * // Browser with localStorage
   * cache: new LocalStorageCache("arb-gov:")
   *
   * // In-memory (no persistence)
   * cache: new MemoryCache()
   *
   * // Custom adapter
   * cache: new MyRedisCache(redisClient)
   * ```
   */
  cache?: CacheAdapter;
}

/**
 * Cache adapter interface
 */
export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(prefix?: string): Promise<string[]> | string[] | IterableIterator<string>;
  flush?(): Promise<void>;
}
