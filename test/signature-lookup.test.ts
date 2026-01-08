/**
 * Tests for Function Signature Lookup
 *
 * Tests for the local signature registry and lookup functions.
 * No external API calls required for these tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lookupLocalSignature, lookupSignature } from "../src/calldata/signature-lookup";
import { TIMELOCK_SELECTORS } from "../src/constants";

describe("Signature Lookup", () => {
  describe("lookupLocalSignature", () => {
    it("should find schedule selector", () => {
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.schedule);
      expect(result).toBe("schedule(address,uint256,bytes,bytes32,bytes32,uint256)");
    });

    it("should find scheduleBatch selector", () => {
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.scheduleBatch);
      expect(result).toBe("scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)");
    });

    it("should find execute selector", () => {
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.execute);
      expect(result).toBe("execute(address,uint256,bytes,bytes32,bytes32)");
    });

    it("should find executeBatch selector", () => {
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.executeBatch);
      expect(result).toBe("executeBatch(address[],uint256[],bytes[],bytes32,bytes32)");
    });

    it("should find sendTxToL1 selector", () => {
      const result = lookupLocalSignature("0x928c169a");
      expect(result).toBe("sendTxToL1(address,bytes)");
    });

    it("should find transfer selector", () => {
      const result = lookupLocalSignature("0xa9059cbb");
      expect(result).toBe("transfer(address,uint256)");
    });

    it("should find approve selector", () => {
      const result = lookupLocalSignature("0x095ea7b3");
      expect(result).toBe("approve(address,uint256)");
    });

    it("should find upgradeTo selector", () => {
      const result = lookupLocalSignature("0x3659cfe6");
      expect(result).toBe("upgradeTo(address)");
    });

    it("should find transferOwnership selector", () => {
      const result = lookupLocalSignature("0xf2fde38b");
      expect(result).toBe("transferOwnership(address)");
    });

    it("should find propose selector", () => {
      const result = lookupLocalSignature("0x7d5e81e2");
      expect(result).toBe("propose(address[],uint256[],bytes[],string)");
    });

    it("should find castVote selector", () => {
      const result = lookupLocalSignature("0x56781388");
      expect(result).toBe("castVote(uint256,uint8)");
    });

    it("should return null for unknown selector", () => {
      const result = lookupLocalSignature("0xdeadbeef");
      expect(result).toBeNull();
    });

    it("should be case-insensitive", () => {
      const upper = lookupLocalSignature("0xA9059CBB");
      const lower = lookupLocalSignature("0xa9059cbb");
      const mixed = lookupLocalSignature("0xa9059cBB");

      expect(upper).toBe("transfer(address,uint256)");
      expect(lower).toBe("transfer(address,uint256)");
      expect(mixed).toBe("transfer(address,uint256)");
    });

    it("should find UpgradeExecutor execute selector", () => {
      const result = lookupLocalSignature("0x1cff79cd");
      expect(result).toBe("execute(address,bytes)");
    });

    it("should find executeCall selector", () => {
      const result = lookupLocalSignature("0x61461954");
      expect(result).toBe("executeCall(address,bytes)");
    });

    it("should find Security Council replaceCohort selector", () => {
      const result = lookupLocalSignature("0xbf396750");
      expect(result).toBe("replaceCohort(address[],address[])");
    });
  });

  describe("lookupSignature", () => {
    it("should return local source for known selector", async () => {
      const result = await lookupSignature("0xa9059cbb");

      expect(result.signature).toBe("transfer(address,uint256)");
      expect(result.source).toBe("local");
    });

    it("should return local source for timelock selector", async () => {
      const result = await lookupSignature(TIMELOCK_SELECTORS.scheduleBatch);

      expect(result.signature).toBe(
        "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)"
      );
      expect(result.source).toBe("local");
    });

    it("should be case-insensitive for local lookup", async () => {
      const result = await lookupSignature("0xA9059CBB");

      expect(result.signature).toBe("transfer(address,uint256)");
      expect(result.source).toBe("local");
    });
  });

  describe("4byte.directory API", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      // Mock fetch for API tests
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      // Restore original fetch
      global.fetch = originalFetch;
      vi.unstubAllGlobals();
    });

    it("should return failed for API error response", async () => {
      // Mock fetch to return non-OK response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      // Use an unknown selector to bypass local registry
      const result = await lookupSignature("0x12345678");

      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return failed for fetch exception", async () => {
      // Mock fetch to throw error
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      const result = await lookupSignature("0x87654321");

      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return failed for timeout", async () => {
      // Mock fetch to throw abort error (simulating timeout)
      const abortError = new Error("AbortError");
      abortError.name = "AbortError";
      vi.mocked(global.fetch).mockRejectedValueOnce(abortError);

      const result = await lookupSignature("0xabcdef01");

      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return failed for empty results", async () => {
      // Mock fetch to return empty results
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);

      const result = await lookupSignature("0x11223344");

      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return api source for successful API lookup", async () => {
      // Mock fetch to return a valid signature
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ text_signature: "customFunction(address,uint256)" }],
        }),
      } as Response);

      const result = await lookupSignature("0x55667788");

      expect(result.signature).toBe("customFunction(address,uint256)");
      expect(result.source).toBe("api");
    });

    it("should cache API results", async () => {
      // First call - mock successful response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ text_signature: "cachedFunction(bytes)" }],
        }),
      } as Response);

      // First lookup
      const result1 = await lookupSignature("0xaabbccdd");
      expect(result1.signature).toBe("cachedFunction(bytes)");
      expect(result1.source).toBe("api");

      // Second lookup - should use cache, not call fetch again
      const result2 = await lookupSignature("0xaabbccdd");
      expect(result2.signature).toBe("cachedFunction(bytes)");
      expect(result2.source).toBe("api");

      // fetch should only be called once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
