/**
 * Tests for CLI JSON dashboard state builder
 *
 * Tests buildDashboardState and related formatting functions.
 * No RPC calls needed - pure unit tests.
 */

import { describe, expect, it } from "vitest";
import {
  buildDashboardState,
  writeDashboardState,
  JsonDashboardState,
} from "../src/cli/lib/json-state";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TrackingCheckpoint, TrackedStage, StageStatus } from "../src/index";
import { StageBuilder } from "../src/stages/stage-builder";

type MockStageType =
  | "PROPOSAL_CREATED"
  | "VOTING_ACTIVE"
  | "PROPOSAL_QUEUED"
  | "L2_TIMELOCK"
  | "L2_TO_L1_MESSAGE"
  | "L1_TIMELOCK"
  | "RETRYABLE_EXECUTED";

function createMockStage(
  type: MockStageType,
  status: StageStatus,
  chain: "ethereum" | "arb1" | "nova" = "arb1",
  data: Record<string, unknown> = {}
): TrackedStage {
  const builder = new StageBuilder(type, chain, status);
  if (Object.keys(data).length > 0) {
    builder.data(data as never);
  }
  return builder.build();
}

function createMockGovernorCheckpoint(
  proposalId: string,
  stages: TrackedStage[],
  errorCount = 0
): TrackingCheckpoint {
  return {
    version: 1,
    createdAt: Date.now(),
    lastProcessedStage: null,
    lastProcessedBlock: { l1: 0, l2: 0 },
    input: {
      type: "governor",
      governorAddress: "0x1234567890123456789012345678901234567890",
      proposalId,
      creationTxHash: "0x" + "a".repeat(64),
    },
    cachedData: {
      completedStages: stages,
    },
    metadata: {
      errorCount,
      lastTrackedAt: Date.now(),
    },
  };
}

function createMockTimelockCheckpoint(
  operationId: string,
  stages: TrackedStage[],
  errorCount = 0
): TrackingCheckpoint {
  return {
    version: 1,
    createdAt: Date.now(),
    lastProcessedStage: null,
    lastProcessedBlock: { l1: 0, l2: 0 },
    input: {
      type: "timelock",
      timelockAddress: "0x0987654321098765432109876543210987654321",
      operationId,
      scheduledTxHash: "0x" + "b".repeat(64),
    },
    cachedData: {
      completedStages: stages,
    },
    metadata: {
      errorCount,
      lastTrackedAt: Date.now(),
    },
  };
}

