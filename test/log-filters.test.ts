/**
 * Tests for Log Filters and Log Search utilities
 */

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  filterLogs,
  parseLogsSafe,
  findAndParseLogs,
  findFirstLog,
  countLogsByAddress,
} from "../src/utils/log-filters";
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
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: ["0x" + "a".repeat(64)] }),
        createMockLog({ topics: [targetTopic] }),
        createMockLog({ topics: ["0x" + "b".repeat(64)] }),
        createMockLog({ topics: [targetTopic] }),
      ];

      const filtered = filterLogs(logs, { topic: targetTopic });

      expect(filtered.length).toBe(2);
      expect(filtered.every((log) => log.topics[0] === targetTopic)).toBe(true);
    });

    it("should filter logs by address", () => {
      const targetAddress = "0x2222222222222222222222222222222222222222";
      const logs = [
        createMockLog({ address: "0x1111111111111111111111111111111111111111" }),
        createMockLog({ address: targetAddress }),
        createMockLog({ address: "0x3333333333333333333333333333333333333333" }),
      ];

      const filtered = filterLogs(logs, { address: targetAddress });

      expect(filtered.length).toBe(1);
      expect(filtered[0].address).toBe(targetAddress);
    });

    it("should be case-insensitive for address", () => {
      const logs = [createMockLog({ address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })];

      const filtered = filterLogs(logs, {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });

      expect(filtered.length).toBe(1);
    });

    it("should filter by both topic and address", () => {
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

      const filtered = filterLogs(logs, { topic: targetTopic, address: targetAddress });

      expect(filtered.length).toBe(1);
      expect(filtered[0].topics[0]).toBe(targetTopic);
      expect(filtered[0].address).toBe(targetAddress);
    });

    it("should return all logs when no filter provided", () => {
      const logs = [createMockLog(), createMockLog(), createMockLog()];

      const filtered = filterLogs(logs, {});

      expect(filtered.length).toBe(3);
    });

    it("should return empty array for empty input", () => {
      const filtered = filterLogs([], { topic: "0x" + "a".repeat(64) });
      expect(filtered).toEqual([]);
    });
  });

  describe("parseLogsSafe", () => {
    it("should parse logs and return results", () => {
      const logs = [
        createMockLog({ data: "0x0001" }),
        createMockLog({ data: "0x0002" }),
        createMockLog({ data: "0x0003" }),
      ];

      const results = parseLogsSafe(logs, (log) => parseInt(log.data, 16));

      expect(results).toEqual([1, 2, 3]);
    });

    it("should skip logs that throw errors", () => {
      const logs = [
        createMockLog({ data: "0x0001" }),
        createMockLog({ data: "invalid" }),
        createMockLog({ data: "0x0003" }),
      ];

      const results = parseLogsSafe(logs, (log) => {
        if (log.data === "invalid") {
          throw new Error("Parse error");
        }
        return parseInt(log.data, 16);
      });

      expect(results).toEqual([1, 3]);
    });

    it("should skip logs where parser returns null", () => {
      const logs = [
        createMockLog({ data: "0x0001" }),
        createMockLog({ data: "0x0000" }),
        createMockLog({ data: "0x0003" }),
      ];

      const results = parseLogsSafe(logs, (log) => {
        const val = parseInt(log.data, 16);
        return val === 0 ? null : val;
      });

      expect(results).toEqual([1, 3]);
    });

    it("should return empty array when all logs fail", () => {
      const logs = [createMockLog(), createMockLog()];

      const results = parseLogsSafe(logs, () => {
        throw new Error("Always fails");
      });

      expect(results).toEqual([]);
    });

    it("should return empty array for empty input", () => {
      const results = parseLogsSafe([], (log) => log.data);
      expect(results).toEqual([]);
    });
  });

  describe("findAndParseLogs", () => {
    it("should filter and parse logs", () => {
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: [targetTopic], data: "0x0001" }),
        createMockLog({ topics: ["0x" + "e".repeat(64)], data: "0x0002" }),
        createMockLog({ topics: [targetTopic], data: "0x0003" }),
      ];

      const results = findAndParseLogs(logs, { topic: targetTopic }, (log) =>
        parseInt(log.data, 16)
      );

      expect(results).toEqual([1, 3]);
    });

    it("should handle empty result", () => {
      const logs = [createMockLog({ topics: ["0x" + "a".repeat(64)] })];

      const results = findAndParseLogs(logs, { topic: "0x" + "b".repeat(64) }, (log) =>
        parseInt(log.data, 16)
      );

      expect(results).toEqual([]);
    });
  });

  describe("findFirstLog", () => {
    it("should return first matching log", () => {
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: [targetTopic], data: "0x0001" }),
        createMockLog({ topics: [targetTopic], data: "0x0002" }),
      ];

      const result = findFirstLog(logs, { topic: targetTopic }, (log) => parseInt(log.data, 16));

      expect(result).toBe(1);
    });

    it("should return null when no match", () => {
      const logs = [createMockLog({ topics: ["0x" + "a".repeat(64)] })];

      const result = findFirstLog(logs, { topic: "0x" + "b".repeat(64) }, (log) =>
        parseInt(log.data, 16)
      );

      expect(result).toBeNull();
    });

    it("should filter by address", () => {
      const targetAddress = "0x1111111111111111111111111111111111111111";
      const otherAddress = "0x2222222222222222222222222222222222222222";
      const targetTopic = "0x" + "d".repeat(64);

      const logs = [
        createMockLog({ address: otherAddress, topics: [targetTopic], data: "0x0001" }),
        createMockLog({ address: targetAddress, topics: [targetTopic], data: "0x0002" }),
      ];

      const result = findFirstLog(logs, { topic: targetTopic, address: targetAddress }, (log) =>
        parseInt(log.data, 16)
      );

      expect(result).toBe(2);
    });

    it("should return null when address does not match", () => {
      const targetAddress = "0x1111111111111111111111111111111111111111";
      const otherAddress = "0x2222222222222222222222222222222222222222";
      const targetTopic = "0x" + "d".repeat(64);

      const logs = [
        createMockLog({ address: otherAddress, topics: [targetTopic], data: "0x0001" }),
      ];

      const result = findFirstLog(logs, { topic: targetTopic, address: targetAddress }, (log) =>
        parseInt(log.data, 16)
      );

      expect(result).toBeNull();
    });

    it("should handle parser returning null", () => {
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: [targetTopic], data: "0x0001" }),
        createMockLog({ topics: [targetTopic], data: "0x0002" }),
      ];

      const result = findFirstLog(logs, { topic: targetTopic }, (log) => {
        // Only return value for second log
        if (log.data === "0x0002") return parseInt(log.data, 16);
        return null;
      });

      expect(result).toBe(2);
    });

    it("should handle parser throwing error", () => {
      const targetTopic = "0x" + "d".repeat(64);
      const logs = [
        createMockLog({ topics: [targetTopic], data: "invalid" }),
        createMockLog({ topics: [targetTopic], data: "0x0002" }),
      ];

      const result = findFirstLog(logs, { topic: targetTopic }, (log) => {
        if (log.data === "invalid") throw new Error("Parse error");
        return parseInt(log.data, 16);
      });

      expect(result).toBe(2);
    });
  });
});

