/**
 * Tests for StageBuilder and Type Guards
 *
 * StageBuilder is the fluent API for constructing TrackedStage objects.
 * Type Guards provide runtime type checking for stage types.
 *
 * Note: Base utility functions (isConstitutional, findStage, areAllStagesComplete, etc.)
 * are tested in base-stages.test.ts to avoid duplication.
 */

import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";
import { StageBuilder } from "../src/stages/builder";
import { getBlockTimestamp } from "../src/stages/utils";
import { isStageType, getStageData } from "../src/types";

describe("StageBuilder", () => {
  describe("construction", () => {
    it("should create a stage with type and chain", () => {
      // #given - StageBuilder with type and chain
      // #when - building the stage
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").build();

      // #then - stage has correct type, chain, default status, and empty transactions
      expect(stage.type).toBe("PROPOSAL_CREATED");
      expect(stage.chain).toBe("arb1");
      expect(stage.status).toBe("NOT_STARTED");
      expect(stage.transactions).toEqual([]);
    });

    it("should set status", () => {
      // #given - StageBuilder with status set
      // #when - building the stage
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();

      // #then - stage has correct status
      expect(stage.status).toBe("PENDING");
    });

    it("should set data", () => {
      // #given - StageBuilder with data set
      // #when - building the stage
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .data({ proposalId: "12345", proposer: "0xabc" })
        .build();

      // #then - stage has correct data
      expect(stage.data).toEqual({ proposalId: "12345", proposer: "0xabc" });
    });

    it("should merge data from multiple calls", () => {
      // #given - StageBuilder with multiple data() calls
      // #when - building the stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .data({ operationId: "0x123", timelockAddress: "0xabc" })
        .data({ eta: 1700000000 })
        .data({ callScheduledData: [] })
        .build();

      // #then - all data is merged into a single object
      expect(stage.data).toMatchObject({
        operationId: "0x123",
        timelockAddress: "0xabc",
        eta: 1700000000,
        callScheduledData: [],
      });
    });

    it("should add transactions", () => {
      // #given - StageBuilder with multiple tx() calls
      // #when - building the stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "queued" })
        .tx("0xdef", 200, "arb1", 42161, { timestamp: 1700100000, description: "executed" })
        .build();

      // #then - both transactions are added in order
      expect(stage.transactions?.length).toBe(2);
      expect(stage.transactions?.[0].hash).toBe("0xabc");
      expect(stage.transactions?.[0].description).toBe("queued");
      expect(stage.transactions?.[1].hash).toBe("0xdef");
      expect(stage.transactions?.[1].description).toBe("executed");
    });

    it("should add transactions with optional logIndex", () => {
      // #given - StageBuilder with tx including logIndex
      // #when - building the stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .tx("0xabc", 100, "arb1", 42161, { logIndex: 5 })
        .build();

      // #then - transaction has logIndex set
      expect(stage.transactions?.[0].logIndex).toBe(5);
    });

    it("should add transactions with optional targetChain and targetChainId", () => {
      // #given - StageBuilder with cross-chain tx fields
      // #when - building the stage
      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .tx("0xabc", 100, "arb1", 42161, {
          targetChain: "ethereum",
          targetChainId: 1,
        })
        .build();

      // #then - transaction has target chain info
      expect(stage.transactions?.[0].targetChain).toBe("ethereum");
      expect(stage.transactions?.[0].targetChainId).toBe(1);
    });

    it("should add transactions with all optional fields", () => {
      // #given - StageBuilder with all optional tx fields
      // #when - building the stage
      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .tx("0xabc", 100, "arb1", 42161, {
          timestamp: 1700000000,
          logIndex: 3,
          targetChain: "ethereum",
          targetChainId: 1,
          description: "cross-chain message",
        })
        .build();

      // #then - all optional fields are set
      const tx = stage.transactions?.[0];
      expect(tx?.timestamp).toBe(1700000000);
      expect(tx?.logIndex).toBe(3);
      expect(tx?.targetChain).toBe("ethereum");
      expect(tx?.targetChainId).toBe(1);
      expect(tx?.description).toBe("cross-chain message");
    });

    it("should set timing", () => {
      // #given - StageBuilder with timing set
      // #when - building the stage
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .timing({
          startedAt: 1700000000,
          eta: 1700086400,
          delaySeconds: 86400,
        })
        .build();

      // #then - timing fields are set correctly
      expect(stage.timing?.startedAt).toBe(1700000000);
      expect(stage.timing?.eta).toBe(1700086400);
      expect(stage.timing?.delaySeconds).toBe(86400);
    });

    it("should set isStale flag", () => {
      // #given - StageBuilder with stale set
      // #when - building the stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").stale(true).build();

      // #then - isStale is set correctly
      expect(stage.isStale).toBe(true);
    });

    it("should not set isStale when false", () => {
      // #given - StageBuilder with stale set to false
      // #when - building the stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").stale(false).build();

      // #then - isStale is false
      expect(stage.isStale).toBe(false);
    });

    it("should return this from stale() for method chaining", () => {
      // #given - StageBuilder instance
      const builder = new StageBuilder("L2_TIMELOCK", "arb1");

      // #when - calling stale()
      const result = builder.stale(true);

      // #then - returns the same builder instance
      expect(result).toBe(builder);
    });

    it("should combine stale with data, timing, and status", () => {
      // #given - StageBuilder with all methods combined
      // #when - building the stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ operationId: "0xabc123", timelockAddress: "0xdef456" })
        .timing({ startedAt: 1700000000, eta: 1700086400, delaySeconds: 86400 })
        .stale(true)
        .tx("0x111", 100, "arb1", 42161, { timestamp: 1700000000 })
        .build();

      // #then - all properties are set correctly including isStale
      expect(stage.status).toBe("READY");
      expect(stage.data.operationId).toBe("0xabc123");
      expect(stage.timing?.eta).toBe(1700086400);
      expect(stage.isStale).toBe(true);
      expect(stage.transactions?.length).toBe(1);
    });

    it("should create SKIPPED status with skip method", () => {
      // #given - StageBuilder with skip() called
      // #when - building the stage
      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .skip("L2-only path, no L1 roundtrip needed")
        .build();

      // #then - status is SKIPPED
      expect(stage.status).toBe("SKIPPED");
    });

    it("should replace transactions array", () => {
      // #given - existing transactions array
      const existingTxs = [
        { hash: "0x111", blockNumber: 100, chain: "arb1" as const, chainId: 42161 },
        { hash: "0x222", blockNumber: 200, chain: "arb1" as const, chainId: 42161 },
      ];

      // #when - using transactions() to replace
      const stage = new StageBuilder("L2_TIMELOCK", "arb1").transactions(existingTxs).build();

      // #then - transactions array is replaced entirely
      expect(stage.transactions).toEqual(existingTxs);
    });
  });

  describe("chaining", () => {
    it("should support fluent API", () => {
      // #given - StageBuilder with multiple chained calls
      // #when - building the stage
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("COMPLETED")
        .data({ operationId: "0x123" })
        .tx("0xabc", 100, "arb1", 42161)
        .timing({ startedAt: 1700000000 })
        .build();

      // #then - all properties are correctly set
      expect(stage.type).toBe("L2_TIMELOCK");
      expect(stage.status).toBe("COMPLETED");
      expect(stage.data?.operationId).toBe("0x123");
      expect(stage.transactions?.length).toBe(1);
      expect(stage.timing?.startedAt).toBe(1700000000);
    });
  });
});

