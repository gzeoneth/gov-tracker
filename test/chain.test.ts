/**
 * Tests for Chain Utilities
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { ethers } from "ethers";
import { getChain, getChainId, addressEquals, isAddressIn } from "../src/utils/chain";
import { CHAIN_IDS } from "../src/constants";
import { isKnownChain, isL2Chain, getChainDisplayName, Chain } from "../src/types/core";

describe("Chain Utilities", () => {
  describe("addressEquals", () => {
    it("should return true for identical addresses", () => {
      // #given - an Ethereum address
      const addr = "0x1234567890123456789012345678901234567890";

      // #when - comparing the address to itself
      const result = addressEquals(addr, addr);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should be case-insensitive", () => {
      // #given - the same address in different case formats
      const lower = "0xabcdef0123456789abcdef0123456789abcdef01";
      const upper = "0xABCDEF0123456789ABCDEF0123456789ABCDEF01";
      const mixed = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

      // #when - comparing addresses with different cases
      // #then - all comparisons should return true
      expect(addressEquals(lower, upper)).toBe(true);
      expect(addressEquals(lower, mixed)).toBe(true);
      expect(addressEquals(upper, mixed)).toBe(true);
    });

    it("should return false for different addresses", () => {
      // #given - two different addresses
      const addr1 = "0x1111111111111111111111111111111111111111";
      const addr2 = "0x2222222222222222222222222222222222222222";

      // #when - comparing different addresses
      const result = addressEquals(addr1, addr2);

      // #then - should return false
      expect(result).toBe(false);
    });

    it("should handle empty strings", () => {
      // #given - empty strings and a non-empty address
      // #when - comparing empty strings to each other and to an address
      // #then - empty equals empty, but empty does not equal non-empty
      expect(addressEquals("", "")).toBe(true);
      expect(addressEquals("0x123", "")).toBe(false);
    });
  });

  describe("isAddressIn", () => {
    // #given - a list of addresses to search within
    const addresses = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ];

    it("should return true when address is in array", () => {
      // #given - addresses that exist in the array
      // #when - checking if they are in the array
      // #then - should return true for each
      expect(isAddressIn("0x1111111111111111111111111111111111111111", addresses)).toBe(true);
      expect(isAddressIn("0x2222222222222222222222222222222222222222", addresses)).toBe(true);
    });

    it("should return false when address is not in array", () => {
      // #given - an address not in the array
      const notInArray = "0x4444444444444444444444444444444444444444";

      // #when - checking if it is in the array
      const result = isAddressIn(notInArray, addresses);

      // #then - should return false
      expect(result).toBe(false);
    });

    it("should be case insensitive", () => {
      // #given - an address in uppercase and lowercase
      const addr = "0x1111111111111111111111111111111111111111";

      // #when - checking with different case variations
      // #then - should return true regardless of case
      expect(isAddressIn(addr.toUpperCase(), addresses)).toBe(true);
      expect(isAddressIn(addr.toLowerCase(), addresses)).toBe(true);
    });

    it("should return false for empty array", () => {
      // #given - an empty array
      const emptyArray: string[] = [];

      // #when - checking if any address is in the empty array
      const result = isAddressIn("0x1111111111111111111111111111111111111111", emptyArray);

      // #then - should return false
      expect(result).toBe(false);
    });
  });

  describe("getChain", () => {
    function createMockProvider(chainId: number): ethers.providers.Provider {
      return {
        getNetwork: vi.fn().mockResolvedValue({ chainId }),
      } as unknown as ethers.providers.Provider;
    }

    it("should return L1 for Ethereum mainnet", async () => {
      // #given - a provider connected to Ethereum mainnet (chain ID 1)
      const provider = createMockProvider(1);

      // #when - getting the chain name
      const result = await getChain(provider);

      // #then - should return "ethereum"
      expect(result).toBe("ethereum");
    });

    it("should return L2 for Arbitrum One", async () => {
      // #given - a provider connected to Arbitrum One
      const provider = createMockProvider(CHAIN_IDS.ARB_ONE);

      // #when - getting the chain name
      const result = await getChain(provider);

      // #then - should return "arb1"
      expect(result).toBe("arb1");
    });

    it("should return NOVA for Arbitrum Nova", async () => {
      // #given - a provider connected to Arbitrum Nova
      const provider = createMockProvider(CHAIN_IDS.NOVA);

      // #when - getting the chain name
      const result = await getChain(provider);

      // #then - should return "nova"
      expect(result).toBe("nova");
    });

    it("should return unknown for unknown chains", async () => {
      // #given - a provider connected to an unknown chain
      const provider = createMockProvider(999);

      // #when - getting the chain name
      const result = await getChain(provider);

      // #then - should return "unknown"
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
      // #given - a provider connected to Ethereum mainnet
      const provider = createMockProvider(1);

      // #when - getting the chain ID
      const result = await getChainId(provider);

      // #then - should return 1
      expect(result).toBe(1);
    });

    it("should return chain ID for Arbitrum One", async () => {
      // #given - a provider connected to Arbitrum One
      const provider = createMockProvider(CHAIN_IDS.ARB_ONE);

      // #when - getting the chain ID
      const result = await getChainId(provider);

      // #then - should return the Arbitrum One chain ID
      expect(result).toBe(CHAIN_IDS.ARB_ONE);
    });

    it("should return chain ID for Arbitrum Nova", async () => {
      // #given - a provider connected to Arbitrum Nova
      const provider = createMockProvider(CHAIN_IDS.NOVA);

      // #when - getting the chain ID
      const result = await getChainId(provider);

      // #then - should return the Nova chain ID
      expect(result).toBe(CHAIN_IDS.NOVA);
    });

    it("should return chain ID for unknown chains", async () => {
      // #given - a provider connected to an unknown chain
      const provider = createMockProvider(999);

      // #when - getting the chain ID
      const result = await getChainId(provider);

      // #then - should return the chain ID as-is
      expect(result).toBe(999);
    });
  });
});

describe("Chain Constants", () => {
  it("should have correct Ethereum chain ID", () => {
    // #given - the CHAIN_IDS constant
    // #when - accessing the ETHEREUM chain ID
    // #then - should be 1 (mainnet)
    expect(CHAIN_IDS.ETHEREUM).toBe(1);
  });

  it("should have correct Arbitrum One chain ID", () => {
    // #given - the CHAIN_IDS constant
    // #when - accessing the ARB_ONE chain ID
    // #then - should be 42161
    expect(CHAIN_IDS.ARB_ONE).toBe(42161);
  });

  it("should have correct Nova chain ID", () => {
    // #given - the CHAIN_IDS constant
    // #when - accessing the NOVA chain ID
    // #then - should be 42170
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
    // #given - no options provided
    // #when - building default targets
    const targets = buildDefaultTargets();

    // #then - all targets should be enabled
    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(true);
    expect(targets.electionMemberGovernor).toBe(true);
    expect(targets.l2ConstitutionalTimelock).toBe(true);
    expect(targets.l2NonConstitutionalTimelock).toBe(true);
  });

  it("should exclude elections when includeElections is false", () => {
    // #given - includeElections option set to false
    // #when - building targets
    const targets = buildDefaultTargets({ includeElections: false });

    // #then - election governors should be disabled, others enabled
    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(false);
    expect(targets.electionMemberGovernor).toBe(false);
    expect(targets.l2ConstitutionalTimelock).toBe(true);
    expect(targets.l2NonConstitutionalTimelock).toBe(true);
  });

  it("should include only governors when governorsOnly is true", () => {
    // #given - governorsOnly option set to true
    // #when - building targets
    const targets = buildDefaultTargets({ governorsOnly: true });

    // #then - only governor targets should be enabled
    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(true);
    expect(targets.electionMemberGovernor).toBe(true);
    expect(targets.l2ConstitutionalTimelock).toBe(false);
    expect(targets.l2NonConstitutionalTimelock).toBe(false);
  });

  it("should include only timelocks when timelocksOnly is true", () => {
    // #given - timelocksOnly option set to true
    // #when - building targets
    const targets = buildDefaultTargets({ timelocksOnly: true });

    // #then - only timelock targets should be enabled
    expect(targets.constitutionalGovernor).toBe(false);
    expect(targets.nonConstitutionalGovernor).toBe(false);
    expect(targets.electionNomineeGovernor).toBe(false);
    expect(targets.electionMemberGovernor).toBe(false);
    expect(targets.l2ConstitutionalTimelock).toBe(true);
    expect(targets.l2NonConstitutionalTimelock).toBe(true);
  });

  it("should combine governorsOnly and includeElections options", () => {
    // #given - governorsOnly true and includeElections false
    // #when - building targets
    const targets = buildDefaultTargets({ governorsOnly: true, includeElections: false });

    // #then - only non-election governors should be enabled
    expect(targets.constitutionalGovernor).toBe(true);
    expect(targets.nonConstitutionalGovernor).toBe(true);
    expect(targets.electionNomineeGovernor).toBe(false);
    expect(targets.electionMemberGovernor).toBe(false);
    expect(targets.l2ConstitutionalTimelock).toBe(false);
    expect(targets.l2NonConstitutionalTimelock).toBe(false);
  });
});

describe("Chain Type Guards", () => {
  describe("isKnownChain", () => {
    it("should return true for ethereum", () => {
      // #given - ethereum chain
      const chain: Chain = "ethereum";

      // #when - checking if known
      const result = isKnownChain(chain);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return true for arb1", () => {
      // #given - arb1 chain
      const chain: Chain = "arb1";

      // #when - checking if known
      const result = isKnownChain(chain);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return true for nova", () => {
      // #given - nova chain
      const chain: Chain = "nova";

      // #when - checking if known
      const result = isKnownChain(chain);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return false for unknown", () => {
      // #given - unknown chain
      const chain: Chain = "unknown";

      // #when - checking if known
      const result = isKnownChain(chain);

      // #then - should return false
      expect(result).toBe(false);
    });
  });

  describe("isL2Chain", () => {
    it("should return true for arb1", () => {
      // #given - arb1 chain
      const chain: Chain = "arb1";

      // #when - checking if L2
      const result = isL2Chain(chain);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return true for nova", () => {
      // #given - nova chain
      const chain: Chain = "nova";

      // #when - checking if L2
      const result = isL2Chain(chain);

      // #then - should return true
      expect(result).toBe(true);
    });

    it("should return false for ethereum", () => {
      // #given - ethereum chain
      const chain: Chain = "ethereum";

      // #when - checking if L2
      const result = isL2Chain(chain);

      // #then - should return false
      expect(result).toBe(false);
    });

    it("should return false for unknown", () => {
      // #given - unknown chain
      const chain: Chain = "unknown";

      // #when - checking if L2
      const result = isL2Chain(chain);

      // #then - should return false
      expect(result).toBe(false);
    });
  });

  describe("getChainDisplayName", () => {
    it("should return 'Ethereum Mainnet' for ethereum", () => {
      expect(getChainDisplayName("ethereum")).toBe("Ethereum Mainnet");
    });

    it("should return 'Arbitrum One' for arb1", () => {
      expect(getChainDisplayName("arb1")).toBe("Arbitrum One");
    });

    it("should return 'Arbitrum Nova' for nova", () => {
      expect(getChainDisplayName("nova")).toBe("Arbitrum Nova");
    });

    it("should return 'Unknown Chain' for unknown", () => {
      expect(getChainDisplayName("unknown")).toBe("Unknown Chain");
    });
  });
});