describe("countLogsByAddress", () => {
  it("should count logs by address", () => {
    const addr1 = "0x1111111111111111111111111111111111111111";
    const addr2 = "0x2222222222222222222222222222222222222222";
    const logs = [
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr2 }),
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr2 }),
    ];

    const counts = countLogsByAddress(logs, {});

    expect(counts.get(addr1.toLowerCase())).toBe(3);
    expect(counts.get(addr2.toLowerCase())).toBe(2);
  });

  it("should filter by topic before counting", () => {
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

    const counts = countLogsByAddress(logs, { topic: targetTopic });

    expect(counts.get(addr1.toLowerCase())).toBe(2); // Only 2 with target topic
    expect(counts.get(addr2.toLowerCase())).toBe(1);
  });

  it("should return lowercase addresses in the map", () => {
    const upperAddr = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const logs = [createMockLog({ address: upperAddr })];

    const counts = countLogsByAddress(logs, {});

    expect(counts.has(upperAddr.toLowerCase())).toBe(true);
    expect(counts.has(upperAddr)).toBe(false);
  });

  it("should return empty map for empty logs", () => {
    const counts = countLogsByAddress([], {});
    expect(counts.size).toBe(0);
  });

  it("should return empty map when no logs match topic", () => {
    const logs = [
      createMockLog({ topics: ["0x" + "a".repeat(64)] }),
      createMockLog({ topics: ["0x" + "b".repeat(64)] }),
    ];

    const counts = countLogsByAddress(logs, { topic: "0x" + "c".repeat(64) });
    expect(counts.size).toBe(0);
  });

  it("should count all logs when no topic filter provided", () => {
    const addr1 = "0x1111111111111111111111111111111111111111";
    const logs = [
      createMockLog({ address: addr1, topics: ["0x" + "a".repeat(64)] }),
      createMockLog({ address: addr1, topics: ["0x" + "b".repeat(64)] }),
      createMockLog({ address: addr1, topics: ["0x" + "c".repeat(64)] }),
    ];

    const counts = countLogsByAddress(logs, {});

    // All 3 logs should be counted since there's no topic filter
    expect(counts.get(addr1.toLowerCase())).toBe(3);
  });
});

