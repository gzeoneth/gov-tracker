/**
 * Cache State Module Tests
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
  txHashCacheKey,
  readCacheStatus,
} from "../src/tracker/state";
import { WATERMARKS_KEY } from "../src/tracker/discovery";
import type { TrackingCheckpoint, DiscoveryWatermarks } from "../src/types";

describe("Cache State Module", () => {
  describe("MemoryCache", () => {
    let cache: MemoryCache;

    beforeEach(() => {
      cache = new MemoryCache();
    });

    it("should get null for non-existent key", async () => {
      const result = await cache.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should set and get a value", async () => {
      await cache.set("key1", { foo: "bar" });
      const result = await cache.get("key1");
      expect(result).toEqual({ foo: "bar" });
    });

    it("should overwrite existing value", async () => {
      await cache.set("key1", "first");
      await cache.set("key1", "second");
      const result = await cache.get("key1");
      expect(result).toBe("second");
    });

    it("should delete a key", async () => {
      await cache.set("key1", "value");
      await cache.delete("key1");
      const result = await cache.get("key1");
      expect(result).toBeNull();
    });

    it("should clear all keys", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.clear();
      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
    });

    it("should check if key exists with has", async () => {
      await cache.set("key1", "value");
      expect(await cache.has("key1")).toBe(true);
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should iterate over keys", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      const keys = Array.from(cache.keys());
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
    });

    it("should handle complex objects", async () => {
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

      await cache.set("tx:0x123", checkpoint);
      const result = await cache.get<TrackingCheckpoint>("tx:0x123");
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
      const result = await cache.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should set and get a value", async () => {
      await cache.set("key1", { foo: "bar" });
      const result = await cache.get("key1");
      expect(result).toEqual({ foo: "bar" });
    });

    it("should persist to file", async () => {
      await cache.set("key1", "value1");

      // Read the file directly
      const content = fs.readFileSync(tempFile, "utf8");
      const data = JSON.parse(content);
      expect(data.key1).toBe("value1");
    });

    it("should load from existing file", async () => {
      // Write directly to file
      fs.writeFileSync(tempFile, JSON.stringify({ existing: "data" }));

      // Create new cache instance pointing to same file
      const newCache = new FileCache(tempFile);
      const result = await newCache.get("existing");
      expect(result).toBe("data");
    });

    it("should handle non-existent file gracefully", () => {
      const nonExistentPath = path.join("/tmp", "non-existent-" + Date.now() + ".json");
      const newCache = new FileCache(nonExistentPath);

      // Should not throw, should return empty cache
      expect(newCache.keys()).toBeDefined();

      // Cleanup
      try {
        fs.unlinkSync(nonExistentPath);
      } catch {
        // Expected - file may not exist
      }
    });

    it("should delete a key", async () => {
      await cache.set("key1", "value");
      await cache.delete("key1");
      const result = await cache.get("key1");
      expect(result).toBeNull();
    });

    it("should clear all keys", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.clear();
      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
    });

    it("should check if key exists with has", async () => {
      await cache.set("key1", "value");
      expect(await cache.has("key1")).toBe(true);
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should handle concurrent writes", async () => {
      // Issue multiple writes in parallel
      const writes = [
        cache.set("key1", "value1"),
        cache.set("key2", "value2"),
        cache.set("key3", "value3"),
      ];

      await Promise.all(writes);

      // All writes should succeed
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
      const result = await cache.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should set and get a value", async () => {
      await cache.set("key1", { foo: "bar" });
      const result = await cache.get("key1");
      expect(result).toEqual({ foo: "bar" });
    });

    it("should use prefix for storage key", async () => {
      await cache.set("key1", "value1");
      expect(mockStorage.has("test:key1")).toBe(true);
    });

    it("should delete a key", async () => {
      await cache.set("key1", "value");
      await cache.delete("key1");
      const result = await cache.get("key1");
      expect(result).toBeNull();
    });

    it("should clear only prefixed keys", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      mockStorage.set("other:key", "other value"); // Different prefix

      await cache.clear();

      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
      expect(mockStorage.has("other:key")).toBe(true);
    });

    it("should check if key exists with has", async () => {
      await cache.set("key1", "value");
      expect(await cache.has("key1")).toBe(true);
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should list keys with prefix filter", async () => {
      await cache.set("tx:0x123", "value1");
      await cache.set("tx:0x456", "value2");
      await cache.set("discovery:watermarks", "watermarks");

      const txKeys = await cache.keys("tx:");
      expect(txKeys).toContain("tx:0x123");
      expect(txKeys).toContain("tx:0x456");
      expect(txKeys).not.toContain("discovery:watermarks");

      const allKeys = await cache.keys();
      expect(allKeys).toHaveLength(3);
    });

    it("should handle invalid JSON gracefully", async () => {
      mockStorage.set("test:invalid", "not valid json");
      const result = await cache.get("invalid");
      expect(result).toBeNull();
    });

    it("should return empty for missing localStorage", async () => {
      delete (globalThis as any).localStorage;

      const noStorageCache = new LocalStorageCache("test:");
      expect(await noStorageCache.get("key")).toBeNull();
      expect(await noStorageCache.has("key")).toBe(false);
      expect(await noStorageCache.keys()).toEqual([]);
    });
  });

  describe("txHashCacheKey", () => {
    it("should create lowercase cache key with tx: prefix", () => {
      const hash = "0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";
      const key = txHashCacheKey(hash);
      expect(key).toBe("tx:0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    });

    it("should handle already lowercase hash", () => {
      const hash = "0xabcdef";
      const key = txHashCacheKey(hash);
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
      fs.writeFileSync(tempFile, "{}");

      const { watermarks, checkpoints } = await readCacheStatus(tempFile);
      expect(watermarks).toEqual({});
      expect(checkpoints.size).toBe(0);
    });

    it("should load watermarks from discovery checkpoint", async () => {
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

      const { watermarks } = await readCacheStatus(tempFile);
      expect(watermarks).toEqual(discoveryWatermarks);
    });

    it("should load transaction checkpoints", async () => {
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

      const { checkpoints } = await readCacheStatus(tempFile);
      expect(checkpoints.size).toBe(2);
      expect(checkpoints.has("tx:0xabc")).toBe(true);
      expect(checkpoints.has("tx:0xdef")).toBe(true);
    });

    it("should handle non-existent file", async () => {
      const nonExistentPath = path.join("/tmp", "non-existent-" + Date.now() + ".json");

      const { watermarks, checkpoints } = await readCacheStatus(nonExistentPath);
      expect(watermarks).toEqual({});
      expect(checkpoints.size).toBe(0);
    });
  });
});
