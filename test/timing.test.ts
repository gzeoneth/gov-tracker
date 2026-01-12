/**
 * Tests for Timing Utilities
 *
 * Tests for block-based timing calculations across L1 and L2.
 */

import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";
import {
  estimateTimestampFromBlock,
  calculateEta,
  calculateRemainingSeconds,
  calculateExpectedEta,
  getL1BlockNumberFromL2,
  getL1BlockForL2Block,
  getFirstL2BlockForL1Block,
  blockAfterDelay,
  getCurrentBlockInfo,
  invalidateBlockInfoCache,
  isStageStale,
} from "../src/utils/timing";
import { BigNumber } from "ethers";
import { BLOCK_TIMES, GOVERNANCE_STAGE_DURATION_DAYS } from "../src/constants";
import { StageBuilder } from "../src/stages/builder";
import type { TrackedStage } from "../src/types";

describe("Timing Utilities", () => {
  describe("estimateTimestampFromBlock", () => {
    it("should estimate future timestamp", () => {
      const currentBlock = 1000;
      const currentTimestamp = 1700000000;
      const targetBlock = 1100;
      const blockTime = 12;

      const result = estimateTimestampFromBlock(
        targetBlock,
        currentBlock,
        currentTimestamp,
        blockTime
      );

      // 100 blocks * 12 seconds = 1200 seconds ahead
      expect(result).toBe(1700001200);
    });

    it("should estimate past timestamp", () => {
      const currentBlock = 1000;
      const currentTimestamp = 1700000000;
      const targetBlock = 900;
      const blockTime = 12;

      const result = estimateTimestampFromBlock(
        targetBlock,
        currentBlock,
        currentTimestamp,
        blockTime
      );

      // 100 blocks * 12 seconds = 1200 seconds behind
      expect(result).toBe(1699998800);
    });

    it("should use default L2 block time (0.25s)", () => {
      const result = estimateTimestampFromBlock(1010, 1000, 1700000000);

      // 10 blocks * 0.25 seconds = 2.5 seconds, floored to 2
      expect(result).toBe(1700000000 + Math.floor(10 * BLOCK_TIMES.L2));
    });

    it("should handle same block (no difference)", () => {
      const result = estimateTimestampFromBlock(1000, 1000, 1700000000, 12);
      expect(result).toBe(1700000000);
    });

    it("should handle L1 block time", () => {
      const result = estimateTimestampFromBlock(1100, 1000, 1700000000, BLOCK_TIMES.L1);

      // 100 blocks * 12 seconds = 1200 seconds
      expect(result).toBe(1700001200);
    });

    it("should handle fractional block times correctly", () => {
      // L2 has 0.25 second blocks
      const result = estimateTimestampFromBlock(1040, 1000, 1700000000, 0.25);

      // 40 blocks * 0.25 seconds = 10 seconds
      expect(result).toBe(1700000010);
    });
  });

  describe("calculateEta", () => {
    it("should return null for past blocks", () => {
      const result = calculateEta(500, 1000, 1700000000);
      expect(result).toBeNull();
    });

    it("should return null for current block", () => {
      const result = calculateEta(1000, 1000, 1700000000);
      expect(result).toBeNull();
    });

    it("should calculate ETA for future blocks", () => {
      const result = calculateEta(1100, 1000, 1700000000, 12);
      expect(result).toBe(1700001200);
    });

    it("should use default L2 block time", () => {
      const result = calculateEta(1100, 1000, 1700000000);

      // 100 blocks * 0.25 seconds = 25 seconds
      expect(result).toBe(1700000000 + Math.floor(100 * BLOCK_TIMES.L2));
    });
  });

  describe("calculateRemainingSeconds", () => {
    it("should return 0 for past blocks", () => {
      expect(calculateRemainingSeconds(500, 1000)).toBe(0);
    });

    it("should return 0 for current block", () => {
      expect(calculateRemainingSeconds(1000, 1000)).toBe(0);
    });

    it("should calculate remaining time for future blocks", () => {
      const result = calculateRemainingSeconds(1100, 1000, 12);
      expect(result).toBe(1200); // 100 blocks * 12 seconds
    });

    it("should use default L2 block time", () => {
      const result = calculateRemainingSeconds(1100, 1000);
      expect(result).toBe(Math.floor(100 * BLOCK_TIMES.L2));
    });

    it("should handle large block differences", () => {
      const result = calculateRemainingSeconds(10000000, 1000000, 12);
      expect(result).toBe(9000000 * 12); // 9M blocks * 12 seconds
    });
  });

  describe("calculateExpectedEta", () => {
    // Helper to create test stages
    function createTestStages(): TrackedStage[] {
      return [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000 })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1")
          .status("COMPLETED")
          .tx("0xdef", 200, "arb1", 42161, { timestamp: 1700086400 })
          .timing({ eta: 1701209600 }) // ~14 days later
          .build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1")
          .status("COMPLETED")
          .tx("0xghi", 300, "arb1", 42161, { timestamp: 1701209600, description: "executed" })
          .build(),
        new StageBuilder("L2_TIMELOCK", "arb1")
          .status("PENDING")
          .timing({ eta: 1701296000 }) // +1 day
          .build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("NOT_STARTED").build(),
        new StageBuilder("RETRYABLE_EXECUTED", "ethereum").status("NOT_STARTED").build(),
      ];
    }

    it("should calculate ETA based on previous stage ETA", () => {
      const stages = createTestStages();

      // L2_TO_L1_MESSAGE is index 4, should base off L2_TIMELOCK ETA (index 3)
      const eta = calculateExpectedEta(stages, 4);

      // Should add L2_TO_L1_MESSAGE duration to L2_TIMELOCK ETA
      const expectedDays = GOVERNANCE_STAGE_DURATION_DAYS.CHALLENGE_PERIOD;
      const expectedEta = 1701296000 + expectedDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });

    it("should calculate ETA based on completed stage timestamp", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "executed" })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
      ];

      const eta = calculateExpectedEta(stages, 1);

      // Should add VOTING_ACTIVE duration to PROPOSAL_CREATED completion time
      const expectedDays = GOVERNANCE_STAGE_DURATION_DAYS.VOTING;
      const expectedEta = 1700000000 + expectedDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });

    it("should return undefined when no reference point available", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
      ];

      const eta = calculateExpectedEta(stages, 1);

      expect(eta).toBeUndefined();
    });

    it("should accumulate delays across multiple stages", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "executed" })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("NOT_STARTED").build(),
      ];

      // Calculate ETA for L2_TIMELOCK (index 3)
      const eta = calculateExpectedEta(stages, 3);

      // Should accumulate: VOTING + L2_TIMELOCK durations
      // PROPOSAL_QUEUED doesn't have a defined duration in GOVERNANCE_STAGE_DURATION_DAYS
      const votingDays = GOVERNANCE_STAGE_DURATION_DAYS.VOTING;
      const timelockDays = GOVERNANCE_STAGE_DURATION_DAYS.L2_CONSTITUTIONAL_TIMELOCK;
      const totalDays = votingDays + timelockDays;
      const expectedEta = 1700000000 + totalDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });

    it("should use first available reference going backwards", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "executed" })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1")
          .status("COMPLETED")
          .timing({ eta: 1701209600 })
          .build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("NOT_STARTED").build(),
      ];

      // Should use VOTING_ACTIVE eta (1701209600) not PROPOSAL_CREATED timestamp
      const eta = calculateExpectedEta(stages, 2);

      // PROPOSAL_QUEUED doesn't have duration, so should just be VOTING_ACTIVE eta
      expect(eta).toBe(1701209600);
    });

    it("should handle index 0 (first stage)", () => {
      const stages = [new StageBuilder("PROPOSAL_CREATED", "arb1").status("NOT_STARTED").build()];

      const eta = calculateExpectedEta(stages, 0);

      // No previous stages to reference
      expect(eta).toBeUndefined();
    });

    it("should prefer execution timestamp over other timestamps", () => {
      const stages = [
        new StageBuilder("L2_TIMELOCK", "arb1")
          .status("COMPLETED")
          .tx("0xqueue", 100, "arb1", 42161, { timestamp: 1700000000, description: "queued" })
          .tx("0xexec", 200, "arb1", 42161, { timestamp: 1700100000, description: "executed" })
          .build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("NOT_STARTED").build(),
      ];

      const eta = calculateExpectedEta(stages, 1);

      // Should use execution timestamp (1700100000)
      const expectedDays = GOVERNANCE_STAGE_DURATION_DAYS.CHALLENGE_PERIOD;
      const expectedEta = 1700100000 + expectedDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });
  });

  describe("getL1BlockNumberFromL2", () => {
    it("should throw error when provider does not have send method", async () => {
      // #given - a provider without send method
      const mockProvider = {
        getBlock: vi.fn(),
      } as unknown as ethers.providers.Provider;

      // #when / #then - should throw
      await expect(getL1BlockNumberFromL2(mockProvider)).rejects.toThrow(
        "Provider does not support direct RPC calls (send method required)"
      );
    });

    it("should throw error when l1BlockNumber is missing from response", async () => {
      // #given - a provider that returns block without l1BlockNumber
      const mockProvider = {
        send: vi.fn().mockResolvedValue({ number: "0x100" }), // Missing l1BlockNumber
      } as unknown as ethers.providers.JsonRpcProvider;

      // #when / #then - should throw
      await expect(getL1BlockNumberFromL2(mockProvider)).rejects.toThrow(
        "Could not get L1 block number from latest L2 block"
      );
    });

    it("should throw error when L2 block response is null", async () => {
      // #given - a provider that returns null
      const mockProvider = {
        send: vi.fn().mockResolvedValue(null),
      } as unknown as ethers.providers.JsonRpcProvider;

      // #when / #then - should throw
      await expect(getL1BlockNumberFromL2(mockProvider)).rejects.toThrow(
        "Could not get L1 block number from latest L2 block"
      );
    });
  });

  describe("getL1BlockForL2Block", () => {
    it("should throw error when provider does not have send method for L2 block lookup", async () => {
      // #given - a provider without send method
      const mockProvider = {
        getBlock: vi.fn(),
      } as unknown as ethers.providers.Provider;

      // #when / #then - should throw
      await expect(getL1BlockForL2Block(mockProvider, 12345)).rejects.toThrow(
        "Provider does not support direct RPC calls (send method required)"
      );
    });

    it("should throw error when l1BlockNumber is missing from specific L2 block", async () => {
      // #given - a provider that returns block without l1BlockNumber
      const mockProvider = {
        send: vi.fn().mockResolvedValue({ number: "0x100" }), // Missing l1BlockNumber
      } as unknown as ethers.providers.JsonRpcProvider;

      // #when / #then - should throw
      await expect(getL1BlockForL2Block(mockProvider, 12345)).rejects.toThrow(
        "Could not get L1 block number for L2 block 12345"
      );
    });

    it("should throw error when specific L2 block response is null", async () => {
      // #given - a provider that returns null
      const mockProvider = {
        send: vi.fn().mockResolvedValue(null),
      } as unknown as ethers.providers.JsonRpcProvider;

      // #when / #then - should throw
      await expect(getL1BlockForL2Block(mockProvider, 12345)).rejects.toThrow(
        "Could not get L1 block number for L2 block 12345"
      );
    });
  });

  describe("getFirstL2BlockForL1Block", () => {
    it("should return firstBlock on fast path (offset=0, exact L1 block match)", async () => {
      // #given - NodeInterface returns a valid range for the exact L1 block
      const targetL1Block = 19000000;
      const expectedFirstBlock = 200000000;
      const expectedLastBlock = 200000100;

      // Mock the NodeInterface contract by mocking the module
      const { NodeInterface__factory } =
        await import("@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory");
      const mockConnect = vi.spyOn(NodeInterface__factory, "connect");
      mockConnect.mockReturnValue({
        l2BlockRangeForL1: vi.fn().mockResolvedValue({
          firstBlock: BigNumber.from(expectedFirstBlock),
          lastBlock: BigNumber.from(expectedLastBlock),
        }),
      } as unknown as ReturnType<typeof NodeInterface__factory.connect>);

      const mockProvider = {} as ethers.providers.JsonRpcProvider;

      // #when
      const result = await getFirstL2BlockForL1Block(mockProvider, targetL1Block);

      // #then - should return firstBlock (fast path)
      expect(result).toBe(expectedFirstBlock);

      mockConnect.mockRestore();
    });

    it("should return lastBlock+1 when nearby L1 block matches (offset > 0)", async () => {
      // #given - exact L1 block has no L2 blocks, but L1-1 does
      const targetL1Block = 19000000;
      const nearbyLastBlock = 199999900;

      const { NodeInterface__factory } =
        await import("@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory");
      const mockConnect = vi.spyOn(NodeInterface__factory, "connect");

      let callCount = 0;
      mockConnect.mockReturnValue({
        l2BlockRangeForL1: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call (offset=0, exact block) - reverts (no L2 blocks)
            return Promise.reject(new Error("No L2 blocks for this L1 block"));
          }
          // Second call (offset=1, nearby block) - returns range
          return Promise.resolve({
            firstBlock: BigNumber.from(nearbyLastBlock - 100),
            lastBlock: BigNumber.from(nearbyLastBlock),
          });
        }),
      } as unknown as ReturnType<typeof NodeInterface__factory.connect>);

      const mockProvider = {} as ethers.providers.JsonRpcProvider;

      // #when
      const result = await getFirstL2BlockForL1Block(mockProvider, targetL1Block);

      // #then - should return lastBlock+1 (nearby path)
      expect(result).toBe(nearbyLastBlock + 1);

      mockConnect.mockRestore();
    });

    it("should try multiple nearby L1 blocks before falling back to SDK", async () => {
      // #given - first 3 L1 blocks have no L2 blocks, 4th does
      const targetL1Block = 19000000;
      const nearbyLastBlock = 199999700;

      const { NodeInterface__factory } =
        await import("@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory");
      const mockConnect = vi.spyOn(NodeInterface__factory, "connect");

      let callCount = 0;
      mockConnect.mockReturnValue({
        l2BlockRangeForL1: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 3) {
            // First 3 calls (offset=0,1,2) - revert
            return Promise.reject(new Error("No L2 blocks"));
          }
          // 4th call (offset=3) - returns range
          return Promise.resolve({
            firstBlock: BigNumber.from(nearbyLastBlock - 100),
            lastBlock: BigNumber.from(nearbyLastBlock),
          });
        }),
      } as unknown as ReturnType<typeof NodeInterface__factory.connect>);

      const mockProvider = {} as ethers.providers.JsonRpcProvider;

      // #when
      const result = await getFirstL2BlockForL1Block(mockProvider, targetL1Block);

      // #then - should return lastBlock+1 from 4th attempt
      expect(result).toBe(nearbyLastBlock + 1);
      expect(callCount).toBe(4);

      mockConnect.mockRestore();
    });

    it("should stop trying when L1 block would be <= 0", async () => {
      // #given - target L1 block is very low, iterations would go negative
      const targetL1Block = 3; // Only offsets 0, 1, 2 are valid (3, 2, 1)

      const { NodeInterface__factory } =
        await import("@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory");
      const mockConnect = vi.spyOn(NodeInterface__factory, "connect");

      let callCount = 0;
      mockConnect.mockReturnValue({
        l2BlockRangeForL1: vi.fn().mockImplementation(() => {
          callCount++;
          // All calls revert
          return Promise.reject(new Error("No L2 blocks"));
        }),
      } as unknown as ReturnType<typeof NodeInterface__factory.connect>);

      const mockProvider = {} as ethers.providers.JsonRpcProvider;

      // #when
      await getFirstL2BlockForL1Block(mockProvider, targetL1Block);

      // #then - should have tried only blocks 3, 2, 1 (not 0 or negative)
      // Then falls back to SDK which returns undefined for mock
      expect(callCount).toBe(3);

      mockConnect.mockRestore();
    });
  });

  describe("blockAfterDelay", () => {
    it("should throw error when start block cannot be fetched", async () => {
      // #given - a provider that returns null for startBlock
      const mockProvider = {
        getBlock: vi.fn().mockResolvedValue(null),
      } as unknown as ethers.providers.Provider;

      // #when / #then - should throw
      await expect(blockAfterDelay(mockProvider, 1000, 3600)).rejects.toThrow(
        "Could not fetch block 1000"
      );
    });

    it("should return startBlock when delay not yet passed", async () => {
      // #given - current timestamp is before target timestamp
      const startBlockTimestamp = 1700000000;
      const currentTimestamp = startBlockTimestamp + 1800; // Only 30 min passed
      const delaySeconds = 3600; // 1 hour delay

      const mockProvider = {
        getBlock: vi
          .fn()
          .mockResolvedValueOnce({ timestamp: startBlockTimestamp }) // startBlock
          .mockResolvedValueOnce({ number: 1100, timestamp: currentTimestamp }), // latestBlock
      } as unknown as ethers.providers.Provider;

      // #when
      const result = await blockAfterDelay(mockProvider, 1000, delaySeconds);

      // #then - returns startBlock since delay hasn't passed
      expect(result).toBe(1000);
    });

    it("should break loop when block fetch fails during iteration", async () => {
      // #given - startBlock exists but iteration block fails
      const startBlockTimestamp = 1700000000;
      const delaySeconds = 3600;
      const currentTimestamp = startBlockTimestamp + delaySeconds + 1000;

      const mockProvider = {
        getBlock: vi
          .fn()
          .mockResolvedValueOnce({ timestamp: startBlockTimestamp }) // startBlock
          .mockResolvedValueOnce({ number: 1500, timestamp: currentTimestamp }) // latestBlock
          .mockResolvedValueOnce(null), // iteration block - fails
      } as unknown as ethers.providers.Provider;

      // #when
      const result = await blockAfterDelay(mockProvider, 1000, delaySeconds);

      // #then - returns estimate since block fetch failed
      expect(result).toBeGreaterThan(1000);
    });

    it("should return startBlock+1 when cannot backtrack further", async () => {
      // #given - scenario where backtracking keeps hitting startBlock+1
      const startBlockTimestamp = 1700000000;
      const delaySeconds = 12; // Very short delay (1 block)
      const currentTimestamp = startBlockTimestamp + 100; // Way past delay

      const mockProvider = {
        getBlock: vi
          .fn()
          .mockResolvedValueOnce({ timestamp: startBlockTimestamp }) // startBlock=1000
          .mockResolvedValueOnce({ number: 1002, timestamp: currentTimestamp }) // current (just 2 blocks ahead)
          .mockResolvedValueOnce({ timestamp: currentTimestamp }), // block 1001: after target, triggers backtrack to 1001
      } as unknown as ethers.providers.Provider;

      // #when
      const result = await blockAfterDelay(mockProvider, 1000, delaySeconds);

      // #then - returns startBlock+1 when can't backtrack further
      expect(result).toBe(1001);
    });

    it("should find block before target after backtracking (happy path)", async () => {
      // #given - normal case where we find a block before target
      const startBlockTimestamp = 1700000000;
      const delaySeconds = 3600;
      const targetTimestamp = startBlockTimestamp + delaySeconds;
      const currentTimestamp = targetTimestamp + 1200;

      const mockProvider = {
        getBlock: vi
          .fn()
          .mockResolvedValueOnce({ timestamp: startBlockTimestamp }) // startBlock
          .mockResolvedValueOnce({ number: 1500, timestamp: currentTimestamp }) // latestBlock
          .mockResolvedValueOnce({ timestamp: targetTimestamp - 100 }), // iteration: before target
      } as unknown as ethers.providers.Provider;

      // #when
      const result = await blockAfterDelay(mockProvider, 1000, delaySeconds);

      // #then - returns the block that is before target
      expect(result).toBeGreaterThan(1000);
    });
  });

  describe("getCurrentBlockInfo", () => {
    it("should fetch block info from provider on first call", async () => {
      // #given - fresh provider with no cached data
      invalidateBlockInfoCache(); // Ensure clean state
      const mockProvider = {
        getBlock: vi.fn().mockResolvedValue({ number: 12345, timestamp: 1700000000 }),
      } as unknown as ethers.providers.Provider;

      // #when
      const result = await getCurrentBlockInfo(mockProvider);

      // #then
      expect(result.blockNumber).toBe(12345);
      expect(result.timestamp).toBe(1700000000);
      expect(mockProvider.getBlock).toHaveBeenCalledTimes(1);
    });

    it("should return cached result on subsequent calls within TTL", async () => {
      // #given - provider that was recently called
      invalidateBlockInfoCache();
      const mockProvider = {
        getBlock: vi.fn().mockResolvedValue({ number: 12345, timestamp: 1700000000 }),
      } as unknown as ethers.providers.Provider;

      // #when - first call populates cache
      const result1 = await getCurrentBlockInfo(mockProvider);
      // second call should use cache
      const result2 = await getCurrentBlockInfo(mockProvider);

      // #then - should only call getBlock once
      expect(result1).toEqual(result2);
      expect(mockProvider.getBlock).toHaveBeenCalledTimes(1);
    });

    it("should use separate cache for different providers", async () => {
      // #given - two different providers
      invalidateBlockInfoCache();
      const mockProvider1 = {
        getBlock: vi.fn().mockResolvedValue({ number: 11111, timestamp: 1700000000 }),
      } as unknown as ethers.providers.Provider;
      const mockProvider2 = {
        getBlock: vi.fn().mockResolvedValue({ number: 22222, timestamp: 1700000001 }),
      } as unknown as ethers.providers.Provider;

      // #when
      const result1 = await getCurrentBlockInfo(mockProvider1);
      const result2 = await getCurrentBlockInfo(mockProvider2);

      // #then - both providers should be called
      expect(result1.blockNumber).toBe(11111);
      expect(result2.blockNumber).toBe(22222);
      expect(mockProvider1.getBlock).toHaveBeenCalledTimes(1);
      expect(mockProvider2.getBlock).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidateBlockInfoCache", () => {
    it("should clear cached data for all providers", async () => {
      // #given - multiple providers with cached data
      invalidateBlockInfoCache(); // Start fresh
      const mockProvider1 = {
        getBlock: vi.fn().mockResolvedValue({ number: 11111, timestamp: 1700000000 }),
      } as unknown as ethers.providers.Provider;
      const mockProvider2 = {
        getBlock: vi.fn().mockResolvedValue({ number: 22222, timestamp: 1700000001 }),
      } as unknown as ethers.providers.Provider;

      // Populate cache
      await getCurrentBlockInfo(mockProvider1);
      await getCurrentBlockInfo(mockProvider2);
      expect(mockProvider1.getBlock).toHaveBeenCalledTimes(1);
      expect(mockProvider2.getBlock).toHaveBeenCalledTimes(1);

      // #when - invalidate cache
      invalidateBlockInfoCache();

      // #then - next calls should fetch fresh data
      await getCurrentBlockInfo(mockProvider1);
      await getCurrentBlockInfo(mockProvider2);
      expect(mockProvider1.getBlock).toHaveBeenCalledTimes(2);
      expect(mockProvider2.getBlock).toHaveBeenCalledTimes(2);
    });

    it("should handle invalidation when cache is already empty", () => {
      // #given - empty cache
      invalidateBlockInfoCache();

      // #when / #then - should not throw
      expect(() => invalidateBlockInfoCache()).not.toThrow();
    });

    it("should allow immediate re-caching after invalidation", async () => {
      // #given - provider with cached data
      invalidateBlockInfoCache();
      const mockProvider = {
        getBlock: vi
          .fn()
          .mockResolvedValueOnce({ number: 11111, timestamp: 1700000000 })
          .mockResolvedValueOnce({ number: 22222, timestamp: 1700000001 }),
      } as unknown as ethers.providers.Provider;

      await getCurrentBlockInfo(mockProvider);
      invalidateBlockInfoCache();

      // #when - fetch again and use cache
      const result1 = await getCurrentBlockInfo(mockProvider);
      const result2 = await getCurrentBlockInfo(mockProvider);

      // #then - should have new value and cache it
      expect(result1.blockNumber).toBe(22222);
      expect(result2.blockNumber).toBe(22222);
      expect(mockProvider.getBlock).toHaveBeenCalledTimes(2); // Initial + after invalidation
    });
  });

  describe("isStageStale", () => {
    it("should return undefined when stage status is not READY", () => {
      // #given - a stage with status PENDING
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .timing({ eta: 1700000000 })
        .build();
      const currentTimestamp = 1700100000;

      // #when
      const result = isStageStale(stage, currentTimestamp);

      // #then
      expect(result).toBeUndefined();
    });

    it("should return undefined when stage status is COMPLETED", () => {
      // #given - a completed stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("COMPLETED")
        .timing({ eta: 1700000000 })
        .build();

      // #when
      const result = isStageStale(stage, 1700100000);

      // #then
      expect(result).toBeUndefined();
    });

    it("should return undefined when eta is undefined", () => {
      // #given - a READY stage without eta
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").build();

      // #when
      const result = isStageStale(stage, 1700000000);

      // #then
      expect(result).toBeUndefined();
    });

    it("should return true when current time exceeds eta + threshold", () => {
      // #given - a READY stage with eta well in the past
      const eta = 1700000000;
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").timing({ eta }).build();
      // L2_TIMELOCK default threshold is 7 days = 604800 seconds
      const currentTimestamp = eta + 604800 + 1;

      // #when
      const result = isStageStale(stage, currentTimestamp);

      // #then
      expect(result).toBe(true);
    });

    it("should return false when current time is within threshold", () => {
      // #given - a READY stage with eta recently passed
      const eta = 1700000000;
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").timing({ eta }).build();
      // Just past eta but within 7-day threshold
      const currentTimestamp = eta + 1000;

      // #when
      const result = isStageStale(stage, currentTimestamp);

      // #then
      expect(result).toBe(false);
    });

    it("should return false when current time equals eta + threshold exactly", () => {
      // #given - exactly at boundary
      const eta = 1700000000;
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").timing({ eta }).build();
      const currentTimestamp = eta + 604800; // exactly at threshold

      // #when
      const result = isStageStale(stage, currentTimestamp);

      // #then
      expect(result).toBe(false);
    });

    it("should use custom threshold when provided", () => {
      // #given - a READY stage with custom threshold
      const eta = 1700000000;
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").timing({ eta }).build();
      const customThreshold = 3600; // 1 hour
      const currentTimestamp = eta + 3601; // just past custom threshold

      // #when
      const result = isStageStale(stage, currentTimestamp, customThreshold);

      // #then
      expect(result).toBe(true);
    });

    it("should not be stale with custom threshold when within bounds", () => {
      // #given - within custom threshold
      const eta = 1700000000;
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").timing({ eta }).build();
      const customThreshold = 3600;
      const currentTimestamp = eta + 3000; // within custom threshold

      // #when
      const result = isStageStale(stage, currentTimestamp, customThreshold);

      // #then
      expect(result).toBe(false);
    });

    it("should use RETRYABLE_EXECUTED default threshold (14 days)", () => {
      // #given - a retryable stage (14-day threshold)
      const eta = 1700000000;
      const stage = new StageBuilder("RETRYABLE_EXECUTED", "ethereum")
        .status("READY")
        .timing({ eta })
        .build();
      // 14 days = 1209600 seconds
      const currentTimestamp = eta + 1209600 + 1;

      // #when
      const result = isStageStale(stage, currentTimestamp);

      // #then
      expect(result).toBe(true);
    });

    it("should not be stale within RETRYABLE_EXECUTED threshold", () => {
      // #given - within 14-day retryable threshold
      const eta = 1700000000;
      const stage = new StageBuilder("RETRYABLE_EXECUTED", "ethereum")
        .status("READY")
        .timing({ eta })
        .build();
      // Within 14 days but past 7 days (to show it uses 14-day threshold)
      const currentTimestamp = eta + 1000000; // ~11.5 days

      // #when
      const result = isStageStale(stage, currentTimestamp);

      // #then
      expect(result).toBe(false);
    });

    it("should use default threshold for stage types without specific threshold", () => {
      // #given - PROPOSAL_CREATED has no specific threshold, uses 7-day default
      const eta = 1700000000;
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("READY")
        .timing({ eta })
        .build();
      // 7 days + 1 second
      const currentTimestamp = eta + 604801;

      // #when
      const result = isStageStale(stage, currentTimestamp);

      // #then
      expect(result).toBe(true);
    });
  });
});
