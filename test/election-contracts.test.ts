/**
 * Unit tests for election/contracts.ts
 *
 * Tests for getLogQueryBlockRange, getNomineeGovernor, and getMemberGovernor.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { ethers, BigNumber } from "ethers";

// Mock queryWithRetry to simulate RPC calls
vi.mock("../src/utils/rpc-utils", () => ({
  queryWithRetry: vi.fn((fn: () => unknown) => fn()),
}));

import {
  getLogQueryBlockRange,
  getNomineeGovernor,
  getMemberGovernor,
} from "../src/election/contracts";
import { ADDRESSES } from "../src/constants";

describe("election/contracts", () => {
  describe("getNomineeGovernor", () => {
    it("should create contract with default address when not provided", () => {
      // #when
      const contract = getNomineeGovernor();

      // #then
      expect(contract.address).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
    });

    it("should create contract with custom address", () => {
      // #given
      const customAddress = "0x" + "1".repeat(40);

      // #when
      const contract = getNomineeGovernor(customAddress);

      // #then
      expect(contract.address).toBe(customAddress);
    });

    it("should create contract without provider when not provided", () => {
      // #when
      const contract = getNomineeGovernor(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);

      // #then - contract should be created (provider is undefined)
      expect(contract.address).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(contract.provider).toBeNull();
    });
  });

  describe("getMemberGovernor", () => {
    it("should create contract with default address when not provided", () => {
      // #when
      const contract = getMemberGovernor();

      // #then
      expect(contract.address).toBe(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
    });

    it("should create contract with custom address", () => {
      // #given
      const customAddress = "0x" + "2".repeat(40);

      // #when
      const contract = getMemberGovernor(customAddress);

      // #then
      expect(contract.address).toBe(customAddress);
    });

    it("should create contract without provider when not provided", () => {
      // #when
      const contract = getMemberGovernor(ADDRESSES.ELECTION_MEMBER_GOVERNOR);

      // #then - contract should be created (provider is undefined)
      expect(contract.address).toBe(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
      expect(contract.provider).toBeNull();
    });
  });

  describe("getLogQueryBlockRange", () => {
    let mockProvider: {
      getBlockNumber: ReturnType<typeof vi.fn>;
    };
    let mockGovernor: {
      proposalSnapshot: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      vi.clearAllMocks();

      mockProvider = {
        getBlockNumber: vi.fn().mockResolvedValue(1000000),
      };

      mockGovernor = {
        proposalSnapshot: vi.fn(),
      };
    });

    it("should return block range based on proposal snapshot when available", async () => {
      // #given
      const proposalId = "12345";
      const snapshotBlock = 500000;
      mockGovernor.proposalSnapshot.mockResolvedValue(BigNumber.from(snapshotBlock));

      // #when
      const result = await getLogQueryBlockRange(
        mockGovernor as unknown as ethers.Contract,
        proposalId,
        mockProvider as unknown as ethers.providers.Provider
      );

      // #then
      expect(result.toBlock).toBe(1000000);
      expect(result.fromBlock).toBe(snapshotBlock - 1000); // default offset
      expect(mockGovernor.proposalSnapshot).toHaveBeenCalledWith(proposalId);
    });

    it("should use custom offset from snapshot", async () => {
      // #given
      const proposalId = "12345";
      const snapshotBlock = 500000;
      const customOffset = 5000;
      mockGovernor.proposalSnapshot.mockResolvedValue(BigNumber.from(snapshotBlock));

      // #when
      const result = await getLogQueryBlockRange(
        mockGovernor as unknown as ethers.Contract,
        proposalId,
        mockProvider as unknown as ethers.providers.Provider,
        customOffset
      );

      // #then
      expect(result.fromBlock).toBe(snapshotBlock - customOffset);
    });

    it("should use fallback range when proposalSnapshot throws", async () => {
      // #given
      const proposalId = "12345";
      const fallbackRange = 100000;
      mockGovernor.proposalSnapshot.mockRejectedValue(new Error("Proposal not found"));

      // #when
      const result = await getLogQueryBlockRange(
        mockGovernor as unknown as ethers.Contract,
        proposalId,
        mockProvider as unknown as ethers.providers.Provider,
        1000,
        fallbackRange
      );

      // #then
      expect(result.toBlock).toBe(1000000);
      expect(result.fromBlock).toBe(1000000 - fallbackRange);
    });

    it("should use custom fallback range", async () => {
      // #given
      const proposalId = "12345";
      const customFallbackRange = 50000;
      mockGovernor.proposalSnapshot.mockRejectedValue(new Error("Proposal not found"));

      // #when
      const result = await getLogQueryBlockRange(
        mockGovernor as unknown as ethers.Contract,
        proposalId,
        mockProvider as unknown as ethers.providers.Provider,
        1000,
        customFallbackRange
      );

      // #then
      expect(result.fromBlock).toBe(1000000 - customFallbackRange);
    });

    it("should clamp fromBlock to 0 when snapshot minus offset would be negative", async () => {
      // #given
      const proposalId = "12345";
      const snapshotBlock = 500; // Very early block
      const largeOffset = 1000;
      mockGovernor.proposalSnapshot.mockResolvedValue(BigNumber.from(snapshotBlock));

      // #when
      const result = await getLogQueryBlockRange(
        mockGovernor as unknown as ethers.Contract,
        proposalId,
        mockProvider as unknown as ethers.providers.Provider,
        largeOffset
      );

      // #then - should clamp to 0, not go negative
      expect(result.fromBlock).toBe(0);
    });

    it("should clamp fallback fromBlock to 0 when current block minus fallback would be negative", async () => {
      // #given
      const proposalId = "12345";
      mockProvider.getBlockNumber.mockResolvedValue(50000); // Low block number
      const largeFallbackRange = 100000; // Larger than current block
      mockGovernor.proposalSnapshot.mockRejectedValue(new Error("Proposal not found"));

      // #when
      const result = await getLogQueryBlockRange(
        mockGovernor as unknown as ethers.Contract,
        proposalId,
        mockProvider as unknown as ethers.providers.Provider,
        1000,
        largeFallbackRange
      );

      // #then - should clamp to 0, not go negative
      expect(result.fromBlock).toBe(0);
    });
  });
});
