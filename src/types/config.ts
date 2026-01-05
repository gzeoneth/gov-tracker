/**
 * Configuration types for the tracker
 */

import { ethers } from "ethers";
import { TrackedStage } from "./stages";

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
 */
export interface TrackingProgress {
  stage: TrackedStage;
  stages: TrackedStage[];
  currentIndex: number;
  totalStages: number;
  isComplete: boolean;
}

/**
 * Progress callback function type
 */
export type OnProgressCallback = (progress: TrackingProgress) => void | Promise<void>;

/**
 * Main tracker options
 */
export interface TrackerOptions {
  l2Provider: ethers.providers.Provider;
  l1Provider: ethers.providers.Provider;
  novaProvider?: ethers.providers.Provider;
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
}
