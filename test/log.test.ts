/**
 * Log Utilities Tests
 *
 * Tests for log filtering, parsing, and chunked search functionality.
 * Consolidated from log-filters.test.ts and log-search.test.ts.
 */

import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { ethers } from "ethers";
import {
  filterLogs,
  parseLogsSafe,
  findAndParseLogs,
  findFirstLog,
  countLogsByAddress,
} from "../src/utils/log-filters";
import { searchLogsInChunks } from "../src/utils/log-search";
import { EVENT_TOPICS } from "../src/constants";

// Mock log data
function createMockLog(overrides: Partial<ethers.providers.Log> = {}): ethers.providers.Log {
  return {
    blockNumber: 12345,
    blockHash: "0x" + "a".repeat(64),
    transactionIndex: 0,
    removed: false,
    address: "0x1111111111111111111111111111111111111111",
    data: "0x",
    topics: ["0x" + "b".repeat(64)],
    transactionHash: "0x" + "c".repeat(64),
    logIndex: 0,
    ...overrides,
  };
}

describe("Log Filters", () => {
  describe("filterLogs", () => {
    it("should filter logs by topic", () => {
      // #given - logs with mixed topics including two matching target
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: ["0x" + "a".repeat(64)] }),
        createMockLog({ topics: [targetTopic] }),
        createMockLog({ topics: ["0x" + "b".repeat(64)] }),
        createMockLog({ topics: [targetTopic] }),
      ];

      // #when - filtering by target topic
      const filtered = filterLogs(logs, { topic: targetTopic });

      // #then - only logs with matching topic are returned
      expect(filtered.length).toBe(2);
      expect(filtered.every((log) => log.topics[0] === targetTopic)).toBe(true);
    });

    it("should filter logs by address", () => {
      // #given - logs from different addresses
      const targetAddress = "0x2222222222222222222222222222222222222222";
      const logs = [
        createMockLog({ address: "0x1111111111111111111111111111111111111111" }),
        createMockLog({ address: targetAddress }),
        createMockLog({ address: "0x3333333333333333333333333333333333333333" }),
      ];

      // #when - filtering by target address
      const filtered = filterLogs(logs, { address: targetAddress });

      // #then - only log from target address is returned
      expect(filtered.length).toBe(1);
      expect(filtered[0].address).toBe(targetAddress);
    });

    it("should be case-insensitive for address", () => {
      // #given - log with uppercase address
      const logs = [createMockLog({ address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })];

      // #when - filtering with lowercase address
      const filtered = filterLogs(logs, {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });

      // #then - log is matched despite case difference
      expect(filtered.length).toBe(1);
    });

    it("should filter by both topic and address", () => {
      // #given - logs with various topic/address combinations
      const targetTopic = "0x" + "d".repeat(64);
      const targetAddress = "0x2222222222222222222222222222222222222222";
      const logs = [
        createMockLog({
          topics: [targetTopic],
          address: "0x1111111111111111111111111111111111111111",
        }),
        createMockLog({ topics: [targetTopic], address: targetAddress }),
        createMockLog({ topics: ["0x" + "e".repeat(64)], address: targetAddress }),
      ];

      // #when - filtering by both topic and address
      const filtered = filterLogs(logs, { topic: targetTopic, address: targetAddress });

      // #then - only log matching both criteria is returned
      expect(filtered.length).toBe(1);
      expect(filtered[0].topics[0]).toBe(targetTopic);
      expect(filtered[0].address).toBe(targetAddress);
    });

    it("should return all logs when no filter provided", () => {
      // #given - multiple logs
      const logs = [createMockLog(), createMockLog(), createMockLog()];

      // #when - filtering with empty filter
      const filtered = filterLogs(logs, {});

      // #then - all logs are returned
      expect(filtered.length).toBe(3);
    });

    it("should return empty array for empty input", () => {
      // #given - empty logs array
      // #when - filtering empty array
      const filtered = filterLogs([], { topic: "0x" + "a".repeat(64) });

      // #then - empty array is returned
      expect(filtered).toEqual([]);
    });
  });

  describe("parseLogsSafe", () => {
    it("should parse logs and return results", () => {
      // #given - logs with hex data
      const logs = [
        createMockLog({ data: "0x0001" }),
        createMockLog({ data: "0x0002" }),
        createMockLog({ data: "0x0003" }),
      ];

      // #when - parsing logs to integers
      const results = parseLogsSafe(logs, (log) => parseInt(log.data, 16));

      // #then - parsed values are returned
      expect(results).toEqual([1, 2, 3]);
    });

    it("should skip logs that throw errors", () => {
      // #given - logs with one invalid data entry
      const logs = [
        createMockLog({ data: "0x0001" }),
        createMockLog({ data: "invalid" }),
        createMockLog({ data: "0x0003" }),
      ];

      // #when - parsing with function that throws on invalid data
      const results = parseLogsSafe(logs, (log) => {
        if (log.data === "invalid") {
          throw new Error("Parse error");
        }
        return parseInt(log.data, 16);
      });

      // #then - invalid log is skipped, valid logs are parsed
      expect(results).toEqual([1, 3]);
    });

    it("should skip logs where parser returns null", () => {
      // #given - logs including one with zero value
      const logs = [
        createMockLog({ data: "0x0001" }),
        createMockLog({ data: "0x0000" }),
        createMockLog({ data: "0x0003" }),
      ];

      // #when - parsing with function that returns null for zero
      const results = parseLogsSafe(logs, (log) => {
        const val = parseInt(log.data, 16);
        return val === 0 ? null : val;
      });

      // #then - null result is skipped
      expect(results).toEqual([1, 3]);
    });

    it("should return empty array when all logs fail", () => {
      // #given - logs to be parsed
      const logs = [createMockLog(), createMockLog()];

      // #when - parsing with function that always throws
      const results = parseLogsSafe(logs, () => {
        throw new Error("Always fails");
      });

      // #then - empty array is returned
      expect(results).toEqual([]);
    });

    it("should return empty array for empty input", () => {
      // #given - empty logs array
      // #when - parsing empty array
      const results = parseLogsSafe([], (log) => log.data);

      // #then - empty array is returned
      expect(results).toEqual([]);
    });
  });

  describe("findAndParseLogs", () => {
    it("should filter and parse logs", () => {
      // #given - logs with mixed topics
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: [targetTopic], data: "0x0001" }),
        createMockLog({ topics: ["0x" + "e".repeat(64)], data: "0x0002" }),
        createMockLog({ topics: [targetTopic], data: "0x0003" }),
      ];

      // #when - filtering by topic and parsing data
      const results = findAndParseLogs(logs, { topic: targetTopic }, (log) =>
        parseInt(log.data, 16)
      );

      // #then - only matching logs are parsed and returned
      expect(results).toEqual([1, 3]);
    });

    it("should handle empty result", () => {
      // #given - logs with non-matching topic
      const logs = [createMockLog({ topics: ["0x" + "a".repeat(64)] })];

      // #when - filtering by different topic
      const results = findAndParseLogs(logs, { topic: "0x" + "b".repeat(64) }, (log) =>
        parseInt(log.data, 16)
      );

      // #then - empty array is returned
      expect(results).toEqual([]);
    });
  });

  describe("findFirstLog", () => {
    it("should return first matching log", () => {
      // #given - multiple logs with matching topic
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: [targetTopic], data: "0x0001" }),
        createMockLog({ topics: [targetTopic], data: "0x0002" }),
      ];

      // #when - finding first log by topic
      const result = findFirstLog(logs, { topic: targetTopic }, (log) => parseInt(log.data, 16));

      // #then - first matching log's parsed data is returned
      expect(result).toBe(1);
    });

    it("should return null when no match", () => {
      // #given - logs with non-matching topic
      const logs = [createMockLog({ topics: ["0x" + "a".repeat(64)] })];

      // #when - finding log by different topic
      const result = findFirstLog(logs, { topic: "0x" + "b".repeat(64) }, (log) =>
        parseInt(log.data, 16)
      );

      // #then - null is returned
      expect(result).toBeNull();
    });
  });
});

