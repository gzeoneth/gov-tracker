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
      const key = txHashCacheKey("0x" + "a".repeat(64));

      expect(key).toBe("tx:0x" + "a".repeat(64));
    });

    it("should normalize to lowercase", () => {
      const key = txHashCacheKey("0xABC123");

      expect(key).toBe("tx:0xabc123");
    });

    it("should handle short tx hash", () => {
      const key = txHashCacheKey("0xabc");

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
      const data = { proposalId: "123", status: "COMPLETED" };

      await cache.set("test-key", data);
      const result = await cache.get("test-key");

      expect(result).toEqual(data);
    });

    it("should return null for non-existent key", async () => {
      const result = await cache.get("non-existent");

      expect(result).toBeNull();
    });

    it("should overwrite existing key", async () => {
      await cache.set("test-key", { value: 1 });
      await cache.set("test-key", { value: 2 });

      const result = await cache.get("test-key");

      expect(result).toEqual({ value: 2 });
    });

    it("should handle complex objects", async () => {
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

      await cache.set("complex", complexData);
      const result = await cache.get("complex");

      expect(result).toEqual(complexData);
    });
  });

  describe("delete", () => {
    it("should delete existing key", async () => {
      await cache.set("to-delete", { data: true });
      await cache.delete("to-delete");

      const result = await cache.get("to-delete");

      expect(result).toBeNull();
    });

    it("should not throw for non-existent key", async () => {
      await expect(cache.delete("non-existent")).resolves.not.toThrow();
    });
  });

  describe("keys", () => {
    it("should list all keys", async () => {
      await cache.set("key1", { a: 1 });
      await cache.set("key2", { b: 2 });
      await cache.set("key3", { c: 3 });

      const keys = Array.from(cache.keys());

      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
      expect(keys.length).toBe(3);
    });

    it("should return empty iterator for empty cache", () => {
      const keys = Array.from(cache.keys());

      expect(keys).toEqual([]);
    });

    it("should not include deleted keys", async () => {
      await cache.set("keep", { a: 1 });
      await cache.set("remove", { b: 2 });
      await cache.delete("remove");

      const keys = Array.from(cache.keys());

      expect(keys).toContain("keep");
      expect(keys).not.toContain("remove");
    });
  });

  describe("has", () => {
    it("should return true for existing key", async () => {
      await cache.set("exists", { data: true });

      expect(await cache.has("exists")).toBe(true);
    });

    it("should return false for non-existent key", async () => {
      expect(await cache.has("does-not-exist")).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all data", async () => {
      await cache.set("key1", { a: 1 });
      await cache.set("key2", { b: 2 });

      await cache.clear();

      const keys = Array.from(cache.keys());
      expect(keys).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("should persist data to file", async () => {
      await cache.set("persistent", { value: 42 });

      // Create new cache instance pointing to same file
      const cache2 = new FileCache(tempFile);
      const result = await cache2.get("persistent");

      expect(result).toEqual({ value: 42 });
    });

    it("should load existing data on construction", async () => {
      // Write data directly to file
      fs.writeFileSync(tempFile, JSON.stringify({ existing: { data: "test" } }));

      const newCache = new FileCache(tempFile);
      const result = await newCache.get("existing");

      expect(result).toEqual({ data: "test" });
    });
  });

  describe("key normalization", () => {
    it("should handle special characters in keys", async () => {
      const key = "gov-0xaBc123-proposal-456";
      await cache.set(key, { data: true });

      const result = await cache.get(key);
      expect(result).toEqual({ data: true });
    });

    it("should handle long keys", async () => {
      const longKey = "prefix-" + "a".repeat(200) + "-suffix";
      await cache.set(longKey, { long: true });

      const result = await cache.get(longKey);
      expect(result).toEqual({ long: true });
    });
  });
});
