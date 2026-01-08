/**
 * Tests for Stages Base Utilities
 *
 * Tests for pure functions in stages/base module.
 * No RPC calls required.
 */

import { describe, it, expect } from "vitest";
import {
  extractOperationId,
  findExecutableStage,
  findAllExecutableStages,
  needsAction,
  getTrackingStatusSummary,
  isConstitutional,
  getStagesForPath,
  initializeStagesForPath,
  findStage,
  updateStageInList,
  getCurrentStage,
  areAllStagesComplete,
  isTimelockStage,
  failPrepare,
} from "../src/stages/base";
import { StageBuilder } from "../src/stages/stage-builder";
import { ADDRESSES } from "../src/constants";
import type { TrackedStage } from "../src/types";

describe("Stages Base Utilities", () => {
  describe("extractOperationId", () => {
    it("should extract operationId from PROPOSAL_QUEUED stage", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1")
          .status("COMPLETED")
          .data({ operationId: "0x123abc" })
          .build(),
      ];

      const opId = extractOperationId(stages);
      expect(opId).toBe("0x123abc");
    });

    it("should extract operationId from L2_TIMELOCK stage", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1")
          .status("PENDING")
          .data({ operationId: "0xdef456" })
          .build(),
      ];

      const opId = extractOperationId(stages);
      expect(opId).toBe("0xdef456");
    });

    it("should prefer PROPOSAL_QUEUED over L2_TIMELOCK", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_QUEUED", "arb1")
          .status("COMPLETED")
          .data({ operationId: "0xfromQueued" })
          .build(),
        new StageBuilder("L2_TIMELOCK", "arb1")
          .status("PENDING")
          .data({ operationId: "0xfromTimelock" })
          .build(),
      ];

      const opId = extractOperationId(stages);
      expect(opId).toBe("0xfromQueued");
    });

    it("should return undefined when no operationId found", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
      ];

      const opId = extractOperationId(stages);
      expect(opId).toBeUndefined();
    });

    it("should return undefined for empty operationId", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_QUEUED", "arb1")
          .status("COMPLETED")
          .data({ operationId: "" })
          .build(),
      ];

      const opId = extractOperationId(stages);
      expect(opId).toBeUndefined();
    });

    it("should return undefined for empty stages array", () => {
      const opId = extractOperationId([]);
      expect(opId).toBeUndefined();
    });
  });

  describe("findExecutableStage", () => {
    it("should find READY executable stage", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("READY").executable(true).build(),
      ];

      const found = findExecutableStage(stages);
      expect(found).not.toBeNull();
      expect(found?.type).toBe("L2_TO_L1_MESSAGE");
    });

    it("should return null for READY non-executable stage", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(false).build(),
      ];

      const found = findExecutableStage(stages);
      expect(found).toBeNull();
    });

    it("should return null when no READY stages", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("NOT_STARTED").build(),
      ];

      const found = findExecutableStage(stages);
      expect(found).toBeNull();
    });

    it("should return first READY executable when multiple exist", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(true).build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("READY").executable(true).build(),
      ];

      const found = findExecutableStage(stages);
      expect(found?.type).toBe("L2_TIMELOCK");
    });
  });

  describe("findAllExecutableStages", () => {
    it("should find all READY executable stages", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(true).build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("READY").executable(false).build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("READY").executable(true).build(),
      ];

      const found = findAllExecutableStages(stages);
      expect(found.length).toBe(2);
      expect(found[0].type).toBe("L2_TIMELOCK");
      expect(found[1].type).toBe("L1_TIMELOCK");
    });

    it("should return empty array when none found", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      const found = findAllExecutableStages(stages);
      expect(found).toEqual([]);
    });
  });

  describe("needsAction", () => {
    it("should return true when executable stage exists", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(true).build(),
      ];

      expect(needsAction(stages)).toBe(true);
    });

    it("should return false when no executable stage", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      expect(needsAction(stages)).toBe(false);
    });
  });

  describe("getTrackingStatusSummary", () => {
    it("should count all stage statuses", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("READY").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("NOT_STARTED").build(),
        new StageBuilder("RETRYABLE_EXECUTED", "arb1").status("SKIPPED").build(),
      ];

      const summary = getTrackingStatusSummary(stages);

      expect(summary.total).toBe(7);
      expect(summary.completed).toBe(3);
      expect(summary.pending).toBe(1);
      expect(summary.ready).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toBe(0);
    });

    it("should handle empty stages array", () => {
      const summary = getTrackingStatusSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.completed).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.ready).toBe(0);
      expect(summary.skipped).toBe(0);
      expect(summary.failed).toBe(0);
    });

    it("should count FAILED status", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("FAILED").build(),
      ];

      const summary = getTrackingStatusSummary(stages);

      expect(summary.failed).toBe(1);
    });
  });

  describe("isConstitutional", () => {
    it("should return true for Constitutional Governor", () => {
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR)).toBe(true);
    });

    it("should return true for L2 Constitutional Timelock", () => {
      expect(isConstitutional(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK)).toBe(true);
    });

    it("should return false for Non-Constitutional Governor", () => {
      expect(isConstitutional(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR)).toBe(false);
    });

    it("should return false for L2 Non-Constitutional Timelock", () => {
      expect(isConstitutional(ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK)).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase())).toBe(true);
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toUpperCase())).toBe(true);
    });
  });

  describe("getStagesForPath", () => {
    it("should return all 7 stages with proposal stages", () => {
      const stages = getStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      expect(stages.length).toBe(7);
      expect(stages[0]).toBe("PROPOSAL_CREATED");
      expect(stages[1]).toBe("VOTING_ACTIVE");
      expect(stages[2]).toBe("PROPOSAL_QUEUED");
      expect(stages[3]).toBe("L2_TIMELOCK");
      expect(stages[4]).toBe("L2_TO_L1_MESSAGE");
      expect(stages[5]).toBe("L1_TIMELOCK");
      expect(stages[6]).toBe("RETRYABLE_EXECUTED");
    });

    it("should return 4 stages without proposal stages", () => {
      const stages = getStagesForPath(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK, false);

      expect(stages.length).toBe(4);
      expect(stages[0]).toBe("L2_TIMELOCK");
      expect(stages[1]).toBe("L2_TO_L1_MESSAGE");
      expect(stages[2]).toBe("L1_TIMELOCK");
      expect(stages[3]).toBe("RETRYABLE_EXECUTED");
    });
  });

  describe("initializeStagesForPath", () => {
    it("should create all stages with correct chains", () => {
      const stages = initializeStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      expect(stages.length).toBe(7);
      expect(stages[0].chain).toBe("arb1"); // PROPOSAL_CREATED
      expect(stages[3].chain).toBe("arb1"); // L2_TIMELOCK
      expect(stages[5].chain).toBe("ethereum"); // L1_TIMELOCK
      expect(stages[6].chain).toBe("ethereum"); // RETRYABLE_EXECUTED
    });

    it("should set all stages to NOT_STARTED", () => {
      const stages = initializeStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      expect(stages.every((s) => s.status === "NOT_STARTED")).toBe(true);
    });
  });

  describe("findStage", () => {
    it("should find stage by type", () => {
      const stages = initializeStagesForPath(ADDRESSES.CONSTITUTIONAL_GOVERNOR, true);

      const found = findStage(stages, "L2_TIMELOCK");

      expect(found).not.toBeUndefined();
      expect(found?.type).toBe("L2_TIMELOCK");
    });

    it("should return undefined when not found", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
      ];

      const found = findStage(stages, "L2_TIMELOCK");

      expect(found).toBeUndefined();
    });
  });

  describe("updateStageInList", () => {
    it("should update matching stage", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      const updated = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").build();
      const result = updateStageInList(stages, updated);

      expect(result[1].status).toBe("READY");
      expect(result[0].status).toBe("COMPLETED"); // Unchanged
    });

    it("should not modify other stages", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      const updated = new StageBuilder("L1_TIMELOCK", "ethereum").status("READY").build();
      const result = updateStageInList(stages, updated);

      // Both original stages unchanged
      expect(result[0].status).toBe("COMPLETED");
      expect(result[1].status).toBe("PENDING");
    });
  });

  describe("getCurrentStage", () => {
    it("should return first non-completed stage", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("NOT_STARTED").build(),
      ];

      const current = getCurrentStage(stages);

      expect(current?.type).toBe("VOTING_ACTIVE");
    });

    it("should skip SKIPPED stages", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("SKIPPED").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("PENDING").build(),
      ];

      const current = getCurrentStage(stages);

      expect(current?.type).toBe("L1_TIMELOCK");
    });

    it("should return null when all stages complete", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
      ];

      const current = getCurrentStage(stages);

      expect(current).toBeNull();
    });
  });

  describe("areAllStagesComplete", () => {
    it("should return true when all COMPLETED", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return true for mix of COMPLETED, SKIPPED, FAILED", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("SKIPPED").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("FAILED").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return false when any stage is PENDING", () => {
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build(),
      ];

      expect(areAllStagesComplete(stages)).toBe(false);
    });
  });

  describe("isTimelockStage", () => {
    it("should return true for L2_TIMELOCK", () => {
      expect(isTimelockStage("L2_TIMELOCK")).toBe(true);
    });

    it("should return true for L1_TIMELOCK", () => {
      expect(isTimelockStage("L1_TIMELOCK")).toBe(true);
    });

    it("should return false for other stages", () => {
      expect(isTimelockStage("PROPOSAL_CREATED")).toBe(false);
      expect(isTimelockStage("VOTING_ACTIVE")).toBe(false);
      expect(isTimelockStage("L2_TO_L1_MESSAGE")).toBe(false);
    });
  });

  describe("failPrepare", () => {
    it("should create failed PrepareResult", () => {
      const result = failPrepare("Test error message");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Test error message");
      }
    });
  });
});