describe("countLogsByAddress", () => {
  it("should count logs by address", () => {
    // #given - logs from two different addresses
    const addr1 = "0x1111111111111111111111111111111111111111";
    const addr2 = "0x2222222222222222222222222222222222222222";
    const logs = [
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr2 }),
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr2 }),
    ];

    // #when - counting logs by address
    const counts = countLogsByAddress(logs, {});

    // #then - correct counts per address
    expect(counts.get(addr1.toLowerCase())).toBe(3);
    expect(counts.get(addr2.toLowerCase())).toBe(2);
  });

  it("should filter by topic before counting", () => {
    // #given - logs with mixed topics from two addresses
    const addr1 = "0x1111111111111111111111111111111111111111";
    const addr2 = "0x2222222222222222222222222222222222222222";
    const targetTopic = "0x" + "d".repeat(64);
    const otherTopic = "0x" + "e".repeat(64);

    const logs = [
      createMockLog({ address: addr1, topics: [targetTopic] }),
      createMockLog({ address: addr2, topics: [targetTopic] }),
      createMockLog({ address: addr1, topics: [otherTopic] }), // Should be excluded
      createMockLog({ address: addr1, topics: [targetTopic] }),
    ];

    // #when - counting logs filtered by topic
    const counts = countLogsByAddress(logs, { topic: targetTopic });

    // #then - only logs with target topic are counted
    expect(counts.get(addr1.toLowerCase())).toBe(2); // Only 2 with target topic
    expect(counts.get(addr2.toLowerCase())).toBe(1);
  });

  it("should return lowercase addresses in the map", () => {
    // #given - log with uppercase address
    const upperAddr = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const logs = [createMockLog({ address: upperAddr })];

    // #when - counting logs
    const counts = countLogsByAddress(logs, {});

    // #then - map keys are lowercase
    expect(counts.has(upperAddr.toLowerCase())).toBe(true);
    expect(counts.has(upperAddr)).toBe(false);
  });

  it("should return empty map for empty logs", () => {
    // #given - empty logs array
    // #when - counting empty logs
    const counts = countLogsByAddress([], {});

    // #then - empty map is returned
    expect(counts.size).toBe(0);
  });

  it("should return empty map when no logs match topic", () => {
    // #given - logs with topics that don't match filter
    const logs = [
      createMockLog({ topics: ["0x" + "a".repeat(64)] }),
      createMockLog({ topics: ["0x" + "b".repeat(64)] }),
    ];

    // #when - counting logs with non-matching topic filter
    const counts = countLogsByAddress(logs, { topic: "0x" + "c".repeat(64) });

    // #then - empty map is returned
    expect(counts.size).toBe(0);
  });

  it("should count all logs when no topic filter provided", () => {
    // #given - logs from same address with different topics
    const addr1 = "0x1111111111111111111111111111111111111111";
    const logs = [
      createMockLog({ address: addr1, topics: ["0x" + "a".repeat(64)] }),
      createMockLog({ address: addr1, topics: ["0x" + "b".repeat(64)] }),
      createMockLog({ address: addr1, topics: ["0x" + "c".repeat(64)] }),
    ];

    // #when - counting logs without topic filter
    const counts = countLogsByAddress(logs, {});

    // #then - all logs are counted
    expect(counts.get(addr1.toLowerCase())).toBe(3);
  });
});

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

describe("Event Topics", () => {
  it("should have valid CallScheduled topic", () => {
    expect(EVENT_TOPICS.CALL_SCHEDULED).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("should have valid CallExecuted topic", () => {
    expect(EVENT_TOPICS.CALL_EXECUTED).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("should have valid ProposalCreated topic", () => {
    expect(EVENT_TOPICS.PROPOSAL_CREATED).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("should have valid ProposalQueued topic", () => {
    expect(EVENT_TOPICS.PROPOSAL_QUEUED).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("should have valid L2ToL1Tx topic", () => {
    expect(EVENT_TOPICS.L2_TO_L1_TX).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });
});