describe("getBlockTimestamp", () => {
  it("should return block timestamp from provider", async () => {
    // #given - mock provider that returns a block with timestamp
    const mockProvider = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000 }),
    } as unknown as ethers.providers.Provider;

    // #when - getting block timestamp
    const result = await getBlockTimestamp(12345, mockProvider);

    // #then - returns the timestamp and queries correct block
    expect(result).toBe(1700000000);
    expect(mockProvider.getBlock).toHaveBeenCalledWith(12345);
  });

  it("should throw error when block is not found", async () => {
    // #given - mock provider that returns null for block
    const mockProvider = {
      getBlock: vi.fn().mockResolvedValue(null),
    } as unknown as ethers.providers.Provider;

    // #when / #then - should throw with block number in message
    await expect(getBlockTimestamp(99999, mockProvider)).rejects.toThrow("Block 99999 not found");
  });

  it("should cache block timestamps within same provider", async () => {
    // #given - mock provider
    const mockProvider = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000 }),
    } as unknown as ethers.providers.Provider;

    // #when - call twice for same block
    const result1 = await getBlockTimestamp(12345, mockProvider);
    const result2 = await getBlockTimestamp(12345, mockProvider);

    // #then - should only call getBlock once (cached)
    expect(result1).toBe(1700000000);
    expect(result2).toBe(1700000000);
    expect(mockProvider.getBlock).toHaveBeenCalledTimes(1);
  });

  it("should cache different blocks independently", async () => {
    // #given - mock provider returning different timestamps per block
    const mockProvider = {
      getBlock: vi.fn().mockImplementation((blockNum) => {
        return Promise.resolve({ timestamp: 1700000000 + blockNum });
      }),
    } as unknown as ethers.providers.Provider;

    // #when - fetch different blocks
    const result1 = await getBlockTimestamp(100, mockProvider);
    const result2 = await getBlockTimestamp(200, mockProvider);
    const result3 = await getBlockTimestamp(100, mockProvider); // cached

    // #then - each unique block fetched once
    expect(result1).toBe(1700000100);
    expect(result2).toBe(1700000200);
    expect(result3).toBe(1700000100);
    expect(mockProvider.getBlock).toHaveBeenCalledTimes(2);
  });

  it("should use separate cache for different providers", async () => {
    // #given - two providers with same block returning different timestamps
    const mockProvider1 = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000001 }),
    } as unknown as ethers.providers.Provider;
    const mockProvider2 = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000002 }),
    } as unknown as ethers.providers.Provider;

    // #when - get same block from different providers
    const result1 = await getBlockTimestamp(12345, mockProvider1);
    const result2 = await getBlockTimestamp(12345, mockProvider2);

    // #then - each provider called once with correct result
    expect(result1).toBe(1700000001);
    expect(result2).toBe(1700000002);
    expect(mockProvider1.getBlock).toHaveBeenCalledTimes(1);
    expect(mockProvider2.getBlock).toHaveBeenCalledTimes(1);
  });
});

