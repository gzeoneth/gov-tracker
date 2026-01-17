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
  getStagesForTrackingPath,
  initializeStagesForTrackingPath,
  findStage,
  updateStageInList,
  getCurrentStage,
  areAllStagesComplete,
  isTimelockStage,
  failPrepare,
} from "../src/stages/utils";
import { StageBuilder } from "../src/stages/builder";
import { ADDRESSES } from "../src/constants";
import type { TrackedStage } from "../src/types";

describe("Stages Base Utilities", () => {
  describe("extractOperationId", () => {
    it("should extract operationId from PROPOSAL_QUEUED stage", () => {
      // #given - stages with operationId in PROPOSAL_QUEUED
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1")
          .status("COMPLETED")
          .data({ operationId: "0x123abc" })
          .build(),
      ];

      // #when - extracting operationId
      const opId = extractOperationId(stages);

      // #then - returns the operationId from PROPOSAL_QUEUED
      expect(opId).toBe("0x123abc");
    });

    it("should extract operationId from L2_TIMELOCK stage", () => {
      // #given - stages with operationId only in L2_TIMELOCK
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1")
          .status("PENDING")
          .data({ operationId: "0xdef456" })
          .build(),
      ];

      // #when - extracting operationId
      const opId = extractOperationId(stages);

      // #then - returns the operationId from L2_TIMELOCK
      expect(opId).toBe("0xdef456");
    });

    it("should prefer PROPOSAL_QUEUED over L2_TIMELOCK", () => {
      // #given - stages with operationId in both PROPOSAL_QUEUED and L2_TIMELOCK
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

      // #when - extracting operationId
      const opId = extractOperationId(stages);

      // #then - returns the operationId from PROPOSAL_QUEUED (higher priority)
      expect(opId).toBe("0xfromQueued");
    });

    it("should return undefined when no operationId found", () => {
      // #given - stages without operationId
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
      ];

      // #when - extracting operationId
      const opId = extractOperationId(stages);

      // #then - returns undefined
      expect(opId).toBeUndefined();
    });

    it("should return undefined for empty operationId", () => {
      // #given - stages with empty string operationId
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_QUEUED", "arb1")
          .status("COMPLETED")
          .data({ operationId: "" })
          .build(),
      ];

      // #when - extracting operationId
      const opId = extractOperationId(stages);

      // #then - returns undefined (empty string treated as missing)
      expect(opId).toBeUndefined();
    });

    it("should return undefined for empty stages array", () => {
      // #given - empty stages array
      // #when - extracting operationId
      const opId = extractOperationId([]);

      // #then - returns undefined
      expect(opId).toBeUndefined();
    });
  });

  describe("findExecutableStage", () => {
    it("should find READY executable stage", () => {
      // #given - stages with one READY executable stage
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("READY").executable(true).build(),
      ];

      // #when - finding executable stage
      const found = findExecutableStage(stages);

      // #then - returns the READY executable stage
      expect(found).not.toBeNull();
      expect(found?.type).toBe("L2_TO_L1_MESSAGE");
    });

    it("should return null for READY non-executable stage", () => {
      // #given - stages with READY but non-executable stage
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(false).build(),
      ];

      // #when - finding executable stage
      const found = findExecutableStage(stages);

      // #then - returns null (READY but not executable)
      expect(found).toBeNull();
    });

    it("should return null when no READY stages", () => {
      // #given - stages with no READY status
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("NOT_STARTED").build(),
      ];

      // #when - finding executable stage
      const found = findExecutableStage(stages);

      // #then - returns null
      expect(found).toBeNull();
    });

    it("should return first READY executable when multiple exist", () => {
      // #given - multiple READY executable stages
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(true).build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("READY").executable(true).build(),
      ];

      // #when - finding executable stage
      const found = findExecutableStage(stages);

      // #then - returns the first one
      expect(found?.type).toBe("L2_TIMELOCK");
    });
  });

  describe("findAllExecutableStages", () => {
    it("should find all READY executable stages", () => {
      // #given - mix of READY executable and non-executable stages
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(true).build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("READY").executable(false).build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("READY").executable(true).build(),
      ];

      // #when - finding all executable stages
      const found = findAllExecutableStages(stages);

      // #then - returns only READY+executable stages
      expect(found.length).toBe(2);
      expect(found[0].type).toBe("L2_TIMELOCK");
      expect(found[1].type).toBe("L1_TIMELOCK");
    });

    it("should return empty array when none found", () => {
      // #given - stages with no READY executable stages
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      // #when - finding all executable stages
      const found = findAllExecutableStages(stages);

      // #then - returns empty array
      expect(found).toEqual([]);
    });
  });

  describe("needsAction", () => {
    it("should return true when executable stage exists", () => {
      // #given - stages with a READY executable stage
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("READY").executable(true).build(),
      ];

      // #when - checking if action is needed
      // #then - returns true
      expect(needsAction(stages)).toBe(true);
    });

    it("should return false when no executable stage", () => {
      // #given - stages with no executable stage
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      // #when - checking if action is needed
      // #then - returns false
      expect(needsAction(stages)).toBe(false);
    });
  });

  describe("getTrackingStatusSummary", () => {
    it("should count all stage statuses", () => {
      // #given - stages with various statuses
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("READY").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("NOT_STARTED").build(),
        new StageBuilder("RETRYABLE_EXECUTED", "arb1").status("SKIPPED").build(),
      ];

      // #when - getting status summary
      const summary = getTrackingStatusSummary(stages);

      // #then - correctly counts each status type
      expect(summary.total).toBe(7);
      expect(summary.completed).toBe(3);
      expect(summary.pending).toBe(1);
      expect(summary.ready).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toBe(0);
    });

    it("should handle empty stages array", () => {
      // #given - empty stages array
      // #when - getting status summary
      const summary = getTrackingStatusSummary([]);

      // #then - all counts are zero
      expect(summary.total).toBe(0);
      expect(summary.completed).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.ready).toBe(0);
      expect(summary.skipped).toBe(0);
      expect(summary.failed).toBe(0);
    });

    it("should count FAILED status", () => {
      // #given - stage with FAILED status
      const stages: TrackedStage[] = [
        new StageBuilder("L2_TIMELOCK", "arb1").status("FAILED").build(),
      ];

      // #when - getting status summary
      const summary = getTrackingStatusSummary(stages);

      // #then - failed count is incremented
      expect(summary.failed).toBe(1);
    });
  });

  describe("isConstitutional", () => {
    it("should return true for Constitutional Governor", () => {
      // #given - Constitutional Governor address
      // #when - checking if constitutional
      // #then - returns true
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR)).toBe(true);
    });

    it("should return true for L2 Constitutional Timelock", () => {
      // #given - L2 Constitutional Timelock address
      // #when - checking if constitutional
      // #then - returns true
      expect(isConstitutional(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK)).toBe(true);
    });

    it("should return false for Non-Constitutional Governor", () => {
      // #given - Non-Constitutional Governor address
      // #when - checking if constitutional
      // #then - returns false
      expect(isConstitutional(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR)).toBe(false);
    });

    it("should return false for L2 Non-Constitutional Timelock", () => {
      // #given - L2 Non-Constitutional Timelock address
      // #when - checking if constitutional
      // #then - returns false
      expect(isConstitutional(ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK)).toBe(false);
    });

    it("should be case-insensitive", () => {
      // #given - Constitutional Governor address in different cases
      // #when - checking if constitutional
      // #then - returns true regardless of case
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase())).toBe(true);
      expect(isConstitutional(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toUpperCase())).toBe(true);
    });
  });

  describe("getStagesForTrackingPath", () => {
    it("should return all 7 stages for governor path", () => {
      // #given - governor path
      // #when - getting stages for path
      const stages = getStagesForTrackingPath("governor");

      // #then - returns all 7 governance stages in order
      expect(stages.length).toBe(7);
      expect(stages[0]).toBe("PROPOSAL_CREATED");
      expect(stages[1]).toBe("VOTING_ACTIVE");
      expect(stages[2]).toBe("PROPOSAL_QUEUED");
      expect(stages[3]).toBe("L2_TIMELOCK");
      expect(stages[4]).toBe("L2_TO_L1_MESSAGE");
      expect(stages[5]).toBe("L1_TIMELOCK");
      expect(stages[6]).toBe("RETRYABLE_EXECUTED");
    });

    it("should return 4 stages for timelock path", () => {
      // #given - timelock path
      // #when - getting stages for path
      const stages = getStagesForTrackingPath("timelock");

      // #then - returns only timelock/execution stages
      expect(stages.length).toBe(4);
      expect(stages[0]).toBe("L2_TIMELOCK");
      expect(stages[1]).toBe("L2_TO_L1_MESSAGE");
      expect(stages[2]).toBe("L1_TIMELOCK");
      expect(stages[3]).toBe("RETRYABLE_EXECUTED");
    });
  });

  describe("initializeStagesForTrackingPath", () => {
    it("should create all stages with correct chains for governor path", () => {
      // #given - governor path
      // #when - initializing stages for path
      const stages = initializeStagesForTrackingPath("governor");

      // #then - creates stages with appropriate chain assignments
      expect(stages.length).toBe(7);
      expect(stages[0].chain).toBe("arb1"); // PROPOSAL_CREATED
      expect(stages[3].chain).toBe("arb1"); // L2_TIMELOCK
      expect(stages[5].chain).toBe("ethereum"); // L1_TIMELOCK
      expect(stages[6].chain).toBe("ethereum"); // RETRYABLE_EXECUTED
    });

    it("should set all stages to NOT_STARTED", () => {
      // #given - governor path
      // #when - initializing stages for path
      const stages = initializeStagesForTrackingPath("governor");

      // #then - all stages have NOT_STARTED status
      expect(stages.every((s) => s.status === "NOT_STARTED")).toBe(true);
    });
  });

  describe("findStage", () => {
    it("should find stage by type", () => {
      // #given - initialized stages with governor path
      const stages = initializeStagesForTrackingPath("governor");

      // #when - finding stage by type
      const found = findStage(stages, "L2_TIMELOCK");

      // #then - returns the matching stage
      expect(found).not.toBeUndefined();
      expect(found?.type).toBe("L2_TIMELOCK");
    });

    it("should return undefined when not found", () => {
      // #given - stages without L2_TIMELOCK
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
      ];

      // #when - finding stage by type
      const found = findStage(stages, "L2_TIMELOCK");

      // #then - returns undefined
      expect(found).toBeUndefined();
    });
  });

  describe("updateStageInList", () => {
    it("should update matching stage", () => {
      // #given - stages with L2_TIMELOCK in PENDING status
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      // #when - updating L2_TIMELOCK to READY
      const updated = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").build();
      const result = updateStageInList(stages, updated);

      // #then - L2_TIMELOCK is updated, other stages unchanged
      expect(result[1].status).toBe("READY");
      expect(result[0].status).toBe("COMPLETED"); // Unchanged
    });

    it("should not modify other stages", () => {
      // #given - stages without L1_TIMELOCK
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build(),
      ];

      // #when - trying to update non-existent L1_TIMELOCK
      const updated = new StageBuilder("L1_TIMELOCK", "ethereum").status("READY").build();
      const result = updateStageInList(stages, updated);

      // #then - all original stages remain unchanged
      expect(result[0].status).toBe("COMPLETED");
      expect(result[1].status).toBe("PENDING");
    });
  });

  describe("getCurrentStage", () => {
    it("should return first non-completed stage", () => {
      // #given - stages with one COMPLETED, one PENDING, one NOT_STARTED
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("NOT_STARTED").build(),
      ];

      // #when - getting current stage
      const current = getCurrentStage(stages);

      // #then - returns the first non-completed stage
      expect(current?.type).toBe("VOTING_ACTIVE");
    });

    it("should skip SKIPPED stages", () => {
      // #given - stages with SKIPPED stage between COMPLETED and PENDING
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("SKIPPED").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("PENDING").build(),
      ];

      // #when - getting current stage
      const current = getCurrentStage(stages);

      // #then - skips SKIPPED and returns L1_TIMELOCK
      expect(current?.type).toBe("L1_TIMELOCK");
    });

    it("should return null when all stages complete", () => {
      // #given - all stages COMPLETED
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
      ];

      // #when - getting current stage
      const current = getCurrentStage(stages);

      // #then - returns null
      expect(current).toBeNull();
    });
  });

  describe("areAllStagesComplete", () => {
    it("should return true when all COMPLETED", () => {
      // #given - all stages COMPLETED
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build(),
      ];

      // #when - checking if all stages complete
      // #then - returns true
      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return true for mix of COMPLETED, SKIPPED, FAILED", () => {
      // #given - stages with terminal statuses (COMPLETED, SKIPPED, FAILED)
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("SKIPPED").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("FAILED").build(),
      ];

      // #when - checking if all stages complete
      // #then - returns true (all terminal states count as complete)
      expect(areAllStagesComplete(stages)).toBe(true);
    });

    it("should return false when any stage is PENDING", () => {
      // #given - stages with one PENDING stage
      const stages: TrackedStage[] = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("COMPLETED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("PENDING").build(),
      ];

      // #when - checking if all stages complete
      // #then - returns false
      expect(areAllStagesComplete(stages)).toBe(false);
    });
  });

  describe("isTimelockStage", () => {
    it("should return true for L2_TIMELOCK", () => {
      // #given - L2_TIMELOCK stage type
      // #when - checking if timelock stage
      // #then - returns true
      expect(isTimelockStage("L2_TIMELOCK")).toBe(true);
    });

    it("should return true for L1_TIMELOCK", () => {
      // #given - L1_TIMELOCK stage type
      // #when - checking if timelock stage
      // #then - returns true
      expect(isTimelockStage("L1_TIMELOCK")).toBe(true);
    });

    it("should return false for other stages", () => {
      // #given - non-timelock stage types
      // #when - checking if timelock stage
      // #then - returns false for all
      expect(isTimelockStage("PROPOSAL_CREATED")).toBe(false);
      expect(isTimelockStage("VOTING_ACTIVE")).toBe(false);
      expect(isTimelockStage("L2_TO_L1_MESSAGE")).toBe(false);
    });
  });

  describe("failPrepare", () => {
    it("should create failed PrepareResult", () => {
      // #given - an error message
      // #when - creating failed PrepareResult
      const result = failPrepare("Test error message");

      // #then - returns unsuccessful result with error message
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Test error message");
      }
    });
  });
});
