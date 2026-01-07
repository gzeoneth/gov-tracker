/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for utility functions
 *
 * Tests for:
 * - Operation ID computation (hashOperation, hashOperationBatch)
 * - Salt derivation (saltFromDescription, saltForSecurityCouncil)
 * - Timing utilities (calculateEta, etc)
 * - RPC utilities (queryWithRetry)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers, BigNumber } from "ethers";

// Public API imports (testing exports work correctly)
import {
  // Salt utilities
  saltFromDescription,

  // Operation ID utilities
  validateSalt,

  // Timing utilities
  calculateRemainingSeconds,
} from "../src";

// Internal imports (for testing internal functions)
import { hashOperation, hashOperationBatch } from "../src/utils/operation-id";
import { isValidOperationId } from "./helpers/discovery-helpers";
import { queryWithRetry, delay, isRetryableError } from "../src/utils/rpc-utils";

describe("Operation ID Utilities", () => {
  beforeEach(() => {
    // No-op
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("hashOperation", () => {
    it("should compute deterministic operation ID", async () => {
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from("1000000000000000000"),
        data: "0xabcdef00",
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.id("test proposal description"),
      };

      const id1 = hashOperation(params);
      const id2 = hashOperation(params);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should produce different IDs for different salts", async () => {
      const baseParams = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
      };

      const id1 = hashOperation({ ...baseParams, salt: ethers.constants.HashZero });
      const id2 = hashOperation({ ...baseParams, salt: ethers.utils.id("description") });

      expect(id1).not.toBe(id2);
    });

    it("should produce different IDs for different targets", async () => {
      const baseParams = {
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      const id1 = hashOperation({
        ...baseParams,
        target: "0x1234567890123456789012345678901234567890",
      });
      const id2 = hashOperation({
        ...baseParams,
        target: "0x0987654321098765432109876543210987654321",
      });

      expect(id1).not.toBe(id2);
    });
  });

  describe("hashOperationBatch", () => {
    it("should compute deterministic batch operation ID", async () => {
      const params = {
        targets: [
          "0x1234567890123456789012345678901234567890",
          "0x0987654321098765432109876543210987654321",
        ],
        values: [BigNumber.from(0), BigNumber.from(0)],
        payloads: ["0xabcd", "0xef01"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      const id1 = hashOperationBatch(params);
      const id2 = hashOperationBatch(params);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should produce different IDs for different target order", async () => {
      const params1 = {
        targets: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
        ],
        values: [BigNumber.from(0), BigNumber.from(0)],
        payloads: ["0x", "0x"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };
      const params2 = {
        targets: [
          "0x2222222222222222222222222222222222222222",
          "0x1111111111111111111111111111111111111111",
        ],
        values: [BigNumber.from(0), BigNumber.from(0)],
        payloads: ["0x", "0x"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      const id1 = hashOperationBatch(params1);
      const id2 = hashOperationBatch(params2);

      expect(id1).not.toBe(id2);
    });
  });

  describe("saltFromDescription", () => {
    it("should compute salt from description", () => {
      const description = "AIP-1: A test proposal";
      const salt = saltFromDescription(description);

      expect(salt).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(salt).toBe(ethers.utils.id(description));
    });

    it("should be deterministic", () => {
      const description = "Another test";
      expect(saltFromDescription(description)).toBe(saltFromDescription(description));
    });
  });

  describe("validateSalt", () => {
    it("should return true for matching salt", async () => {
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      const operationId = hashOperation(params);

      expect(validateSalt(operationId, params)).toBe(true);
    });

    it("should return false for non-matching salt", async () => {
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      const wrongOperationId = "0x0000000000000000000000000000000000000000000000000000000000000001";

      expect(validateSalt(wrongOperationId, params)).toBe(false);
    });
  });

  describe("isValidOperationId", () => {
    it("should validate correct operation ID format", () => {
      // HashZero is NOT valid (zero bytes32 indicates no operation)
      expect(isValidOperationId(ethers.constants.HashZero)).toBe(false);
      expect(
        isValidOperationId("0xaf607f045944b4a9caf0b7e13f0fca93facbf22e389b23ea6cfee07afe452016")
      ).toBe(true);
    });

    it("should reject invalid formats", () => {
      expect(isValidOperationId("")).toBe(false);
      expect(isValidOperationId("0x")).toBe(false);
      expect(isValidOperationId("not-hex")).toBe(false);
      expect(isValidOperationId("0x123")).toBe(false); // Too short
    });
  });
});

describe("Timing Utilities", () => {
  describe("calculateRemainingSeconds", () => {
    it("should calculate positive remaining time", () => {
      const targetBlock = 1000;
      const currentBlock = 500;
      const blockTime = 12;

      const remaining = calculateRemainingSeconds(targetBlock, currentBlock, blockTime);

      expect(remaining).toBe((1000 - 500) * 12);
    });

    it("should return 0 for past deadlines", () => {
      const targetBlock = 500;
      const currentBlock = 1000;
      const blockTime = 12;

      const remaining = calculateRemainingSeconds(targetBlock, currentBlock, blockTime);

      expect(remaining).toBe(0);
    });
  });
});

describe("RPC Utilities", () => {
  describe("delay", () => {
    it("should delay for specified time", async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("queryWithRetry", () => {
    it("should return result on first try success", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      const result = await queryWithRetry(fn, {
        maxRetries: 3,
        initialDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1,
      });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockResolvedValue("success");

      const result = await queryWithRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2,
      });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should throw after max retries for retryable errors", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));

      await expect(
        queryWithRetry(fn, { maxRetries: 2, initialDelay: 10, backoffMultiplier: 1, maxDelay: 10 })
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should not retry non-retryable errors", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("invalid address"));

      await expect(
        queryWithRetry(fn, { maxRetries: 3, initialDelay: 10, backoffMultiplier: 1, maxDelay: 10 })
      ).rejects.toThrow("RPC query failed");

      expect(fn).toHaveBeenCalledTimes(1); // No retries for non-retryable errors
    });
  });

  describe("isRetryableError", () => {
    it("should identify rate limit errors", () => {
      expect(isRetryableError(new Error("rate limit exceeded"))).toBe(true);
      expect(isRetryableError(new Error("Too Many Requests"))).toBe(true);
    });

    it("should identify timeout errors", () => {
      expect(isRetryableError(new Error("timeout"))).toBe(true);
      expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
    });

    it("should not retry non-retryable errors", () => {
      expect(isRetryableError(new Error("invalid address"))).toBe(false);
      expect(isRetryableError(new Error("execution reverted"))).toBe(false);
    });
  });
});

// Timing utility tests - test-only helpers from test/helpers
import {
  estimateBlockFromTimestamp,
  hasDeadlinePassed,
  calculateChallengeEndBlock,
  isChallengeComplete,
  isTimelockReady,
  calculateVotingEndBlock,
  getVotingSearchRange,
  parseEstimatedDurationRange,
} from "./helpers/timing-helpers";
import { TIMING } from "../src/constants";

describe("Timing Helpers (Test-Only)", () => {
  describe("estimateBlockFromTimestamp", () => {
    it("should estimate future block number", () => {
      const currentBlock = 1000;
      const currentTimestamp = 1700000000;
      const targetTimestamp = 1700001200; // 1200 seconds ahead
      const blockTime = 12;

      const result = estimateBlockFromTimestamp(
        targetTimestamp,
        currentBlock,
        currentTimestamp,
        blockTime
      );

      expect(result).toBe(1000 + 100); // 100 blocks ahead
    });

    it("should estimate past block number", () => {
      const result = estimateBlockFromTimestamp(1700000000 - 1200, 1000, 1700000000, 12);

      expect(result).toBe(900);
    });
  });

  describe("hasDeadlinePassed", () => {
    it("should return true when deadline passed", () => {
      expect(hasDeadlinePassed(100, 200)).toBe(true);
    });

    it("should return true when at deadline", () => {
      expect(hasDeadlinePassed(100, 100)).toBe(true);
    });

    it("should return false when before deadline", () => {
      expect(hasDeadlinePassed(200, 100)).toBe(false);
    });

    it("should handle BigNumber deadline", () => {
      expect(hasDeadlinePassed(BigNumber.from(100), 200)).toBe(true);
      expect(hasDeadlinePassed(BigNumber.from(300), 200)).toBe(false);
    });
  });

  describe("calculateChallengeEndBlock", () => {
    it("should add challenge period blocks", () => {
      const result = calculateChallengeEndBlock(1000);
      expect(result).toBe(1000 + TIMING.CHALLENGE_PERIOD_BLOCKS_L1);
    });
  });

  describe("isChallengeComplete", () => {
    it("should return true when challenge complete", () => {
      expect(isChallengeComplete(100, 200)).toBe(true);
      expect(isChallengeComplete(100, 100)).toBe(true);
    });

    it("should return false when challenge pending", () => {
      expect(isChallengeComplete(200, 100)).toBe(false);
    });
  });

  describe("isTimelockReady", () => {
    it("should return true when past ETA", () => {
      expect(isTimelockReady(1700000000, 1700000001)).toBe(true);
    });

    it("should return true when at ETA", () => {
      expect(isTimelockReady(1700000000, 1700000000)).toBe(true);
    });

    it("should return false when before ETA", () => {
      expect(isTimelockReady(1700000000, 1699999999)).toBe(false);
    });
  });

  describe("calculateVotingEndBlock", () => {
    it("should add voting period to start block", () => {
      const start = BigNumber.from(1000);
      const period = BigNumber.from(50400);

      const result = calculateVotingEndBlock(start, period);

      expect(result.toNumber()).toBe(51400);
    });

    it("should use extension if provided and positive", () => {
      const start = BigNumber.from(1000);
      const period = BigNumber.from(50400);
      const extension = BigNumber.from(60000);

      const result = calculateVotingEndBlock(start, period, extension);

      expect(result.toNumber()).toBe(60000);
    });

    it("should ignore zero extension", () => {
      const start = BigNumber.from(1000);
      const period = BigNumber.from(50400);
      const extension = BigNumber.from(0);

      const result = calculateVotingEndBlock(start, period, extension);

      expect(result.toNumber()).toBe(51400);
    });
  });

  describe("getVotingSearchRange", () => {
    it("should return range from creation to max voting period", () => {
      const result = getVotingSearchRange(1000, 10000000);

      expect(result.fromBlock).toBe(1000);
      expect(result.toBlock).toBe(1000 + TIMING.MAX_VOTING_PERIOD_BLOCKS_L2);
    });

    it("should cap at current block", () => {
      const result = getVotingSearchRange(1000, 2000);

      expect(result.fromBlock).toBe(1000);
      expect(result.toBlock).toBe(2000);
    });
  });

  describe("parseEstimatedDurationRange", () => {
    it("should parse range format (14-16 days)", () => {
      const result = parseEstimatedDurationRange("14-16 days");
      expect(result).toEqual({ min: 14, max: 16 });
    });

    it("should parse single value (3 days)", () => {
      const result = parseEstimatedDurationRange("3 days");
      expect(result).toEqual({ min: 3, max: 3 });
    });

    it("should handle tilde prefix (~3 days)", () => {
      const result = parseEstimatedDurationRange("~3 days");
      expect(result).toEqual({ min: 3, max: 3 });
    });

    it("should handle singular day", () => {
      const result = parseEstimatedDurationRange("1 day");
      expect(result).toEqual({ min: 1, max: 1 });
    });

    it("should return zeros for undefined", () => {
      const result = parseEstimatedDurationRange(undefined);
      expect(result).toEqual({ min: 0, max: 0 });
    });

    it("should return zeros for invalid format", () => {
      const result = parseEstimatedDurationRange("invalid");
      expect(result).toEqual({ min: 0, max: 0 });
    });
  });
});

// Stage Metadata Tests
import {
  getStageMetadata,
  getAllStageMetadata,
  getActionableStages,
  formatStageTitle,
  getTotalExpectedDuration,
} from "../src/utils/stage-metadata";

describe("Stage Metadata Utilities", () => {
  describe("getStageMetadata", () => {
    it("should return metadata for PROPOSAL_CREATED", () => {
      const meta = getStageMetadata("PROPOSAL_CREATED");

      expect(meta.title).toBe("Proposal Created");
      expect(meta.description).toBeDefined();
      expect(meta.chain).toBe("L2");
      expect(typeof meta.estimatedDays).toBe("number");
    });

    it("should return metadata for L1 stages", () => {
      const meta = getStageMetadata("L1_TIMELOCK");

      expect(meta.chain).toBe("L1");
      expect(meta.title).toBeDefined();
    });

    it("should return metadata for all stage types", () => {
      const stageTypes: StageType[] = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ];

      for (const stageType of stageTypes) {
        const meta = getStageMetadata(stageType);
        expect(meta.title).toBeDefined();
        expect(meta.description).toBeDefined();
        expect(["L1", "L2", "NOVA", "CROSS_CHAIN"]).toContain(meta.chain);
      }
    });
  });

  describe("getAllStageMetadata", () => {
    it("should return metadata for all stages", () => {
      const allMeta = getAllStageMetadata();

      expect(Object.keys(allMeta).length).toBe(7);
      expect(allMeta.PROPOSAL_CREATED).toBeDefined();
      expect(allMeta.RETRYABLE_EXECUTED).toBeDefined();
    });

    it("should include correct chain types", () => {
      const allMeta = getAllStageMetadata();

      expect(allMeta.VOTING_ACTIVE.chain).toBe("L2");
      expect(allMeta.L1_TIMELOCK.chain).toBe("L1");
    });
  });

  describe("getActionableStages", () => {
    it("should return stages that require action", () => {
      const actionable = getActionableStages();

      expect(actionable.length).toBeGreaterThan(0);
      // Actionable stages are those with requiresAction: true
      expect(actionable).toContain("L2_TIMELOCK");
      expect(actionable).toContain("L1_TIMELOCK");
    });

    it("should not include non-actionable stages", () => {
      const actionable = getActionableStages();

      // PROPOSAL_CREATED is not actionable (it's a starting point)
      expect(actionable).not.toContain("PROPOSAL_CREATED");
    });
  });

  describe("formatStageTitle", () => {
    it("should format stage title correctly", () => {
      expect(formatStageTitle("L2_TIMELOCK")).toBe("L2 Timelock");
      expect(formatStageTitle("VOTING_ACTIVE")).toBe("Voting Active");
      expect(formatStageTitle("RETRYABLE_EXECUTED")).toBe("Retryable Executed");
    });
  });

  describe("getTotalExpectedDuration", () => {
    it("should return total duration in days", () => {
      const total = getTotalExpectedDuration();

      expect(typeof total).toBe("number");
      expect(total).toBeGreaterThan(0);
      // Total should be sum of all stage durations (at least 30+ days for full cycle)
      expect(total).toBeGreaterThanOrEqual(30);
    });
  });
});

// Tracker unit tests (no RPC required)
import { createTracker } from "../src";

describe("Tracker Creation (Unit Tests)", () => {
  describe("createTracker", () => {
    it("should throw if l1Provider missing", () => {
      expect(() =>
        createTracker({
          l2Provider: {} as ethers.providers.Provider,
          novaProvider: {} as ethers.providers.Provider,
          l1Provider: undefined,
        } as any)
      ).toThrow("l1Provider is required");
    });

    it("should create tracker with valid providers", () => {
      const mockL1Provider = { getNetwork: () => Promise.resolve({ chainId: 1 }) };
      const mockL2Provider = { getNetwork: () => Promise.resolve({ chainId: 42161 }) };
      const mockNovaProvider = { getNetwork: () => Promise.resolve({ chainId: 42170 }) };

      const tracker = createTracker({
        l1Provider: mockL1Provider as any,
        l2Provider: mockL2Provider as any,
        novaProvider: mockNovaProvider as any,
      });

      expect(tracker).toBeDefined();
      expect(typeof tracker.trackByTxHash).toBe("function");
      expect(typeof tracker.trackFromCheckpoint).toBe("function");
      expect(typeof tracker.prepareTransaction).toBe("function");
    });
  });
});

// Import StageType for use in tests
import type { StageType, StageTransaction } from "../src/types";

// URL utility tests
import { chainTypeToId, getExplorerUrl, getTxUrl, getStageTransactionUrl } from "../src/utils/urls";
import { CHAIN_IDS } from "../src/constants";

describe("URL Utilities", () => {
  describe("chainTypeToId", () => {
    it("should return Ethereum chain ID for L1", () => {
      expect(chainTypeToId("L1")).toBe(CHAIN_IDS.ETHEREUM);
    });

    it("should return Arbitrum One chain ID for L2", () => {
      expect(chainTypeToId("L2")).toBe(CHAIN_IDS.ARB_ONE);
    });

    it("should return Nova chain ID for NOVA", () => {
      expect(chainTypeToId("NOVA")).toBe(CHAIN_IDS.NOVA);
    });
  });

  describe("getExplorerUrl", () => {
    it("should return Etherscan URL for Ethereum", () => {
      const url = getExplorerUrl(1, "tx", "0x123");
      expect(url).toBe("https://etherscan.io/tx/0x123");
    });

    it("should return Arbiscan URL for Arbitrum One", () => {
      const url = getExplorerUrl(CHAIN_IDS.ARB_ONE, "tx", "0x456");
      expect(url).toBe("https://arbiscan.io/tx/0x456");
    });

    it("should return Nova Arbiscan URL for Nova", () => {
      const url = getExplorerUrl(CHAIN_IDS.NOVA, "address", "0x789");
      expect(url).toBe("https://nova.arbiscan.io/address/0x789");
    });

    it("should default to Etherscan for unknown chain", () => {
      const url = getExplorerUrl(999, "tx", "0xabc");
      expect(url).toBe("https://etherscan.io/tx/0xabc");
    });
  });

  describe("getTxUrl", () => {
    it("should return transaction URL", () => {
      const url = getTxUrl(1, "0x123");
      expect(url).toBe("https://etherscan.io/tx/0x123");
    });
  });

  describe("getStageTransactionUrl", () => {
    it("should return URL for L1 transaction", () => {
      const tx: StageTransaction = {
        hash: "0x123",
        blockNumber: 100,
        chain: "L1",
      };
      const url = getStageTransactionUrl(tx);
      expect(url).toBe("https://etherscan.io/tx/0x123");
    });

    it("should return URL for L2 transaction", () => {
      const tx: StageTransaction = {
        hash: "0x456",
        blockNumber: 200,
        chain: "L2",
      };
      const url = getStageTransactionUrl(tx);
      expect(url).toBe("https://arbiscan.io/tx/0x456");
    });

    it("should return URL for Nova transaction", () => {
      const tx: StageTransaction = {
        hash: "0x789",
        blockNumber: 300,
        chain: "NOVA",
      };
      const url = getStageTransactionUrl(tx);
      expect(url).toBe("https://nova.arbiscan.io/tx/0x789");
    });
  });
});
