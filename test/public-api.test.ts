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
  RetryableTicketInfo,
  RetryableRedemptionInfo,
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
  // Utilities
  addressEquals,
  isAddressIn,
} from "../src";

describe("Public API: Types", () => {
  it("exports base stage data types for extension", () => {
    // Verify BaseStageData can be used as a base for custom stage data
    const base: BaseStageData = {
      skipReason: "test",
    };
    expect(base.skipReason).toBe("test");
  });

  it("exports BaseTimelockData for extending timelock stages", () => {
    // Verify BaseTimelockData is exported with required fields
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
    expect(timelock.timelockAddress).toBe(ADDRESSES.L1_TIMELOCK);
    expect(timelock.operationId).toBeDefined();
  });

  it("exports retryable types for advanced usage", () => {
    // Verify RetryableTicketInfo is properly typed
    const ticketInfo: RetryableTicketInfo = {
      l2TxHash: "0x123",
      status: "pending",
      targetChain: "arb1",
      targetChainId: 42161,
    };
    expect(ticketInfo.status).toBe("pending");
    expect(ticketInfo.targetChain).toBe("arb1");

    // Verify RetryableRedemptionInfo is properly typed
    const redemptionInfo: RetryableRedemptionInfo = {
      l2TxHash: "0x123",
      txHash: "0x456",
      blockNumber: 12345,
      targetChain: "arb1",
      targetChainId: 42161,
    };
    expect(redemptionInfo.txHash).toBe("0x456");

    // Verify RetryableCreationDetail is properly typed
    const creationDetail: RetryableCreationDetail = {
      index: 0,
      targetChain: "arb1",
      targetChainId: 42161,
      l2TxHash: "0x789",
    };
    expect(creationDetail.index).toBe(0);

    // Verify RetryableRedemptionDetail is properly typed
    const redemptionDetail: RetryableRedemptionDetail = {
      index: 0,
      targetChain: "arb1",
      targetChainId: 42161,
      status: "success",
      l2TxHash: "0xabc",
    };
    expect(redemptionDetail.status).toBe("success");
  });

  it("exports discovery types for custom discovery", () => {
    // Verify DiscoveryTrackingInput is properly typed
    const input: DiscoveryTrackingInput = {
      type: "discovery",
      id: "watermarks",
    };
    expect(input.type).toBe("discovery");

    // Verify DiscoveryWatermarks is properly typed
    const watermarks: DiscoveryWatermarks = {
      constitutionalGovernor: 12345,
    };
    expect(watermarks.constitutionalGovernor).toBe(12345);

    // Verify DiscoveryTargets is properly typed
    const targets: DiscoveryTargets = {
      constitutionalGovernor: true,
      nonConstitutionalGovernor: true,
    };
    expect(targets.constitutionalGovernor).toBe(true);
  });
});

describe("Public API: Cache Implementations", () => {
  it("exports MemoryCache for testing", () => {
    const cache = new MemoryCache();
    expect(cache).toBeDefined();
    expect(typeof cache.get).toBe("function");
    expect(typeof cache.set).toBe("function");
    expect(typeof cache.delete).toBe("function");
  });

  it("exports FileCache for Node.js environments", () => {
    expect(FileCache).toBeDefined();
  });

  it("exports LocalStorageCache for browser environments", () => {
    expect(LocalStorageCache).toBeDefined();
  });
});

describe("Public API: Constants", () => {
  it("exports ADDRESSES with all governance addresses", () => {
    expect(ADDRESSES.CONSTITUTIONAL_GOVERNOR).toBeDefined();
    expect(ADDRESSES.L1_TIMELOCK).toBeDefined();
    expect(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK).toBeDefined();
  });

  it("exports CHAIN_IDS for network identification", () => {
    expect(CHAIN_IDS.ETHEREUM).toBe(1);
    expect(CHAIN_IDS.ARB_ONE).toBe(42161);
    expect(CHAIN_IDS.NOVA).toBe(42170);
  });

  it("exports NETWORK_IDS for simulation (Tenderly format)", () => {
    expect(NETWORK_IDS.ethereum).toBe("1");
    expect(NETWORK_IDS.arb1).toBe("42161");
    expect(NETWORK_IDS.nova).toBe("42170");
  });

  it("exports TIMELOCK_SELECTORS for calldata matching", () => {
    expect(TIMELOCK_SELECTORS.schedule).toBe("0x01d5062a");
    expect(TIMELOCK_SELECTORS.execute).toBe("0x134008d3");
    expect(TIMELOCK_SELECTORS.scheduleBatch).toBe("0x8f2a0bb0");
    expect(TIMELOCK_SELECTORS.executeBatch).toBe("0xe38335e5");
  });
});

describe("Public API: Address Utilities", () => {
  it("exports addressEquals for case-insensitive comparison", () => {
    const addr1 = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
    const addr2 = "0xf07ded9dc292157749b6fd268e37df6ea38395b9";
    expect(addressEquals(addr1, addr2)).toBe(true);
    expect(addressEquals(addr1, "0x0000000000000000000000000000000000000000")).toBe(false);
  });

  it("exports isAddressIn for membership checking", () => {
    const addr = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
    const addrs = [
      "0xf07ded9dc292157749b6fd268e37df6ea38395b9",
      "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
    ];
    expect(isAddressIn(addr, addrs)).toBe(true);
    expect(isAddressIn("0x0000000000000000000000000000000000000000", addrs)).toBe(false);
  });
});
