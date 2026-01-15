/**
 * Cache Module Tests
 *
 * Tests for FileCache, MemoryCache, LocalStorageCache, and utility functions.
 * No RPC calls required.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  FileCache,
  MemoryCache,
  LocalStorageCache,
  readCacheStatus,
  getBundledCachePath,
} from "../src/tracker/cache";
import { txHashCacheKey } from "../src/tracker/checkpoint-helpers";
import { WATERMARKS_KEY } from "../src/tracker/discovery";
import type { TrackingCheckpoint, DiscoveryWatermarks } from "../src/types";

describe("Cache State Module", () => {
  describe("MemoryCache", () => {
    let cache: MemoryCache;

    beforeEach(() => {
      cache = new MemoryCache();
    });

    it("should get null for non-existent key", async () => {
      // #given - an empty memory cache

      // #when - getting a key that doesn't exist
      const result = await cache.get("nonexistent");

      // #then - should return null
      expect(result).toBeNull();
    });

    it("should set and get a value", async () => {
      // #given - a key-value pair to store
      const key = "key1";
      const value = { foo: "bar" };

      // #when - setting and then getting the value
      await cache.set(key, value);
      const result = await cache.get(key);

      // #then - should return the stored value
      expect(result).toEqual({ foo: "bar" });
    });

    it("should overwrite existing value", async () => {
      // #given - a key with an initial value
      await cache.set("key1", "first");

      // #when - setting a new value for the same key
      await cache.set("key1", "second");
      const result = await cache.get("key1");

      // #then - should return the new value
      expect(result).toBe("second");
    });

    it("should delete a key", async () => {
      // #given - a cache with a stored key-value pair
      await cache.set("key1", "value");

      // #when - deleting the key
      await cache.delete("key1");
      const result = await cache.get("key1");

      // #then - the key should no longer exist
      expect(result).toBeNull();
    });

    it("should clear all keys", async () => {
      // #given - a cache with multiple key-value pairs
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      // #when - clearing the cache
      await cache.clear();

      // #then - all keys should be removed
      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
    });

    it("should check if key exists with has", async () => {
      // #given - a cache with one stored key
      await cache.set("key1", "value");

      // #when - checking existence of keys

      // #then - existing key returns true, non-existent returns false
      expect(await cache.has("key1")).toBe(true);
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should iterate over keys", async () => {
      // #given - a cache with multiple keys
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      // #when - iterating over the keys
      const keys = Array.from(cache.keys());

      // #then - all stored keys should be present
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
    });

    it("should handle complex objects", async () => {
      // #given - a complex TrackingCheckpoint object
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          proposalId: "12345",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "2".repeat(64),
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 100, l2: 200 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      // #when - storing and retrieving the complex object
      await cache.set("tx:0x123", checkpoint);
      const result = await cache.get<TrackingCheckpoint>("tx:0x123");

      // #then - the object should be preserved with all properties
      if (result && result.input.type === "governor") {
        expect(result.input.proposalId).toBe("12345");
      }
    });
  });

  describe("FileCache", () => {
    let cache: FileCache;
    let tempFile: string;

    beforeEach(() => {
      // Create a unique temp file for each test
      tempFile = path.join("/tmp", `gov-tracker-test-${Date.now()}-${Math.random()}.json`);
      cache = new FileCache(tempFile);
    });

    afterEach(() => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    it("should get null for non-existent key", async () => {
      // #given - an empty file cache

      // #when - getting a key that doesn't exist
      const result = await cache.get("nonexistent");

      // #then - should return null
      expect(result).toBeNull();
    });

    it("should set and get a value", async () => {
      // #given - a key-value pair to store

      // #when - setting and then getting the value
      await cache.set("key1", { foo: "bar" });
      const result = await cache.get("key1");

      // #then - should return the stored value
      expect(result).toEqual({ foo: "bar" });
    });

    it("should persist to file", async () => {
      // #given - a key-value pair

      // #when - setting a value in the cache
      await cache.set("key1", "value1");

      // #then - the value should be persisted to the file system
      const content = fs.readFileSync(tempFile, "utf8");
      const data = JSON.parse(content);
      expect(data.key1).toBe("value1");
    });

    it("should load from existing file", async () => {
      // #given - a file with pre-existing data
      fs.writeFileSync(tempFile, JSON.stringify({ existing: "data" }));

      // #when - creating a new cache instance pointing to the same file
      const newCache = new FileCache(tempFile);
      const result = await newCache.get("existing");

      // #then - should load the existing data
      expect(result).toBe("data");
    });

    it("should handle non-existent file gracefully", () => {
      // #given - a path to a non-existent file
      const nonExistentPath = path.join("/tmp", "non-existent-" + Date.now() + ".json");

      // #when - creating a cache with the non-existent file
      const newCache = new FileCache(nonExistentPath);

      // #then - should not throw and return an empty cache
      expect(newCache.keys()).toBeDefined();

      // Cleanup
      try {
        fs.unlinkSync(nonExistentPath);
      } catch {
        // Expected - file may not exist
      }
    });

    it("should delete a key", async () => {
      // #given - a cache with a stored key-value pair
      await cache.set("key1", "value");

      // #when - deleting the key
      await cache.delete("key1");
      const result = await cache.get("key1");

      // #then - the key should no longer exist
      expect(result).toBeNull();
    });

    it("should clear all keys", async () => {
      // #given - a cache with multiple key-value pairs
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      // #when - clearing the cache
      await cache.clear();

      // #then - all keys should be removed
      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
    });

    it("should check if key exists with has", async () => {
      // #given - a cache with one stored key
      await cache.set("key1", "value");

      // #when - checking existence of keys

      // #then - existing key returns true, non-existent returns false
      expect(await cache.has("key1")).toBe(true);
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should handle concurrent writes", async () => {
      // #given - multiple write operations prepared in parallel
      const writes = [
        cache.set("key1", "value1"),
        cache.set("key2", "value2"),
        cache.set("key3", "value3"),
      ];

      // #when - executing all writes concurrently
      await Promise.all(writes);

      // #then - all writes should succeed and values should be retrievable
      expect(await cache.get("key1")).toBe("value1");
      expect(await cache.get("key2")).toBe("value2");
      expect(await cache.get("key3")).toBe("value3");
    });
  });

  describe("LocalStorageCache", () => {
    let cache: LocalStorageCache;
    let mockStorage: Map<string, string>;

    beforeEach(() => {
      mockStorage = new Map();

      // Mock globalThis.localStorage
      const mockLocalStorage = {
        length: 0,
        getItem: (key: string) => mockStorage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mockStorage.set(key, value);
          mockLocalStorage.length = mockStorage.size;
        },
        removeItem: (key: string) => {
          mockStorage.delete(key);
          mockLocalStorage.length = mockStorage.size;
        },
        key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
      };

      (globalThis as any).localStorage = mockLocalStorage;
      cache = new LocalStorageCache("test:");
    });

    afterEach(() => {
      delete (globalThis as any).localStorage;
    });

    it("should get null for non-existent key", async () => {
      // #given - an empty localStorage cache

      // #when - getting a key that doesn't exist
      const result = await cache.get("nonexistent");

      // #then - should return null
      expect(result).toBeNull();
    });

    it("should set and get a value", async () => {
      // #given - a key-value pair to store

      // #when - setting and then getting the value
      await cache.set("key1", { foo: "bar" });
      const result = await cache.get("key1");

      // #then - should return the stored value
      expect(result).toEqual({ foo: "bar" });
    });

    it("should use prefix for storage key", async () => {
      // #given - a cache configured with prefix "test:"

      // #when - setting a value
      await cache.set("key1", "value1");

      // #then - the storage key should include the prefix
      expect(mockStorage.has("test:key1")).toBe(true);
    });

    it("should delete a key", async () => {
      // #given - a cache with a stored key-value pair
      await cache.set("key1", "value");

      // #when - deleting the key
      await cache.delete("key1");
      const result = await cache.get("key1");

      // #then - the key should no longer exist
      expect(result).toBeNull();
    });

    it("should clear only prefixed keys", async () => {
      // #given - a cache with multiple keys and another key with different prefix
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      mockStorage.set("other:key", "other value");

      // #when - clearing the cache
      await cache.clear();

      // #then - only keys with matching prefix should be removed
      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
      expect(mockStorage.has("other:key")).toBe(true);
    });

    it("should check if key exists with has", async () => {
      // #given - a cache with one stored key
      await cache.set("key1", "value");

      // #when - checking existence of keys

      // #then - existing key returns true, non-existent returns false
      expect(await cache.has("key1")).toBe(true);
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should list keys with prefix filter", async () => {
      // #given - a cache with multiple keys having different prefixes
      await cache.set("tx:0x123", "value1");
      await cache.set("tx:0x456", "value2");
      await cache.set("discovery:watermarks", "watermarks");

      // #when - listing keys with and without prefix filter
      const txKeys = await cache.keys("tx:");
      const allKeys = await cache.keys();

      // #then - filtered list should only contain matching prefixes
      expect(txKeys).toContain("tx:0x123");
      expect(txKeys).toContain("tx:0x456");
      expect(txKeys).not.toContain("discovery:watermarks");
      expect(allKeys).toHaveLength(3);
    });

    it("should handle invalid JSON gracefully", async () => {
      // #given - localStorage contains invalid JSON data
      mockStorage.set("test:invalid", "not valid json");

      // #when - getting the key with invalid JSON
      const result = await cache.get("invalid");

      // #then - should return null instead of throwing
      expect(result).toBeNull();
    });

    it("should return empty for missing localStorage", async () => {
      // #given - localStorage is not available
      delete (globalThis as any).localStorage;
      const noStorageCache = new LocalStorageCache("test:");

      // #when - attempting to use cache operations

      // #then - should gracefully return empty/null values
      expect(await noStorageCache.get("key")).toBeNull();
      expect(await noStorageCache.has("key")).toBe(false);
      expect(await noStorageCache.keys()).toEqual([]);
    });
  });

  describe("txHashCacheKey", () => {
    it("should create lowercase cache key with tx: prefix", () => {
      // #given - a transaction hash with uppercase characters
      const hash = "0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";

      // #when - generating the cache key
      const key = txHashCacheKey(hash);

      // #then - should return lowercase key with tx: prefix
      expect(key).toBe("tx:0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    });

    it("should handle already lowercase hash", () => {
      // #given - a transaction hash already in lowercase
      const hash = "0xabcdef";

      // #when - generating the cache key
      const key = txHashCacheKey(hash);

      // #then - should return the same hash with tx: prefix
      expect(key).toBe("tx:0xabcdef");
    });
  });

  describe("readCacheStatus", () => {
    let tempFile: string;

    beforeEach(() => {
      tempFile = path.join("/tmp", `gov-tracker-test-${Date.now()}-${Math.random()}.json`);
    });

    afterEach(() => {
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    it("should return empty data for empty cache", async () => {
      // #given - an empty cache file
      fs.writeFileSync(tempFile, "{}");

      // #when - reading cache status
      const { watermarks, checkpoints } = await readCacheStatus(tempFile);

      // #then - should return empty watermarks and no checkpoints
      expect(watermarks).toEqual({});
      expect(checkpoints.size).toBe(0);
    });

    it("should load watermarks from discovery checkpoint", async () => {
      // #given - a cache file with discovery watermarks
      const discoveryWatermarks: DiscoveryWatermarks = {
        constitutionalGovernor: 100000,
        nonConstitutionalGovernor: 200000,
      };

      const discoveryCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "discovery", id: "watermarks" },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 200000 },
        cachedData: { discoveryWatermarks },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      const data = {
        [WATERMARKS_KEY]: discoveryCheckpoint,
      };

      fs.writeFileSync(tempFile, JSON.stringify(data));

      // #when - reading cache status
      const { watermarks } = await readCacheStatus(tempFile);

      // #then - should return the discovery watermarks
      expect(watermarks).toEqual(discoveryWatermarks);
    });

    it("should load transaction checkpoints", async () => {
      // #given - a cache file with transaction checkpoints and other keys
      const txCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          proposalId: "12345",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "2".repeat(64),
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 100, l2: 200 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      const data = {
        "tx:0xabc": txCheckpoint,
        "tx:0xdef": txCheckpoint,
        "other:key": { notACheckpoint: true },
      };

      fs.writeFileSync(tempFile, JSON.stringify(data));

      // #when - reading cache status
      const { checkpoints } = await readCacheStatus(tempFile);

      // #then - should only include keys starting with "tx:"
      expect(checkpoints.size).toBe(2);
      expect(checkpoints.has("tx:0xabc")).toBe(true);
      expect(checkpoints.has("tx:0xdef")).toBe(true);
    });

    it("should handle non-existent file", async () => {
      // #given - a path to a non-existent file
      const nonExistentPath = path.join("/tmp", "non-existent-" + Date.now() + ".json");

      // #when - reading cache status
      const { watermarks, checkpoints } = await readCacheStatus(nonExistentPath);

      // #then - should return empty data without throwing
      expect(watermarks).toEqual({});
      expect(checkpoints.size).toBe(0);
    });
  });

  describe("getBundledCachePath", () => {
    it("should return a valid path when bundled cache exists", () => {
      // #given - the bundled cache exists in the data directory

      // #when - calling getBundledCachePath
      const result = getBundledCachePath();

      // #then - should return a path to an existing file
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      if (result) {
        expect(fs.existsSync(result)).toBe(true);
      }
    });

    it("should return path ending with bundled-cache.json", () => {
      // #given - the bundled cache exists

      // #when - calling getBundledCachePath
      const result = getBundledCachePath();

      // #then - should return a path with correct filename
      expect(result).toBeDefined();
      expect(result).toMatch(/bundled-cache\.json$/);
    });

    it("should return path containing data directory", () => {
      // #given - the bundled cache exists

      // #when - calling getBundledCachePath
      const result = getBundledCachePath();

      // #then - should return a path containing /data/
      expect(result).toBeDefined();
      expect(result).toMatch(/[/\\]data[/\\]/);
    });

    it("should return valid JSON cache file", () => {
      // #given - the bundled cache exists

      // #when - reading the bundled cache file
      const cachePath = getBundledCachePath();
      expect(cachePath).toBeDefined();

      // #then - should contain valid JSON with expected structure
      const content = fs.readFileSync(cachePath!, "utf8");
      const data = JSON.parse(content);

      // Should have discovery watermarks key
      expect(data).toHaveProperty(WATERMARKS_KEY);
      // Should have at least one tx: checkpoint
      const txKeys = Object.keys(data).filter((k) => k.startsWith("tx:"));
      expect(txKeys.length).toBeGreaterThan(0);
    });
  });
});
