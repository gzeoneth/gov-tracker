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
    // Known selector/signature pairs in local registry
    const knownSelectors = [
      {
        name: "schedule",
        selector: TIMELOCK_SELECTORS.schedule,
        signature: "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
      },
      {
        name: "scheduleBatch",
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
      },
      {
        name: "execute",
        selector: TIMELOCK_SELECTORS.execute,
        signature: "execute(address,uint256,bytes,bytes32,bytes32)",
      },
      {
        name: "executeBatch",
        selector: TIMELOCK_SELECTORS.executeBatch,
        signature: "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)",
      },
      { name: "sendTxToL1", selector: "0x928c169a", signature: "sendTxToL1(address,bytes)" },
      { name: "transfer", selector: "0xa9059cbb", signature: "transfer(address,uint256)" },
      { name: "approve", selector: "0x095ea7b3", signature: "approve(address,uint256)" },
      { name: "upgradeTo", selector: "0x3659cfe6", signature: "upgradeTo(address)" },
      {
        name: "transferOwnership",
        selector: "0xf2fde38b",
        signature: "transferOwnership(address)",
      },
      {
        name: "propose",
        selector: "0x7d5e81e2",
        signature: "propose(address[],uint256[],bytes[],string)",
      },
      { name: "castVote", selector: "0x56781388", signature: "castVote(uint256,uint8)" },
      {
        name: "UpgradeExecutor execute",
        selector: "0x1cff79cd",
        signature: "execute(address,bytes)",
      },
      { name: "executeCall", selector: "0x61461954", signature: "executeCall(address,bytes)" },
      {
        name: "replaceCohort",
        selector: "0xbf396750",
        signature: "replaceCohort(address[],address[])",
      },
    ];

    it.each(knownSelectors)("should find $name selector", ({ selector, signature }) => {
      // #given - a known function selector
      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature(selector);

      // #then - returns the expected signature
      expect(result).toBe(signature);
    });

    it("should return null for unknown selector", () => {
      // #given - an unknown function selector not in the registry

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0xdeadbeef");

      // #then - returns null indicating no match found
      expect(result).toBeNull();
    });

    it("should be case-insensitive", () => {
      // #given - the same selector in different case formats
      const upperSelector = "0xA9059CBB";
      const lowerSelector = "0xa9059cbb";
      const mixedSelector = "0xa9059cBB";

      // #when - looking up each selector variant
      const upper = lookupLocalSignature(upperSelector);
      const lower = lookupLocalSignature(lowerSelector);
      const mixed = lookupLocalSignature(mixedSelector);

      // #then - all variants return the same signature
      expect(upper).toBe("transfer(address,uint256)");
      expect(lower).toBe("transfer(address,uint256)");
      expect(mixed).toBe("transfer(address,uint256)");
    });
  });

  describe("lookupSignature", () => {
    it("should return local source for known selector", async () => {
      // #given - the ERC20 transfer function selector known to local registry

      // #when - looking up the signature
      const result = await lookupSignature("0xa9059cbb");

      // #then - returns signature from local registry without API call
      expect(result.signature).toBe("transfer(address,uint256)");
      expect(result.source).toBe("local");
    });

    it("should return local source for timelock selector", async () => {
      // #given - the timelock scheduleBatch function selector

      // #when - looking up the signature
      const result = await lookupSignature(TIMELOCK_SELECTORS.scheduleBatch);

      // #then - returns signature from local registry
      expect(result.signature).toBe(
        "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)"
      );
      expect(result.source).toBe("local");
    });

    it("should be case-insensitive for local lookup", async () => {
      // #given - an uppercase version of the transfer selector

      // #when - looking up the signature
      const result = await lookupSignature("0xA9059CBB");

      // #then - returns signature regardless of case
      expect(result.signature).toBe("transfer(address,uint256)");
      expect(result.source).toBe("local");
    });
  });

  describe("4byte.directory API", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.unstubAllGlobals();
    });

    it("should return failed for API error response", async () => {
      // #given - fetch returns a non-OK HTTP response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);
      const unknownSelector = "0x12345678";

      // #when - looking up an unknown selector that falls through to API
      const result = await lookupSignature(unknownSelector);

      // #then - returns failed source with null signature
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return failed for fetch exception", async () => {
      // #given - fetch throws a network error
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      // #when - looking up an unknown selector
      const result = await lookupSignature("0x87654321");

      // #then - returns failed source with null signature
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return failed for timeout", async () => {
      // #given - fetch throws an abort error simulating timeout
      const abortError = new Error("AbortError");
      abortError.name = "AbortError";
      vi.mocked(global.fetch).mockRejectedValueOnce(abortError);

      // #when - looking up an unknown selector
      const result = await lookupSignature("0xabcdef01");

      // #then - returns failed source with null signature
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return failed for empty results", async () => {
      // #given - API returns empty results array
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);

      // #when - looking up an unknown selector
      const result = await lookupSignature("0x11223344");

      // #then - returns failed source with null signature
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
    });

    it("should return api source for successful API lookup", async () => {
      // #given - API returns a valid signature match
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ text_signature: "customFunction(address,uint256)" }],
        }),
      } as Response);

      // #when - looking up an unknown selector
      const result = await lookupSignature("0x55667788");

      // #then - returns the signature from API
      expect(result.signature).toBe("customFunction(address,uint256)");
      expect(result.source).toBe("api");
    });

    it("should cache API results", async () => {
      // #given - API returns a successful response for the first call
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ text_signature: "cachedFunction(bytes)" }],
        }),
      } as Response);
      const selector = "0xaabbccdd";

      // #when - looking up the same selector twice
      const result1 = await lookupSignature(selector);
      const result2 = await lookupSignature(selector);

      // #then - both return the same cached result and fetch is called only once
      expect(result1.signature).toBe("cachedFunction(bytes)");
      expect(result1.source).toBe("api");
      expect(result2.signature).toBe("cachedFunction(bytes)");
      expect(result2.source).toBe("api");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("DISABLE_4BYTE_LOOKUP env var", () => {
    const originalFetch = global.fetch;
    const originalEnv = process.env.DISABLE_4BYTE_LOOKUP;

    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.unstubAllGlobals();
      if (originalEnv === undefined) {
        delete process.env.DISABLE_4BYTE_LOOKUP;
      } else {
        process.env.DISABLE_4BYTE_LOOKUP = originalEnv;
      }
    });

    it("should skip API lookup when DISABLE_4BYTE_LOOKUP=1", async () => {
      // #given - env var is set to disable lookups
      process.env.DISABLE_4BYTE_LOOKUP = "1";
      const unknownSelector = "0xfedcba98";

      // #when - looking up an unknown selector
      const result = await lookupSignature(unknownSelector);

      // #then - returns failed without calling fetch
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should call API when DISABLE_4BYTE_LOOKUP is not set", async () => {
      // #given - env var is not set and API returns empty
      delete process.env.DISABLE_4BYTE_LOOKUP;
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);
      const unknownSelector = "0x98765432";

      // #when - looking up an unknown selector
      const result = await lookupSignature(unknownSelector);

      // #then - fetch is called (even though no result found)
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should call API when DISABLE_4BYTE_LOOKUP is set to non-1 value", async () => {
      // #given - env var is set but not to "1"
      process.env.DISABLE_4BYTE_LOOKUP = "false";
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);
      const unknownSelector = "0x11112222";

      // #when - looking up an unknown selector
      const result = await lookupSignature(unknownSelector);

      // #then - fetch is still called (only "1" disables)
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should still use local registry when DISABLE_4BYTE_LOOKUP=1", async () => {
      // #given - env var is set but selector is in local registry
      process.env.DISABLE_4BYTE_LOOKUP = "1";

      // #when - looking up a known local selector
      const result = await lookupSignature("0xa9059cbb");

      // #then - returns from local registry without calling fetch
      expect(result.signature).toBe("transfer(address,uint256)");
      expect(result.source).toBe("local");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should skip API lookup when disableApiLookup option is true", async () => {
      // #given - disableApiLookup option is passed
      delete process.env.DISABLE_4BYTE_LOOKUP;
      const unknownSelector = "0x33445566";

      // #when - looking up with option to disable API
      const result = await lookupSignature(unknownSelector, { disableApiLookup: true });

      // #then - returns failed without calling fetch
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should call API when disableApiLookup option is false", async () => {
      // #given - disableApiLookup option is explicitly false
      delete process.env.DISABLE_4BYTE_LOOKUP;
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);
      const unknownSelector = "0x77889900";

      // #when - looking up with option explicitly set to false
      const result = await lookupSignature(unknownSelector, { disableApiLookup: false });

      // #then - fetch is called
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should prioritize option over env var (option true overrides env)", async () => {
      // #given - env var not set but option is true
      delete process.env.DISABLE_4BYTE_LOOKUP;
      const unknownSelector = "0xaabbcc00";

      // #when - looking up with disableApiLookup: true
      const result = await lookupSignature(unknownSelector, { disableApiLookup: true });

      // #then - option takes precedence, no fetch called
      expect(result.signature).toBeNull();
      expect(result.source).toBe("failed");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
