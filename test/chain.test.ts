/**
 * Tests for Chain Utilities
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { ethers } from "ethers";
import { getChain, getChainId, addressEquals, isAddressIn } from "../src/utils/chain";
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

  describe("getChain", () => {
    function createMockProvider(chainId: number): ethers.providers.Provider {
      return {
        getNetwork: vi.fn().mockResolvedValue({ chainId }),
      } as unknown as ethers.providers.Provider;
    }

    it("should return L1 for Ethereum mainnet", async () => {
      const provider = createMockProvider(1);
      const result = await getChain(provider);
      expect(result).toBe("ethereum");
    });

    it("should return L2 for Arbitrum One", async () => {
      const provider = createMockProvider(CHAIN_IDS.ARB_ONE);
      const result = await getChain(provider);
      expect(result).toBe("arb1");
    });

    it("should return NOVA for Arbitrum Nova", async () => {
      const provider = createMockProvider(CHAIN_IDS.NOVA);
      const result = await getChain(provider);
      expect(result).toBe("nova");
    });

    it("should return unknown for unknown chains", async () => {
      const provider = createMockProvider(999);
      const result = await getChain(provider);
      expect(result).toBe("unknown");
    });
  });

  describe("getChainId", () => {
    function createMockProvider(chainId: number): ethers.providers.Provider {
      return {
        getNetwork: vi.fn().mockResolvedValue({ chainId }),
      } as unknown as ethers.providers.Provider;
    }

    it("should return chain ID for Ethereum mainnet", async () => {
      const provider = createMockProvider(1);
      const result = await getChainId(provider);
      expect(result).toBe(1);
    });

    it("should return chain ID for Arbitrum One", async () => {
      const provider = createMockProvider(CHAIN_IDS.ARB_ONE);
      const result = await getChainId(provider);
      expect(result).toBe(CHAIN_IDS.ARB_ONE);
    });

    it("should return chain ID for Arbitrum Nova", async () => {
      const provider = createMockProvider(CHAIN_IDS.NOVA);
      const result = await getChainId(provider);
      expect(result).toBe(CHAIN_IDS.NOVA);
    });

    it("should return chain ID for unknown chains", async () => {
      const provider = createMockProvider(999);
      const result = await getChainId(provider);
      expect(result).toBe(999);
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

describe("buildDefaultTargets", () => {
  // Import buildDefaultTargets dynamically to avoid circular imports
  let buildDefaultTargets: typeof import("../src/constants").buildDefaultTargets;

  beforeAll(async () => {
    const constants = await import("../src/constants");
    buildDefaultTargets = constants.buildDefaultTargets;
  });

  it("should include all targets by default", () => {
    const targets = buildDefaultTargets();

    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(true);
    expect(targets.electionMemberGovernor).toBe(true);
    expect(targets.l2ConstitutionalTimelock).toBe(true);
    expect(targets.l2NonConstitutionalTimelock).toBe(true);
  });

  it("should exclude elections when includeElections is false", () => {
    const targets = buildDefaultTargets({ includeElections: false });

    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(false);
    expect(targets.electionMemberGovernor).toBe(false);
    expect(targets.l2ConstitutionalTimelock).toBe(true);
    expect(targets.l2NonConstitutionalTimelock).toBe(true);
  });

  it("should include only governors when governorsOnly is true", () => {
    const targets = buildDefaultTargets({ governorsOnly: true });

    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(true);
    expect(targets.electionMemberGovernor).toBe(true);
    expect(targets.l2ConstitutionalTimelock).toBe(false);
    expect(targets.l2NonConstitutionalTimelock).toBe(false);
  });

  it("should include only timelocks when timelocksOnly is true", () => {
    const targets = buildDefaultTargets({ timelocksOnly: true });

    expect(targets.constitutionalGovernor).toBe(false);
    expect(targets.nonConstitutionalGovernor).toBe(false);
    expect(targets.electionNomineeGovernor).toBe(false);
    expect(targets.electionMemberGovernor).toBe(false);
    expect(targets.l2ConstitutionalTimelock).toBe(true);
    expect(targets.l2NonConstitutionalTimelock).toBe(true);
  });

  it("should combine governorsOnly and includeElections options", () => {
    const targets = buildDefaultTargets({ governorsOnly: true, includeElections: false });

    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(false);
    expect(targets.electionMemberGovernor).toBe(false);
    expect(targets.l2ConstitutionalTimelock).toBe(false);
    expect(targets.l2NonConstitutionalTimelock).toBe(false);
  });
});
