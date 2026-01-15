/**
 * Public API Tests
 *
 * These tests verify that all intentionally-exported types and utilities
 * are accessible and work as expected. This also helps knip recognize
 * these exports as intentionally public.
 */

import { describe, it, expect } from "vitest";

// Import all public types to verify they're exported
import type {
  // Base types (for consumers extending types)
  BaseStageData,
  BaseTimelockData,
  // Retryable types (for advanced usage)
  RetryableCreationDetail,
  RetryableRedemptionDetail,
  // Discovery types
  DiscoveryTrackingInput,
  DiscoveryWatermarks,
  DiscoveryTargets,
} from "../src/types";

import {
  // Cache implementations
  FileCache,
  LocalStorageCache,
  MemoryCache,
  // Constants
  ADDRESSES,
  CHAIN_IDS,
  NETWORK_IDS,
  TIMELOCK_SELECTORS,
  DEFAULT_RPC_URLS,
  // Utilities
  addressEquals,
  isAddressIn,
} from "../src";

describe("Public API: Types", () => {
  it("exports base stage data types for extension", () => {
    // #given - a BaseStageData type with optional skipReason field
    const base: BaseStageData = {
      skipReason: "test",
    };

    // #when - accessing the skipReason property
    const result = base.skipReason;

    // #then - the value should be accessible as defined
    expect(result).toBe("test");
  });

  it("exports BaseTimelockData for extending timelock stages", () => {
    // #given - a BaseTimelockData object with required timelock fields
    const timelock: BaseTimelockData = {
      timelockAddress: ADDRESSES.L1_TIMELOCK,
      operationId: "0x1234567890abcdef",
      callScheduledData: [
        {
          operationId: "0x1234",
          index: "0",
          target: ADDRESSES.L1_TIMELOCK,
          value: "0",
          data: "0x",
          predecessor: "0x0",
          delay: "259200",
          blockNumber: 12345,
          txHash: "0xabc",
          logIndex: 0,
          timelockAddress: ADDRESSES.L1_TIMELOCK,
        },
      ],
    };

    // #when - accessing timelock properties
    const address = timelock.timelockAddress;
    const opId = timelock.operationId;

    // #then - all required fields should be properly typed and accessible
    expect(address).toBe(ADDRESSES.L1_TIMELOCK);
    expect(opId).toBeDefined();
  });

  it("exports retryable types for advanced usage", () => {
    // #given - retryable creation and redemption detail objects
    const creationDetail: RetryableCreationDetail = {
      index: 0,
      targetChain: "arb1",
      targetChainId: 42161,
      l2TxHash: "0x789",
    };
    const redemptionDetail: RetryableRedemptionDetail = {
      index: 0,
      targetChain: "arb1",
      targetChainId: 42161,
      status: "success",
      l2TxHash: "0xabc",
    };

    // #when - accessing retryable properties
    const creationIndex = creationDetail.index;
    const redemptionStatus = redemptionDetail.status;

    // #then - both types should expose their respective fields correctly
    expect(creationIndex).toBe(0);
    expect(redemptionStatus).toBe("success");
  });

  it("exports discovery types for custom discovery", () => {
    // #given - discovery-related type instances
    const input: DiscoveryTrackingInput = {
      type: "discovery",
      id: "watermarks",
    };
    const watermarks: DiscoveryWatermarks = {
      constitutionalGovernor: 12345,
    };
    const targets: DiscoveryTargets = {
      constitutionalGovernor: true,
      nonConstitutionalGovernor: true,
    };

    // #when - accessing discovery properties
    const inputType = input.type;
    const watermarkValue = watermarks.constitutionalGovernor;
    const targetValue = targets.constitutionalGovernor;

    // #then - all discovery types should be properly typed and accessible
    expect(inputType).toBe("discovery");
    expect(watermarkValue).toBe(12345);
    expect(targetValue).toBe(true);
  });
});