describe("countLogsByAddress", () => {
  it("should count logs by address", () => {
    const addr1 = "0x1111111111111111111111111111111111111111";
    const addr2 = "0x2222222222222222222222222222222222222222";
    const logs = [
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr2 }),
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr1 }),
      createMockLog({ address: addr2 }),
    ];

    const counts = countLogsByAddress(logs, {});

    expect(counts.get(addr1.toLowerCase())).toBe(3);
    expect(counts.get(addr2.toLowerCase())).toBe(2);
  });

  it("should filter by topic before counting", () => {
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

    const counts = countLogsByAddress(logs, { topic: targetTopic });

    expect(counts.get(addr1.toLowerCase())).toBe(2); // Only 2 with target topic
    expect(counts.get(addr2.toLowerCase())).toBe(1);
  });

  it("should return lowercase addresses in the map", () => {
    const upperAddr = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const logs = [createMockLog({ address: upperAddr })];

    const counts = countLogsByAddress(logs, {});

    expect(counts.has(upperAddr.toLowerCase())).toBe(true);
    expect(counts.has(upperAddr)).toBe(false);
  });

  it("should return empty map for empty logs", () => {
    const counts = countLogsByAddress([], {});
    expect(counts.size).toBe(0);
  });

  it("should return empty map when no logs match topic", () => {
    const logs = [
      createMockLog({ topics: ["0x" + "a".repeat(64)] }),
      createMockLog({ topics: ["0x" + "b".repeat(64)] }),
    ];

    const counts = countLogsByAddress(logs, { topic: "0x" + "c".repeat(64) });
    expect(counts.size).toBe(0);
  });

  it("should count all logs when no topic filter provided", () => {
    const addr1 = "0x1111111111111111111111111111111111111111";
    const logs = [
      createMockLog({ address: addr1, topics: ["0x" + "a".repeat(64)] }),
      createMockLog({ address: addr1, topics: ["0x" + "b".repeat(64)] }),
      createMockLog({ address: addr1, topics: ["0x" + "c".repeat(64)] }),
    ];

    const counts = countLogsByAddress(logs, {});

    // All 3 logs should be counted since there's no topic filter
    expect(counts.get(addr1.toLowerCase())).toBe(3);
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
