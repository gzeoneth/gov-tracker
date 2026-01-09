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
      // #given - the schedule function selector from timelock constants

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.schedule);

      // #then - returns the full function signature
      expect(result).toBe("schedule(address,uint256,bytes,bytes32,bytes32,uint256)");
    });

    it("should find scheduleBatch selector", () => {
      // #given - the scheduleBatch function selector from timelock constants

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.scheduleBatch);

      // #then - returns the full function signature with array types
      expect(result).toBe("scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)");
    });

    it("should find execute selector", () => {
      // #given - the execute function selector from timelock constants

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.execute);

      // #then - returns the full function signature
      expect(result).toBe("execute(address,uint256,bytes,bytes32,bytes32)");
    });

    it("should find executeBatch selector", () => {
      // #given - the executeBatch function selector from timelock constants

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature(TIMELOCK_SELECTORS.executeBatch);

      // #then - returns the full function signature with array types
      expect(result).toBe("executeBatch(address[],uint256[],bytes[],bytes32,bytes32)");
    });

    it("should find sendTxToL1 selector", () => {
      // #given - the ArbSys sendTxToL1 function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0x928c169a");

      // #then - returns the full function signature
      expect(result).toBe("sendTxToL1(address,bytes)");
    });

    it("should find transfer selector", () => {
      // #given - the ERC20 transfer function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0xa9059cbb");

      // #then - returns the full function signature
      expect(result).toBe("transfer(address,uint256)");
    });

    it("should find approve selector", () => {
      // #given - the ERC20 approve function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0x095ea7b3");

      // #then - returns the full function signature
      expect(result).toBe("approve(address,uint256)");
    });

    it("should find upgradeTo selector", () => {
      // #given - the UUPS proxy upgradeTo function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0x3659cfe6");

      // #then - returns the full function signature
      expect(result).toBe("upgradeTo(address)");
    });

    it("should find transferOwnership selector", () => {
      // #given - the Ownable transferOwnership function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0xf2fde38b");

      // #then - returns the full function signature
      expect(result).toBe("transferOwnership(address)");
    });

    it("should find propose selector", () => {
      // #given - the Governor propose function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0x7d5e81e2");

      // #then - returns the full function signature
      expect(result).toBe("propose(address[],uint256[],bytes[],string)");
    });

    it("should find castVote selector", () => {
      // #given - the Governor castVote function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0x56781388");

      // #then - returns the full function signature
      expect(result).toBe("castVote(uint256,uint8)");
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

    it("should find UpgradeExecutor execute selector", () => {
      // #given - the UpgradeExecutor execute function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0x1cff79cd");

      // #then - returns the full function signature
      expect(result).toBe("execute(address,bytes)");
    });

    it("should find executeCall selector", () => {
      // #given - the executeCall function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0x61461954");

      // #then - returns the full function signature
      expect(result).toBe("executeCall(address,bytes)");
    });

    it("should find Security Council replaceCohort selector", () => {
      // #given - the SecurityCouncilManager replaceCohort function selector

      // #when - looking up the selector in the local registry
      const result = lookupLocalSignature("0xbf396750");

      // #then - returns the full function signature
      expect(result).toBe("replaceCohort(address[],address[])");
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
});