describe("Public API: Cache Implementations", () => {
  it("exports MemoryCache for testing", () => {
    // #given - the MemoryCache class exported from the public API

    // #when - instantiating a new MemoryCache
    const cache = new MemoryCache();

    // #then - the instance should have all required cache methods
    expect(cache).toBeDefined();
    expect(typeof cache.get).toBe("function");
    expect(typeof cache.set).toBe("function");
    expect(typeof cache.delete).toBe("function");
  });

  it("exports FileCache for Node.js environments", () => {
    // #given - the FileCache class exported from the public API

    // #when - checking if FileCache is available

    // #then - FileCache should be defined and importable
    expect(FileCache).toBeDefined();
  });

  it("exports LocalStorageCache for browser environments", () => {
    // #given - the LocalStorageCache class exported from the public API

    // #when - checking if LocalStorageCache is available

    // #then - LocalStorageCache should be defined and importable
    expect(LocalStorageCache).toBeDefined();
  });
});

describe("Public API: Constants", () => {
  it("exports ADDRESSES with all governance addresses", () => {
    // #given - the ADDRESSES constant exported from the public API

    // #when - accessing governance address properties

    // #then - all key governance addresses should be defined
    expect(ADDRESSES.CONSTITUTIONAL_GOVERNOR).toBeDefined();
    expect(ADDRESSES.L1_TIMELOCK).toBeDefined();
    expect(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK).toBeDefined();
  });

  it("exports CHAIN_IDS for network identification", () => {
    // #given - the CHAIN_IDS constant exported from the public API

    // #when - accessing chain ID values

    // #then - chain IDs should match the expected network identifiers
    expect(CHAIN_IDS.ETHEREUM).toBe(1);
    expect(CHAIN_IDS.ARB_ONE).toBe(42161);
    expect(CHAIN_IDS.NOVA).toBe(42170);
  });

  it("exports NETWORK_IDS for simulation (Tenderly format)", () => {
    // #given - the NETWORK_IDS constant exported from the public API

    // #when - accessing network ID strings

    // #then - network IDs should be string format for Tenderly compatibility
    expect(NETWORK_IDS.ethereum).toBe("1");
    expect(NETWORK_IDS.arb1).toBe("42161");
    expect(NETWORK_IDS.nova).toBe("42170");
  });

  it("exports TIMELOCK_SELECTORS for calldata matching", () => {
    // #given - the TIMELOCK_SELECTORS constant exported from the public API

    // #when - accessing function selector values

    // #then - selectors should match the expected 4-byte function signatures
    expect(TIMELOCK_SELECTORS.schedule).toBe("0x01d5062a");
    expect(TIMELOCK_SELECTORS.execute).toBe("0x134008d3");
    expect(TIMELOCK_SELECTORS.scheduleBatch).toBe("0x8f2a0bb0");
    expect(TIMELOCK_SELECTORS.executeBatch).toBe("0xe38335e5");
  });

  it("exports DEFAULT_RPC_URLS for all supported chains", () => {
    // #given - the DEFAULT_RPC_URLS constant exported from the public API

    // #when - accessing RPC URL values

    // #then - all supported chains should have default RPC URLs defined
    expect(DEFAULT_RPC_URLS.ETHEREUM).toBe("https://eth.drpc.org");
    expect(DEFAULT_RPC_URLS.ARB_ONE).toBe("https://arb1.arbitrum.io/rpc");
    expect(DEFAULT_RPC_URLS.NOVA).toBe("https://nova.arbitrum.io/rpc");
  });
});

describe("Public API: Address Utilities", () => {
  it("exports addressEquals for case-insensitive comparison", () => {
    // #given - two addresses with different casing but same value
    const addr1 = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
    const addr2 = "0xf07ded9dc292157749b6fd268e37df6ea38395b9";

    // #when - comparing addresses using addressEquals

    // #then - same addresses with different casing should be equal
    expect(addressEquals(addr1, addr2)).toBe(true);
    // #then - different addresses should not be equal
    expect(addressEquals(addr1, "0x0000000000000000000000000000000000000000")).toBe(false);
  });

  it("exports isAddressIn for membership checking", () => {
    // #given - an address and an array of addresses to check against
    const addr = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
    const addrs = [
      "0xf07ded9dc292157749b6fd268e37df6ea38395b9",
      "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
    ];

    // #when - checking address membership using isAddressIn

    // #then - address present in array should return true (case-insensitive)
    expect(isAddressIn(addr, addrs)).toBe(true);
    // #then - address not in array should return false
    expect(isAddressIn("0x0000000000000000000000000000000000000000", addrs)).toBe(false);
  });
});
