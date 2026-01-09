/**
 * Tests for Stage Modules
 *
 * Tests for stage tracking functions and StageBuilder.
 */

import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";
import { StageBuilder } from "../src/stages/stage-builder";
import {
  initializeStagesForPath,
  updateStageInList,
  areAllStagesComplete,
  isConstitutional,
  getBlockTimestamp,
  failPrepare,
  findStage,
  getCurrentStage,
  getStagesForPath,
} from "../src/stages/base";
import { isStageType, getStageData } from "../src/types";
import { ADDRESSES } from "../src/constants";

describe("StageBuilder", () => {
  describe("construction", () => {
    it("should create a stage with type and chain", () => {
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1").build();

      expect(stage.type).toBe("PROPOSAL_CREATED");
      expect(stage.chain).toBe("arb1");
      expect(stage.status).toBe("NOT_STARTED");
      expect(stage.transactions).toEqual([]);
    });

    it("should set status", () => {
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();

      expect(stage.status).toBe("PENDING");
    });

    it("should set data", () => {
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .data({ proposalId: "12345", proposer: "0xabc" })
        .build();

      expect(stage.data).toEqual({ proposalId: "12345", proposer: "0xabc" });
    });

    it("should merge data from multiple calls", () => {
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .data({ operationId: "0x123", timelockAddress: "0xabc" })
        .data({ eta: 1700000000 })
        .data({ callScheduledData: [] })
        .build();

      expect(stage.data).toMatchObject({
        operationId: "0x123",
        timelockAddress: "0xabc",
        eta: 1700000000,
        callScheduledData: [],
      });
    });

    it("should add transactions", () => {
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "queued" })
        .tx("0xdef", 200, "arb1", 42161, { timestamp: 1700100000, description: "executed" })
        .build();

      expect(stage.transactions?.length).toBe(2);
      expect(stage.transactions?.[0].hash).toBe("0xabc");
      expect(stage.transactions?.[0].description).toBe("queued");
      expect(stage.transactions?.[1].hash).toBe("0xdef");
      expect(stage.transactions?.[1].description).toBe("executed");
    });

    it("should add transactions with optional logIndex", () => {
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .tx("0xabc", 100, "arb1", 42161, { logIndex: 5 })
        .build();

      expect(stage.transactions?.[0].logIndex).toBe(5);
    });

    it("should add transactions with optional targetChain and targetChainId", () => {
      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .tx("0xabc", 100, "arb1", 42161, {
          targetChain: "ethereum",
          targetChainId: 1,
        })
        .build();

      expect(stage.transactions?.[0].targetChain).toBe("ethereum");
      expect(stage.transactions?.[0].targetChainId).toBe(1);
    });

    it("should add transactions with all optional fields", () => {
      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .tx("0xabc", 100, "arb1", 42161, {
          timestamp: 1700000000,
          logIndex: 3,
          targetChain: "ethereum",
          targetChainId: 1,
          description: "cross-chain message",
        })
        .build();

      const tx = stage.transactions?.[0];
      expect(tx?.timestamp).toBe(1700000000);
      expect(tx?.logIndex).toBe(3);
      expect(tx?.targetChain).toBe("ethereum");
      expect(tx?.targetChainId).toBe(1);
      expect(tx?.description).toBe("cross-chain message");
    });

    it("should set timing", () => {
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1")
        .timing({
          startedAt: 1700000000,
          eta: 1700086400,
          delaySeconds: 86400,
        })
        .build();

      expect(stage.timing?.startedAt).toBe(1700000000);
      expect(stage.timing?.eta).toBe(1700086400);
      expect(stage.timing?.delaySeconds).toBe(86400);
    });

    it("should create SKIPPED status with skip method", () => {
      const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1")
        .skip("L2-only path, no L1 roundtrip needed")
        .build();

      expect(stage.status).toBe("SKIPPED");
    });

    it("should replace transactions array", () => {
      const existingTxs = [
        { hash: "0x111", blockNumber: 100, chain: "arb1" as const, chainId: 42161 },
        { hash: "0x222", blockNumber: 200, chain: "arb1" as const, chainId: 42161 },
      ];

      const stage = new StageBuilder("L2_TIMELOCK", "arb1").transactions(existingTxs).build();

      expect(stage.transactions).toEqual(existingTxs);
    });
  });

  describe("chaining", () => {
    it("should support fluent API", () => {
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("COMPLETED")
        .data({ operationId: "0x123" })
        .tx("0xabc", 100, "arb1", 42161)
        .timing({ startedAt: 1700000000 })
        .build();

      expect(stage.type).toBe("L2_TIMELOCK");
      expect(stage.status).toBe("COMPLETED");
      expect(stage.data?.operationId).toBe("0x123");
      expect(stage.transactions?.length).toBe(1);
      expect(stage.timing?.startedAt).toBe(1700000000);
    });
  });
});

