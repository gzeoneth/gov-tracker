/**
 * Block-scoped cache for RPC results
 *
 * Caches results that are immutable at a specific block number.
 * Does NOT cache results queried at "latest" (mutable).
 */

export interface BlockCacheOptions<T> {
  /** Optional predicate to determine if result should be cached even without blockNumber */
  isImmutable?: (value: T) => boolean;
}

/**
 * A cache that stores values scoped by block number.
 * Only caches when blockNumber is provided (immutable historical state),
 * OR when the value passes the isImmutable predicate.
 */
export class BlockScopedCache<K, V> {
  private cache = new Map<string, V>();
  private isImmutable?: (value: V) => boolean;

  constructor(options: BlockCacheOptions<V> = {}) {
    this.isImmutable = options.isImmutable;
  }

  private makeKey(key: K, blockNumber?: number): string {
    const keyStr = typeof key === "string" ? key : JSON.stringify(key);
    return blockNumber !== undefined ? `${keyStr}:${blockNumber}` : keyStr;
  }

  /**
   * Get a cached value.
   * @param key - The cache key
   * @param blockNumber - If provided, looks up block-scoped entry. If not, looks up "latest" entry.
   * @param options.skipCache - If true, always returns undefined (forces fresh fetch)
   */
  get(key: K, blockNumber?: number, options?: { skipCache?: boolean }): V | undefined {
    // Skip cache if requested
    if (options?.skipCache) {
      return undefined;
    }

    // When blockNumber is provided, only check block-scoped cache
    if (blockNumber !== undefined) {
      return this.cache.get(this.makeKey(key, blockNumber));
    }

    // When no blockNumber, check if we have an immutable "latest" entry
    const latestKey = this.makeKey(key);
    return this.cache.get(latestKey);
  }

  /**
   * Set a cached value.
   * @param key - The cache key
   * @param value - The value to cache
   * @param blockNumber - If provided, caches as immutable block-scoped entry
   */
  set(key: K, value: V, blockNumber?: number): void {
    if (blockNumber !== undefined) {
      // Block-scoped: always cache (immutable historical state)
      this.cache.set(this.makeKey(key, blockNumber), value);
    } else if (this.isImmutable?.(value)) {
      // No blockNumber but value is immutable: cache as "latest"
      this.cache.set(this.makeKey(key), value);
    }
    // Otherwise: don't cache (mutable state queried at "latest")
  }

  /**
   * Check if a value exists in cache.
   */
  has(key: K, blockNumber?: number): boolean {
    return this.cache.has(this.makeKey(key, blockNumber));
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }
}
