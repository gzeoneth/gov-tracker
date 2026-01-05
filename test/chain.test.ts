/**
 * Tests for Chain Utilities
 */

import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";
import { getChainType, addressEquals, isAddressIn } from "../src/utils/chain";
import { CHAIN_IDS } from "../src/constants";

describe("Chain Utilities", () => {
  describe("addressEquals", () => {
    it("should return true for identical addresses", () => {
      const addr = "0x1234567890123456789012345678901234567890";
      expect(addressEquals(addr, addr)).toBe(true);
    });

    it("should be case-insensitive", () => {
      const lower = "0xabcdef0123456789abcdef0123456789abcdef01";
      const upper = "0xABCDEF0123456789ABCDEF0123456789ABCDEF01";
      const mixed = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

      expect(addressEquals(lower, upper)).toBe(true);
      expect(addressEquals(lower, mixed)).toBe(true);
      expect(addressEquals(upper, mixed)).toBe(true);
    });

    it("should return false for different addresses", () => {
      const addr1 = "0x1111111111111111111111111111111111111111";
      const addr2 = "0x2222222222222222222222222222222222222222";

      expect(addressEquals(addr1, addr2)).toBe(false);
    });

    it("should handle empty strings", () => {
      expect(addressEquals("", "")).toBe(true);
      expect(addressEquals("0x123", "")).toBe(false);
    });
  });

  describe("isAddressIn", () => {
    const addresses = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ];

    it("should return true when address is in array", () => {
      expect(isAddressIn("0x1111111111111111111111111111111111111111", addresses)).toBe(true);
      expect(isAddressIn("0x2222222222222222222222222222222222222222", addresses)).toBe(true);
    });

    it("should return false when address is not in array", () => {
      expect(isAddressIn("0x4444444444444444444444444444444444444444", addresses)).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(
        isAddressIn("0x1111111111111111111111111111111111111111".toUpperCase(), addresses)
      ).toBe(true);
      expect(
        isAddressIn("0x1111111111111111111111111111111111111111".toLowerCase(), addresses)
      ).toBe(true);
    });

    it("should return false for empty array", () => {
      expect(isAddressIn("0x1111111111111111111111111111111111111111", [])).toBe(false);
    });
  });

  describe("getChainType", () => {
    function createMockProvider(chainId: number): ethers.providers.Provider {
      return {
        getNetwork: vi.fn().mockResolvedValue({ chainId }),
      } as unknown as ethers.providers.Provider;
    }

    it("should return L1 for Ethereum mainnet", async () => {
      const provider = createMockProvider(1);
      const result = await getChainType(provider);
      expect(result).toBe("L1");
    });

    it("should return L2 for Arbitrum One", async () => {
      const provider = createMockProvider(CHAIN_IDS.ARB_ONE);
      const result = await getChainType(provider);
      expect(result).toBe("L2");
    });

    it("should return NOVA for Arbitrum Nova", async () => {
      const provider = createMockProvider(CHAIN_IDS.NOVA);
      const result = await getChainType(provider);
      expect(result).toBe("NOVA");
    });

    it("should return L1 for unknown chains", async () => {
      const provider = createMockProvider(999);
      const result = await getChainType(provider);
      expect(result).toBe("L1");
    });
  });
});

describe("Chain Constants", () => {
  it("should have correct Ethereum chain ID", () => {
    expect(CHAIN_IDS.ETHEREUM).toBe(1);
  });

  it("should have correct Arbitrum One chain ID", () => {
    expect(CHAIN_IDS.ARB_ONE).toBe(42161);
  });

  it("should have correct Nova chain ID", () => {
    expect(CHAIN_IDS.NOVA).toBe(42170);
  });
});
