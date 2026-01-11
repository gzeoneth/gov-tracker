/**
 * Cache utilities for tracker state
 *
 * Provides cache implementations and utility functions.
 * All other state management is handled directly in tracker.ts.
 *
 * Available cache adapters:
 * - FileCache: File-based persistence (Node.js only)
 * - LocalStorageCache: Browser localStorage (web only)
 * - MemoryCache: In-memory, no persistence (universal)
 */

import * as fs from "fs";
import * as path from "path";
import { TrackingCheckpoint, DiscoveryWatermarks, CacheAdapter } from "../types";
import { WATERMARKS_KEY } from "./discovery";
import { safeJsonParse } from "../utils/sanitize";

/**
 * File-based cache that persists to JSON file.
 * Synchronously loads on construction, persists on every write.
 * Uses a write queue to prevent race conditions from concurrent writes.
 */
export class FileCache implements CacheAdapter {
  private readonly path: string;
  private cache: Map<string, unknown>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
    this.cache = this.load();
  }

  private load(): Map<string, unknown> {
    try {
      const data = safeJsonParse<Record<string, unknown>>(fs.readFileSync(this.path, "utf8"));
      return new Map(Object.entries(data));
    } catch {
      return new Map();
    }
  }

  private persistSync(): void {
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const obj = Object.fromEntries(this.cache);
    fs.writeFileSync(this.path, JSON.stringify(obj, null, 2));
  }

  private async persist(): Promise<void> {
    // Chain writes to prevent race conditions
    // Create the write promise that may reject on error
    const writePromise = this.writeQueue.then(() => {
      this.persistSync();
    });

    // Update the queue with error recovery to prevent getting stuck
    // This ensures future writes can proceed even if this one fails
    this.writeQueue = writePromise.catch(() => {
      // Silently recover the queue - error is propagated via writePromise
    });

    // Return the original promise so errors propagate to caller
    return writePromise;
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.cache.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
    await this.persist();
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    await this.persist();
  }

  async clear(): Promise<void> {
    this.cache.clear();
    await this.persist();
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

/**
 * Minimal interface for browser localStorage API
 */
interface WebStorage {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

/**
 * Get localStorage if available (browser environment)
 */
function getLocalStorage(): WebStorage | null {
  // Check for browser environment with localStorage
  if (typeof globalThis !== "undefined") {
    const global = globalThis as unknown as { localStorage?: WebStorage };
    if (typeof global.localStorage !== "undefined") {
      return global.localStorage;
    }
  }
  return null;
}

/**
 * Browser localStorage-based cache adapter.
 * Persists to localStorage with a configurable key prefix.
 *
 * Limitations:
 * - 5MB storage limit (varies by browser)
 * - Synchronous API (blocks main thread, usually negligible)
 * - String-only storage (JSON serialization handled internally)
 *
 * @example
 * ```typescript
 * import { createTracker, LocalStorageCache } from "@gzeoneth/gov-tracker";
 *
 * const tracker = createTracker({
 *   l2Provider,
 *   l1Provider,
 *   cache: new LocalStorageCache("arb-gov:"),
 * });
 * ```
 */
export class LocalStorageCache implements CacheAdapter {
  private readonly prefix: string;

  constructor(prefix: string = "tracker:") {
    this.prefix = prefix;
  }

  private fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const storage = getLocalStorage();
    if (!storage) return null;
    const data = storage.getItem(this.fullKey(key));
    if (data === null) return null;
    try {
      return safeJsonParse<T>(data);
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) return;
    storage.setItem(this.fullKey(key), JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) return;
    storage.removeItem(this.fullKey(key));
  }

  async clear(): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => storage.removeItem(k));
  }

  async has(key: string): Promise<boolean> {
    const storage = getLocalStorage();
    if (!storage) return false;
    return storage.getItem(this.fullKey(key)) !== null;
  }

  async keys(prefix?: string): Promise<string[]> {
    const storage = getLocalStorage();
    if (!storage) return [];
    const result: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const fullKey = storage.key(i);
      if (fullKey?.startsWith(this.prefix)) {
        const key = fullKey.slice(this.prefix.length);
        if (!prefix || key.startsWith(prefix)) {
          result.push(key);
        }
      }
    }
    return result;
  }
}

/**
 * In-memory cache adapter with no persistence.
 * Useful for testing, short-lived sessions, or as a fallback.
 *
 * Data is lost when the page is refreshed or the process exits.
 *
 * @example
 * ```typescript
 * import { createTracker, MemoryCache } from "@gzeoneth/gov-tracker";
 *
 * const tracker = createTracker({
 *   l2Provider,
 *   l1Provider,
 *   cache: new MemoryCache(),
 * });
 * ```
 */
export class MemoryCache implements CacheAdapter {
  private cache: Map<string, unknown> = new Map();

  async get<T>(key: string): Promise<T | null> {
    return (this.cache.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

/**
 * Generate cache key from transaction hash (primary cache key format)
 */
export function txHashCacheKey(txHash: string): string {
  return `tx:${txHash.toLowerCase()}`;
}

/**
 * Read all cache data without requiring RPC providers.
 * Use this for status/dashboard views that only need cached data.
 *
 * @param cachePath - Path to the cache file
 */
export async function readCacheStatus(cachePath: string): Promise<{
  watermarks: DiscoveryWatermarks;
  checkpoints: Map<string, TrackingCheckpoint>;
}> {
  const cache = new FileCache(cachePath);

  // Load watermarks from discovery checkpoint (unified format)
  const discoveryCheckpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
  const watermarks = discoveryCheckpoint?.cachedData.discoveryWatermarks ?? {};

  const checkpoints = new Map<string, TrackingCheckpoint>();
  const allKeys = cache.keys();
  const keys = Array.from(allKeys as Iterable<string>);

  for (const key of keys) {
    if (key.startsWith("tx:")) {
      const checkpoint = await cache.get<TrackingCheckpoint>(key);
      if (checkpoint) {
        checkpoints.set(key, checkpoint);
      }
    }
  }

  return { watermarks, checkpoints };
}

/**
 * Get the path to the bundled cache shipped with the npm package.
 *
 * The bundled cache contains pre-tracked completed proposals, eliminating
 * the need for initial discovery RPC calls. Use this to initialize your
 * app's cache or to point the tracker directly at the bundled data.
 *
 * @returns Path to bundled cache, or undefined if not found
 *
 * @example
 * ```typescript
 * import { getBundledCachePath, createTracker } from "@gzeoneth/gov-tracker";
 * import * as fs from "fs";
 *
 * // Option 1: Copy bundled cache to your app's cache location
 * const bundledPath = getBundledCachePath();
 * const appCachePath = "./my-app-cache.json";
 * if (bundledPath && !fs.existsSync(appCachePath)) {
 *   fs.copyFileSync(bundledPath, appCachePath);
 * }
 * const tracker = createTracker({ ...providers, cachePath: appCachePath });
 *
 * // Option 2: Use bundled cache directly (read-only, updates won't persist)
 * const tracker = createTracker({ ...providers, cachePath: getBundledCachePath() });
 * ```
 */
export function getBundledCachePath(): string | undefined {
  // Try multiple paths to support different module resolution scenarios
  // When installed: node_modules/@gzeoneth/gov-tracker/dist/data/bundled-cache.json
  // In monorepo: packages/gov-tracker/dist/data/bundled-cache.json
  const candidates = [
    path.join(__dirname, "..", "data", "bundled-cache.json"), // dist/tracker -> dist/data
    path.join(__dirname, "..", "..", "data", "bundled-cache.json"), // src/tracker -> data (dev)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