describe("Type Guards", () => {
  describe("isStageType", () => {
    it("should return true when stage type matches", () => {
      // #given - a PROPOSAL_CREATED stage
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "12345" })
        .build();

      // #when - checking if type matches
      // #then - returns true for matching type
      expect(isStageType(stage, "PROPOSAL_CREATED")).toBe(true);
    });

    it("should return false when stage type does not match", () => {
      // #given - a VOTING_ACTIVE stage
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();

      // #when - checking against different types
      // #then - returns false for non-matching types
      expect(isStageType(stage, "PROPOSAL_CREATED")).toBe(false);
      expect(isStageType(stage, "L2_TIMELOCK")).toBe(false);
    });

    it("should work as type narrowing in conditionals", () => {
      // #given - an L2_TIMELOCK stage with typed data
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ operationId: "0xabc", timelockAddress: "0x123" })
        .build();

      // #when - using isStageType as a type guard
      if (isStageType(stage, "L2_TIMELOCK")) {
        // #then - TypeScript knows stage.data has L2_TIMELOCK fields
        expect(stage.type).toBe("L2_TIMELOCK");
        expect(stage.data.operationId).toBe("0xabc");
      }
    });

    it("should return false for all non-matching types", () => {
      // #given - a RETRYABLE_EXECUTED stage
      const stage = new StageBuilder("RETRYABLE_EXECUTED", "arb1").status("COMPLETED").build();

      // #when - checking against all other types
      // #then - returns false for all
      expect(isStageType(stage, "PROPOSAL_CREATED")).toBe(false);
      expect(isStageType(stage, "VOTING_ACTIVE")).toBe(false);
      expect(isStageType(stage, "PROPOSAL_QUEUED")).toBe(false);
      expect(isStageType(stage, "L2_TIMELOCK")).toBe(false);
      expect(isStageType(stage, "L2_TO_L1_MESSAGE")).toBe(false);
      expect(isStageType(stage, "L1_TIMELOCK")).toBe(false);
    });
  });

  describe("getStageData", () => {
    it("should return typed data when stage type matches", () => {
      // #given - PROPOSAL_CREATED stage with typed data
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "12345", proposer: "0xabc" })
        .build();

      // #when - getting data with matching type
      const data = getStageData(stage, "PROPOSAL_CREATED");

      // #then - returns the typed data
      expect(data).not.toBeNull();
      expect(data?.proposalId).toBe("12345");
    });

    it("should return null when stage type does not match", () => {
      // #given - VOTING_ACTIVE stage
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();

      // #when - getting data with non-matching type
      const data = getStageData(stage, "PROPOSAL_CREATED");

      // #then - returns null
      expect(data).toBeNull();
    });

    it("should return L2_TIMELOCK data correctly", () => {
      // #given - L2_TIMELOCK stage with timelock data
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ operationId: "0xdef456", timelockAddress: "0x789" })
        .build();

      // #when - getting data with matching type
      const data = getStageData(stage, "L2_TIMELOCK");

      // #then - returns L2_TIMELOCK typed data
      expect(data).not.toBeNull();
      expect(data?.operationId).toBe("0xdef456");
      expect(data?.timelockAddress).toBe("0x789");
    });

    it("should return null when checking wrong type", () => {
      // #given - L1_TIMELOCK stage
      const stage = new StageBuilder("L1_TIMELOCK", "ethereum")
        .status("PENDING")
        .data({ operationId: "0x123" })
        .build();

      // #when - getting data with wrong types
      // #then - returns null for both
      expect(getStageData(stage, "L2_TIMELOCK")).toBeNull();
      expect(getStageData(stage, "PROPOSAL_CREATED")).toBeNull();
    });
  });
});