describe("JSON Dashboard State", () => {
  describe("buildDashboardState", () => {
    it("should return empty state for empty checkpoints", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      const state = buildDashboardState(checkpoints);

      expect(state.version).toBe("1.0");
      expect(state.monitorStats.totalTracked).toBe(0);
      expect(state.monitorStats.complete).toBe(0);
      expect(state.monitorStats.inProgress).toBe(0);
      expect(state.monitorStats.failed).toBe(0);
      expect(state.proposals).toHaveLength(0);
      expect(state.timelockOps).toHaveLength(0);
    });

    it("should categorize complete proposals correctly", () => {
      const stages: TrackedStage[] = [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "COMPLETED"),
        createMockStage("PROPOSAL_QUEUED", "COMPLETED"),
        createMockStage("L2_TIMELOCK", "COMPLETED"),
        createMockStage("L2_TO_L1_MESSAGE", "SKIPPED"),
        createMockStage("L1_TIMELOCK", "SKIPPED", "ethereum"),
        createMockStage("RETRYABLE_EXECUTED", "SKIPPED"),
      ];
      const checkpoint = createMockGovernorCheckpoint("proposal-1", stages);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-1", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.monitorStats.totalTracked).toBe(1);
      expect(state.monitorStats.complete).toBe(1);
      expect(state.monitorStats.inProgress).toBe(0);
      expect(state.proposals).toHaveLength(1);
      expect(state.proposals[0].isComplete).toBe(true);
    });

    it("should categorize in-progress proposals correctly", () => {
      const stages: TrackedStage[] = [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "PENDING"),
        createMockStage("PROPOSAL_QUEUED", "NOT_STARTED"),
      ];
      const checkpoint = createMockGovernorCheckpoint("proposal-2", stages);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-2", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.monitorStats.totalTracked).toBe(1);
      expect(state.monitorStats.complete).toBe(0);
      expect(state.monitorStats.inProgress).toBe(1);
      expect(state.proposals).toHaveLength(1);
      expect(state.proposals[0].isComplete).toBe(false);
    });

    it("should categorize failed items based on error count", () => {
      const stages: TrackedStage[] = [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "PENDING"),
      ];
      const checkpoint = createMockGovernorCheckpoint("proposal-3", stages, 5);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-3", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.monitorStats.failed).toBe(1);
      expect(state.monitorStats.inProgress).toBe(0);
    });

    it("should categorize failed items based on failed stages", () => {
      // To count as "failed" in monitorStats, a proposal must:
      // 1. NOT be complete (i.e., have at least one NOT_STARTED stage)
      // 2. Have at least one FAILED stage
      const stages: TrackedStage[] = [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "FAILED"),
        createMockStage("PROPOSAL_QUEUED", "NOT_STARTED"),
      ];
      const checkpoint = createMockGovernorCheckpoint("proposal-4", stages, 0);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-4", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.monitorStats.failed).toBe(1);
    });

    it("should separate proposals and timelock operations", () => {
      const proposalStages: TrackedStage[] = [createMockStage("PROPOSAL_CREATED", "COMPLETED")];
      const timelockStages: TrackedStage[] = [createMockStage("L2_TIMELOCK", "COMPLETED")];

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("gov-1", createMockGovernorCheckpoint("p1", proposalStages));
      checkpoints.set("tl-1", createMockTimelockCheckpoint("op1", timelockStages));

      const state = buildDashboardState(checkpoints);

      expect(state.proposals).toHaveLength(1);
      expect(state.timelockOps).toHaveLength(1);
      expect(state.proposals[0].type).toBe("governor");
      expect(state.timelockOps[0].type).toBe("timelock");
    });

    it("should include stage data fields in JSON output", () => {
      const stages: TrackedStage[] = [
        createMockStage("L2_TIMELOCK", "COMPLETED", "arb1", {
          operationId: "0x123",
          isSecurityCouncilOperation: true,
        }),
        createMockStage("RETRYABLE_EXECUTED", "PENDING", "arb1", {
          ticketCount: 2,
          redeemedCount: 1,
          pendingCount: 1,
        }),
      ];
      const checkpoint = createMockTimelockCheckpoint("op-1", stages);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-1", checkpoint);

      const state = buildDashboardState(checkpoints);
      const entry = state.timelockOps[0];

      expect(entry.stages[0].data?.operationId).toBe("0x123");
      expect(entry.stages[0].data?.isSecurityCouncil).toBe(true);
      expect(entry.stages[1].data?.ticketCount).toBe(2);
      expect(entry.stages[1].data?.redeemedCount).toBe(1);
      expect(entry.stages[1].data?.pendingCount).toBe(1);
    });

    it("should include transaction info in stage JSON", () => {
      const builder = new StageBuilder("L2_TIMELOCK", "arb1", "COMPLETED");
      builder.tx("0xabc123", 12345, "arb1", 42161, { timestamp: 1700000000 });
      const stage = builder.build();

      const checkpoint = createMockTimelockCheckpoint("op-tx", [stage]);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-tx", checkpoint);

      const state = buildDashboardState(checkpoints);
      const stageJson = state.timelockOps[0].stages[0];

      expect(stageJson.txHash).toBe("0xabc123");
      expect(stageJson.blockNumber).toBe(12345);
      expect(stageJson.timestamp).toBe(1700000000);
      expect(stageJson.explorerUrl).toBeDefined();
    });

    it("should include timing ETA when available", () => {
      const eta = Math.floor(Date.now() / 1000) + 3600;
      const builder = new StageBuilder("L2_TIMELOCK", "arb1", "PENDING");
      builder.timing({ eta });
      const stage = builder.build();

      const checkpoint = createMockTimelockCheckpoint("op-eta", [stage]);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-eta", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.timelockOps[0].stages[0].eta).toBe(eta);
    });

    it("should include executable flag when stage is ready", () => {
      const builder = new StageBuilder("L2_TIMELOCK", "arb1", "READY");
      builder.executable(true);
      const stage = builder.build();

      const checkpoint = createMockTimelockCheckpoint("op-exec", [stage]);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-exec", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.timelockOps[0].stages[0].executable).toBe(true);
    });

    it("should calculate summary stats correctly", () => {
      const stages: TrackedStage[] = [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "COMPLETED"),
        createMockStage("PROPOSAL_QUEUED", "PENDING"),
        createMockStage("L2_TIMELOCK", "READY"),
        createMockStage("L2_TO_L1_MESSAGE", "NOT_STARTED"),
        createMockStage("L1_TIMELOCK", "FAILED", "ethereum"),
        createMockStage("RETRYABLE_EXECUTED", "NOT_STARTED"),
      ];
      const checkpoint = createMockGovernorCheckpoint("p-stats", stages);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("key-stats", checkpoint);

      const state = buildDashboardState(checkpoints);
      const summary = state.proposals[0].summary;

      expect(summary.total).toBe(7);
      expect(summary.completed).toBe(2);
      expect(summary.pending).toBe(1);
      expect(summary.ready).toBe(1);
      expect(summary.failed).toBe(1);
    });

    it("should set governor-specific fields for proposal entries", () => {
      const stages: TrackedStage[] = [createMockStage("PROPOSAL_CREATED", "COMPLETED")];
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        input: {
          type: "governor",
          governorAddress: "0xGOVERNOR",
          proposalId: "12345",
          creationTxHash: "0x" + "c".repeat(64),
        },
        cachedData: { completedStages: stages },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("gov-key", checkpoint);

      const state = buildDashboardState(checkpoints);
      const entry = state.proposals[0];

      expect(entry.governorAddress).toBe("0xGOVERNOR");
      expect(entry.proposalId).toBe("12345");
      expect(entry.timelockAddress).toBeUndefined();
    });

    it("should set timelock-specific fields for timelock entries", () => {
      const stages: TrackedStage[] = [createMockStage("L2_TIMELOCK", "COMPLETED")];
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        input: {
          type: "timelock",
          timelockAddress: "0xTIMELOCK",
          operationId: "0xOPID",
          scheduledTxHash: "0x" + "d".repeat(64),
        },
        cachedData: { completedStages: stages },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("tl-key", checkpoint);

      const state = buildDashboardState(checkpoints);
      const entry = state.timelockOps[0];

      expect(entry.timelockAddress).toBe("0xTIMELOCK");
      expect(entry.operationId).toBe("0xOPID");
      expect(entry.governorAddress).toBeUndefined();
    });

    it("should handle checkpoint with empty stages array", () => {
      const checkpoint = createMockGovernorCheckpoint("empty-stages", []);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("empty-key", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.proposals).toHaveLength(1);
      expect(state.proposals[0].isComplete).toBe(false);
      expect(state.proposals[0].stages).toHaveLength(0);
      expect(state.proposals[0].currentStage).toBeUndefined();
    });

    it("should skip non-governor/timelock input types", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      // Test with a properly shaped checkpoint that has an "unexpected" type
      // The function skips anything that's not governor or timelock
      checkpoints.set("unknown-key", {
        version: 1,
        createdAt: Date.now(),
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        input: { type: "unknown" } as never,
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      });

      const state = buildDashboardState(checkpoints);

      expect(state.proposals).toHaveLength(0);
      expect(state.timelockOps).toHaveLength(0);
      expect(state.monitorStats.totalTracked).toBe(0);
    });

    it("should set currentStage to the active stage", () => {
      const stages: TrackedStage[] = [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "COMPLETED"),
        createMockStage("PROPOSAL_QUEUED", "PENDING"),
        createMockStage("L2_TIMELOCK", "NOT_STARTED"),
      ];
      const checkpoint = createMockGovernorCheckpoint("active-stage", stages);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("active-key", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.proposals[0].currentStage).toBe("PROPOSAL_QUEUED");
      expect(state.proposals[0].currentStatus).toBe("PENDING");
    });

    it("should include error info for checkpoints with errors", () => {
      const stages: TrackedStage[] = [createMockStage("PROPOSAL_CREATED", "COMPLETED")];
      const checkpoint = createMockGovernorCheckpoint("error-checkpoint", stages, 3);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("error-key", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.proposals[0].error).toBe("3 consecutive errors");
    });

    it("should not include error info when errorCount is 0", () => {
      const stages: TrackedStage[] = [createMockStage("PROPOSAL_CREATED", "COMPLETED")];
      const checkpoint = createMockGovernorCheckpoint("no-error", stages, 0);

      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("no-error-key", checkpoint);

      const state = buildDashboardState(checkpoints);

      expect(state.proposals[0].error).toBeUndefined();
    });
  });

  describe("writeDashboardState", () => {
    it("should write JSON state to file", () => {
      const state: JsonDashboardState = {
        version: "1.0",
        generatedAt: "2024-01-01T00:00:00.000Z",
        monitorStats: {
          totalTracked: 1,
          complete: 1,
          inProgress: 0,
          failed: 0,
        },
        proposals: [],
        timelockOps: [],
      };

      const tmpDir = os.tmpdir();
      const testFile = path.join(tmpDir, `test-dashboard-state-${Date.now()}.json`);

      try {
        writeDashboardState(state, testFile);

        const content = fs.readFileSync(testFile, "utf-8");
        const parsed = JSON.parse(content);

        expect(parsed.version).toBe("1.0");
        expect(parsed.monitorStats.totalTracked).toBe(1);
        expect(parsed.monitorStats.complete).toBe(1);
      } finally {
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });
  });
});