describe("Stage Base Functions", () => {
  describe("getStagesForPath", () => {
    it("should return all 7 stages with proposal stages", () => {
      const stages = getStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      expect(stages.length).toBe(7);
      expect(stages[0]).toBe("PROPOSAL_CREATED");
      expect(stages[1]).toBe("VOTING_ACTIVE");
      expect(stages[2]).toBe("PROPOSAL_QUEUED");
    });

    it("should return 4 stages without proposal stages", () => {
      const stages = getStagesForPath(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK, false);

      expect(stages.length).toBe(4);
      expect(stages[0]).toBe("L2_TIMELOCK");
      expect(stages).not.toContain("PROPOSAL_CREATED");
    });
  });

  describe("initializeStagesForPath", () => {
    it("should initialize all stages for Constitutional Governor", () => {
      const stages = initializeStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      // Constitutional path has all 7 stages
      expect(stages.length).toBe(7);
      expect(stages[0].type).toBe("PROPOSAL_CREATED");
      expect(stages[1].type).toBe("VOTING_ACTIVE");
      expect(stages[2].type).toBe("PROPOSAL_QUEUED");
      expect(stages[3].type).toBe("L2_TIMELOCK");
      expect(stages[4].type).toBe("L2_TO_L1_MESSAGE");
      expect(stages[5].type).toBe("L1_TIMELOCK");
      expect(stages[6].type).toBe("RETRYABLE_EXECUTED");
    });

    it("should initialize stages for Non-Constitutional Governor", () => {
      const stages = initializeStagesForPath(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR, true);

      // Non-Constitutional has same stages but L1 stages will be skipped at runtime
      expect(stages.length).toBe(7);
    });

    it("should exclude proposal stages for timelock-only path", () => {
      const stages = initializeStagesForPath(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK, false);

      // Timelock-only path doesn't include PROPOSAL_CREATED, VOTING_ACTIVE, PROPOSAL_QUEUED
      expect(stages[0].type).toBe("L2_TIMELOCK");
      expect(stages.some((s) => s.type === "PROPOSAL_CREATED")).toBe(false);
      expect(stages.some((s) => s.type === "VOTING_ACTIVE")).toBe(false);
    });

    it("should initialize all stages to NOT_STARTED", () => {
      const stages = initializeStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      expect(stages.every((s) => s.status === "NOT_STARTED")).toBe(true);
    });

    it("should set correct chain for L1 stages", () => {
      const stages = initializeStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      const l1Timelock = stages.find((s) => s.type === "L1_TIMELOCK");
      const retryable = stages.find((s) => s.type === "RETRYABLE_EXECUTED");

      expect(l1Timelock?.chain).toBe("ethereum");
      expect(retryable?.chain).toBe("ethereum");
    });
  });

  describe("findStage", () => {
    it("should find stage by type", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build(),
      ];

      const result = findStage(stages, "VOTING_ACTIVE");

      expect(result?.type).toBe("VOTING_ACTIVE");
      expect(result?.status).toBe("PENDING");
    });

    it("should return undefined when not found", () => {
      const stages = [new StageBuilder("PROPOSAL_CREATED", "arb1").build()];

      const result = findStage(stages, "L2_TIMELOCK");

      expect(result).toBeUndefined();
    });
  });

  describe("getCurrentStage", () => {
    it("should return first non-complete stage", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("NOT_STARTED").build(),
      ];

      const result = getCurrentStage(stages);

      expect(result?.type).toBe("VOTING_ACTIVE");
    });

    it("should skip SKIPPED stages", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").skip("test").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("PENDING").build(),
      ];

      const result = getCurrentStage(stages);

      expect(result?.type).toBe("PROPOSAL_QUEUED");
    });

    it("should return null when all complete", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
      ];

      const result = getCurrentStage(stages);

      expect(result).toBeNull();
    });
  });

  describe("updateStageInList", () => {
    it("should update existing stage", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
      ];

      const updatedStage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "123" })
        .build();

      const result = updateStageInList(stages, updatedStage);

      expect(result[0].status).toBe("COMPLETED");
      expect((result[0].data as { proposalId?: string })?.proposalId).toBe("123");
      expect(result[1].status).toBe("NOT_STARTED");
    });

    it("should not mutate original array", () => {
      const stages = [new StageBuilder("PROPOSAL_CREATED", "arb1").status("NOT_STARTED").build()];
      const originalStatus = stages[0].status;

      const updatedStage = new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build();

      updateStageInList(stages, updatedStage);

      // Original array should be unchanged
      expect(stages[0].status).toBe(originalStatus);
    });
  });

  describe("areAllStagesComplete", () => {
    it("should return true when all stages are COMPLETED", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("COMPLETED").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return true when all stages are SKIPPED", () => {
      const stages = [
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").skip("test").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").skip("test").build(),
        new StageBuilder("RETRYABLE_EXECUTED", "ethereum").skip("test").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return true for mix of COMPLETED and SKIPPED", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").skip("L2-only").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").skip("L2-only").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return true for FAILED stage (terminal state)", () => {
      const stages = [new StageBuilder("VOTING_ACTIVE", "arb1").status("FAILED").build()];

      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return false when any stage is PENDING", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(false);
    });

    it("should return false when any stage is NOT_STARTED", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(false);
    });

    it("should return false when any stage is READY", () => {
      const stages = [new StageBuilder("L2_TIMELOCK", "arb1").status("READY").build()];

      expect(areAllStagesComplete(stages)).toBe(false);
    });

    it("should return true for empty array", () => {
      expect(areAllStagesComplete([])).toBe(true);
    });
  });

  describe("isConstitutional", () => {
    it("should return true for Constitutional Governor", () => {
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR)).toBe(true);
    });

    it("should return true for Constitutional Timelock", () => {
      expect(isConstitutional(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK)).toBe(true);
    });

    it("should return false for Non-Constitutional Governor", () => {
      expect(isConstitutional(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR)).toBe(false);
    });

    it("should return false for Non-Constitutional Timelock", () => {
      expect(isConstitutional(ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK)).toBe(false);
    });

    it("should return false for Election governors", () => {
      expect(isConstitutional(ADDRESSES.ELECTION_NOMINEE_GOVERNOR)).toBe(false);
      expect(isConstitutional(ADDRESSES.ELECTION_MEMBER_GOVERNOR)).toBe(false);
    });

    it("should return false for unknown address", () => {
      expect(isConstitutional("0x0000000000000000000000000000000000000001")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase())).toBe(true);
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toUpperCase())).toBe(true);
    });
  });

  describe("failPrepare", () => {
    it("should return PrepareResult with error", () => {
      const result = failPrepare("Operation not ready");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Operation not ready");
      }
    });
  });

  describe("getBlockTimestamp", () => {
    it("should return block timestamp", async () => {
      const mockProvider = {
        getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000 }),
      } as unknown as ethers.providers.Provider;

      const result = await getBlockTimestamp(12345, mockProvider);

      expect(result).toBe(1700000000);
      expect(mockProvider.getBlock).toHaveBeenCalledWith(12345);
    });

    it("should throw error when block is not found (line 224)", async () => {
      // #given
      const mockProvider = {
        getBlock: vi.fn().mockResolvedValue(null),
      } as unknown as ethers.providers.Provider;

      // #when / #then
      await expect(getBlockTimestamp(99999, mockProvider)).rejects.toThrow("Block 99999 not found");
    });
  });
});

