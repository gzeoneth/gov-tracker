/**
 * Log Search Utility Tests
 *
 * Tests for the log search chunking functionality.
 * Uses mocked providers to test edge cases.
 */

import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { ethers } from "ethers";
import { searchLogsInChunks } from "../src/utils/log-search";

describe("Log Search Utilities", () => {
  let mockProvider: ethers.providers.Provider;
  let getLogsMock: Mock;

  beforeEach(() => {
    getLogsMock = vi.fn().mockResolvedValue([]);
    mockProvider = {
      getLogs: getLogsMock,
    } as unknown as ethers.providers.Provider;
  });

  describe("searchLogsInChunks", () => {
    it("should return empty result when totalBlocks <= 0", async () => {
      // #given - fromBlock > toBlock (negative range)
      const filter = {
        topics: ["0x" + "a".repeat(64)],
        fromBlock: 1000,
        toBlock: 999, // less than fromBlock
      };

      // #when - searching with invalid range
      const result = await searchLogsInChunks(mockProvider, filter, { chunkSize: 100 });

      // #then - should return empty result without calling provider
      expect(result.logs).toEqual([]);
      expect(result.searchedBlocks).toBe(0);
      expect(result.chunksProcessed).toBe(0);
      expect(result.earlyExit).toBe(false);
      expect(getLogsMock).not.toHaveBeenCalled();
    });

    it("should search in reverse direction when searchDirection is backward", async () => {
      // #given - a block range and reverse direction option
      const filter = {
        topics: ["0x" + "b".repeat(64)],
        fromBlock: 1000,
        toBlock: 1250,
      };
      const calls: Array<{ fromBlock: number; toBlock: number }> = [];
      getLogsMock.mockImplementation((params: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: params.fromBlock, toBlock: params.toBlock });
        return Promise.resolve([]);
      });

      // #when - searching backwards
      const result = await searchLogsInChunks(mockProvider, filter, {
        chunkSize: 100,
        reverseDirection: true,
      });

      // #then - should search from high to low blocks
      expect(result.chunksProcessed).toBe(3);
      // First chunk should be 1151-1250 (highest blocks)
      expect(calls[0].toBlock).toBe(1250);
      expect(calls[0].fromBlock).toBe(1151);
      // Second chunk should be 1051-1150
      expect(calls[1].toBlock).toBe(1150);
      expect(calls[1].fromBlock).toBe(1051);
      // Third chunk should be 1000-1050
      expect(calls[2].toBlock).toBe(1050);
      expect(calls[2].fromBlock).toBe(1000);
    });

    it("should stop at maxChunks limit", async () => {
      // #given - a large block range with maxChunks limit
      const filter = {
        topics: ["0x" + "c".repeat(64)],
        fromBlock: 1000,
        toBlock: 2000,
      };

      // #when - searching with maxChunks=2
      const result = await searchLogsInChunks(mockProvider, filter, {
        chunkSize: 100,
        maxChunks: 2,
      });

      // #then - should only process 2 chunks
      expect(result.chunksProcessed).toBe(2);
      expect(getLogsMock).toHaveBeenCalledTimes(2);
    });

    it("should search forward by default", async () => {
      // #given - a block range
      const filter = {
        topics: ["0x" + "d".repeat(64)],
        fromBlock: 1000,
        toBlock: 1250,
      };
      const calls: Array<{ fromBlock: number; toBlock: number }> = [];
      getLogsMock.mockImplementation((params: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: params.fromBlock, toBlock: params.toBlock });
        return Promise.resolve([]);
      });

      // #when - searching (default direction)
      const result = await searchLogsInChunks(mockProvider, filter, {
        chunkSize: 100,
      });

      // #then - should search from low to high blocks
      expect(result.chunksProcessed).toBe(3);
      // First chunk should be 1000-1099 (lowest blocks)
      expect(calls[0].fromBlock).toBe(1000);
      expect(calls[0].toBlock).toBe(1099);
    });

    it("should early exit when earlyExitCheck returns truthy", async () => {
      // #given - a mock that returns logs on second chunk
      const filter = {
        topics: ["0x" + "e".repeat(64)],
        fromBlock: 1000,
        toBlock: 2000,
      };
      const targetLog = {
        blockNumber: 1150,
        transactionHash: "0x" + "f".repeat(64),
        topics: ["0x" + "e".repeat(64)],
        data: "0x",
      };
      getLogsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([targetLog]);

      // #when - searching with early exit check
      const result = await searchLogsInChunks(mockProvider, filter, {
        chunkSize: 100,
        earlyExitCheck: (logs) => logs.find((l) => l.blockNumber === 1150),
      });

      // #then - should stop after finding the target
      expect(result.earlyExit).toBe(true);
      expect(result.chunksProcessed).toBe(2);
      expect(result.logs).toContainEqual(targetLog);
    });

    it("should accumulate all logs when no early exit", async () => {
      // #given - mocks that return logs on multiple chunks
      const filter = {
        topics: ["0x" + "g".repeat(64)],
        fromBlock: 1000,
        toBlock: 1250,
      };
      const log1 = { blockNumber: 1050, topics: ["0x" + "g".repeat(64)], data: "0x" };
      const log2 = { blockNumber: 1150, topics: ["0x" + "g".repeat(64)], data: "0x" };
      getLogsMock
        .mockResolvedValueOnce([log1])
        .mockResolvedValueOnce([log2])
        .mockResolvedValueOnce([]);

      // #when - searching without early exit
      const result = await searchLogsInChunks(mockProvider, filter, {
        chunkSize: 100,
      });

      // #then - should have all logs
      expect(result.logs.length).toBe(2);
      expect(result.earlyExit).toBe(false);
    });

    it("should handle single block range", async () => {
      // #given - from and to are the same block
      const filter = {
        topics: ["0x" + "h".repeat(64)],
        fromBlock: 1000,
        toBlock: 1000,
      };

      // #when - searching single block
      const result = await searchLogsInChunks(mockProvider, filter, {
        chunkSize: 100,
      });

      // #then - should make one call
      expect(result.chunksProcessed).toBe(1);
      expect(getLogsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fromBlock: 1000,
          toBlock: 1000,
        })
      );
    });
  });
});
