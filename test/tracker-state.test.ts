/**
 * Tests for Tracker State and Cache Management
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { txHashCacheKey, FileCache } from "../src/tracker/state";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Cache Key Generation", () => {
  describe("txHashCacheKey", () => {
    it("should generate key from tx hash", () => {
      // #given - a valid 64-character transaction hash
      const key = txHashCacheKey("0x" + "a".repeat(64));

      // #when - key is generated (inline above)

      // #then - key should be prefixed with "tx:"
      expect(key).toBe("tx:0x" + "a".repeat(64));
    });

    it("should normalize to lowercase", () => {
      // #given - a transaction hash with uppercase characters
      const txHash = "0xABC123";

      // #when - key is generated
      const key = txHashCacheKey(txHash);

      // #then - key should be lowercase
      expect(key).toBe("tx:0xabc123");
    });

    it("should handle short tx hash", () => {
      // #given - a short transaction hash
      const txHash = "0xabc";

      // #when - key is generated
      const key = txHashCacheKey(txHash);

      // #then - key should still be valid with prefix
      expect(key).toBe("tx:0xabc");
    });
  });
});

describe("FileCache", () => {
  let tempFile: string;
  let cache: FileCache;

  beforeEach(() => {
    // Create a temp file (not directory)
    tempFile = path.join(os.tmpdir(), `cache-test-${Date.now()}.json`);
    cache = new FileCache(tempFile);
  });

  afterEach(() => {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  });

  describe("get and set", () => {
    it("should store and retrieve data", async () => {
      // #given - data to store in cache
      const data = { proposalId: "123", status: "COMPLETED" };

      // #when - data is stored and then retrieved
      await cache.set("test-key", data);
      const result = await cache.get("test-key");

      // #then - retrieved data should match stored data
      expect(result).toEqual(data);
    });

    it("should return null for non-existent key", async () => {
      // #given - an empty cache (no setup needed)

      // #when - attempting to get a non-existent key
      const result = await cache.get("non-existent");

      // #then - should return null
      expect(result).toBeNull();
    });

    it("should overwrite existing key", async () => {
      // #given - a key with an initial value
      await cache.set("test-key", { value: 1 });

      // #when - the same key is set with a new value
      await cache.set("test-key", { value: 2 });
      const result = await cache.get("test-key");

      // #then - the new value should replace the old one
      expect(result).toEqual({ value: 2 });
    });

    it("should handle complex objects", async () => {
      // #given - a deeply nested complex object
      const complexData = {
        stages: [
          { type: "PROPOSAL_CREATED", status: "COMPLETED" },
          { type: "VOTING_ACTIVE", status: "PENDING" },
        ],
        metadata: {
          createdAt: Date.now(),
          version: 1,
        },
        nested: {
          deep: {
            value: "test",
          },
        },
      };

      // #when - complex object is stored and retrieved
      await cache.set("complex", complexData);
      const result = await cache.get("complex");

      // #then - complex object should be preserved exactly
      expect(result).toEqual(complexData);
    });
  });

  describe("delete", () => {
    it("should delete existing key", async () => {
      // #given - a key exists in the cache
      await cache.set("to-delete", { data: true });

      // #when - the key is deleted
      await cache.delete("to-delete");
      const result = await cache.get("to-delete");

      // #then - the key should no longer exist
      expect(result).toBeNull();
    });

    it("should not throw for non-existent key", async () => {
      // #given - an empty cache (no setup needed)

      // #when - attempting to delete a non-existent key

      // #then - should complete without throwing
      await expect(cache.delete("non-existent")).resolves.not.toThrow();
    });
  });

  describe("keys", () => {
    it("should list all keys", async () => {
      // #given - multiple keys are stored in the cache
      await cache.set("key1", { a: 1 });
      await cache.set("key2", { b: 2 });
      await cache.set("key3", { c: 3 });

      // #when - retrieving all keys
      const keys = Array.from(cache.keys());

      // #then - all stored keys should be present
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
      expect(keys.length).toBe(3);
    });

    it("should return empty iterator for empty cache", () => {
      // #given - an empty cache (no setup needed)

      // #when - retrieving all keys
      const keys = Array.from(cache.keys());

      // #then - should return an empty array
      expect(keys).toEqual([]);
    });

    it("should not include deleted keys", async () => {
      // #given - two keys exist, then one is deleted
      await cache.set("keep", { a: 1 });
      await cache.set("remove", { b: 2 });
      await cache.delete("remove");

      // #when - retrieving all keys
      const keys = Array.from(cache.keys());

      // #then - only the non-deleted key should be present
      expect(keys).toContain("keep");
      expect(keys).not.toContain("remove");
    });
  });

  describe("has", () => {
    it("should return true for existing key", async () => {
      // #given - a key exists in the cache
      await cache.set("exists", { data: true });

      // #when - checking if the key exists

      // #then - should return true
      expect(await cache.has("exists")).toBe(true);
    });

    it("should return false for non-existent key", async () => {
      // #given - an empty cache (no setup needed)

      // #when - checking if a non-existent key exists

      // #then - should return false
      expect(await cache.has("does-not-exist")).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all data", async () => {
      // #given - multiple keys exist in the cache
      await cache.set("key1", { a: 1 });
      await cache.set("key2", { b: 2 });

      // #when - clearing the cache
      await cache.clear();

      // #then - no keys should remain
      const keys = Array.from(cache.keys());
      expect(keys).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("should persist data to file", async () => {
      // #given - data is stored in the cache
      await cache.set("persistent", { value: 42 });

      // #when - a new cache instance is created pointing to the same file
      const cache2 = new FileCache(tempFile);
      const result = await cache2.get("persistent");

      // #then - the new instance should have access to the persisted data
      expect(result).toEqual({ value: 42 });
    });

    it("should load existing data on construction", async () => {
      // #given - a file with existing cache data
      fs.writeFileSync(tempFile, JSON.stringify({ existing: { data: "test" } }));

      // #when - a new cache instance is created from the file
      const newCache = new FileCache(tempFile);
      const result = await newCache.get("existing");

      // #then - the existing data should be available
      expect(result).toEqual({ data: "test" });
    });
  });

  describe("key normalization", () => {
    it("should handle special characters in keys", async () => {
      // #given - a key with special characters (hyphens, hex, numbers)
      const key = "gov-0xaBc123-proposal-456";

      // #when - storing and retrieving data with the special key
      await cache.set(key, { data: true });
      const result = await cache.get(key);

      // #then - the data should be stored and retrieved correctly
      expect(result).toEqual({ data: true });
    });

    it("should handle long keys", async () => {
      // #given - a very long key (200+ characters)
      const longKey = "prefix-" + "a".repeat(200) + "-suffix";

      // #when - storing and retrieving data with the long key
      await cache.set(longKey, { long: true });
      const result = await cache.get(longKey);

      // #then - the data should be stored and retrieved correctly
      expect(result).toEqual({ long: true });
    });
  });
});