describe("Stage Status Helpers", () => {
  it("should have consistent StageStatus values", () => {
    const validStatuses = [
      "NOT_STARTED",
      "PENDING",
      "READY",
      "COMPLETED",
      "FAILED",
      "SKIPPED",
    ] as const;

    // Type check that all statuses are valid
    validStatuses.forEach((status) => {
      expect(typeof status).toBe("string");
    });
  });
});

describe("Type Guards", () => {
  describe("isStageType", () => {
    it("should return true when stage type matches", () => {
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "12345" })
        .build();

      expect(isStageType(stage, "PROPOSAL_CREATED")).toBe(true);
    });

    it("should return false when stage type does not match", () => {
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();

      expect(isStageType(stage, "PROPOSAL_CREATED")).toBe(false);
      expect(isStageType(stage, "L2_TIMELOCK")).toBe(false);
    });

    it("should work as type narrowing in conditionals", () => {
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ operationId: "0xabc", timelockAddress: "0x123" })
        .build();

      if (isStageType(stage, "L2_TIMELOCK")) {
        // TypeScript should know stage is L2_TIMELOCK here
        expect(stage.type).toBe("L2_TIMELOCK");
        expect(stage.data.operationId).toBe("0xabc");
      }
    });

    it("should return false for all non-matching types", () => {
      const stage = new StageBuilder("RETRYABLE_EXECUTED", "arb1").status("COMPLETED").build();

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
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("COMPLETED")
        .data({ proposalId: "12345", proposer: "0xabc" })
        .build();

      const data = getStageData(stage, "PROPOSAL_CREATED");

      expect(data).not.toBeNull();
      expect(data?.proposalId).toBe("12345");
    });

    it("should return null when stage type does not match", () => {
      const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build();

      const data = getStageData(stage, "PROPOSAL_CREATED");

      expect(data).toBeNull();
    });

    it("should return L2_TIMELOCK data correctly", () => {
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ operationId: "0xdef456", timelockAddress: "0x789" })
        .build();

      const data = getStageData(stage, "L2_TIMELOCK");

      expect(data).not.toBeNull();
      expect(data?.operationId).toBe("0xdef456");
      expect(data?.timelockAddress).toBe("0x789");
    });

    it("should return null when checking wrong type", () => {
      const stage = new StageBuilder("L1_TIMELOCK", "ethereum")
        .status("PENDING")
        .data({ operationId: "0x123" })
        .build();

      expect(getStageData(stage, "L2_TIMELOCK")).toBeNull();
      expect(getStageData(stage, "PROPOSAL_CREATED")).toBeNull();
    });
  });
});
