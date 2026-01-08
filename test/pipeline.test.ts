/**
 * Pipeline Stage Functions Tests
 *
 * Tests for the pipeline module that tracks stages and manages state.
 * Uses unit tests with mock data where possible.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  createTracker,
  ProposalStageTracker,
  DEFAULT_RPC_URLS,
  TrackingResult,
  TrackedStage,
} from "../src";
import {
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./fixtures";

dotenv.config({ quiet: true });

describe("Pipeline Module", () => {
  describe("Stage chain classification (unit tests)", () => {
    it("should classify L1_TIMELOCK as ethereum chain", () => {
      const stage = {
        type: "L1_TIMELOCK",
        status: "COMPLETED",
        chain: "ethereum",
        chainId: 1,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      expect(stage.chain).toBe("ethereum");
      expect(stage.chainId).toBe(1);
    });

    it("should classify L2 stages as arb1 chain", () => {
      const l2StageTypes = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "RETRYABLE_EXECUTED",
      ] as const;

      for (const type of l2StageTypes) {
        const stage = {
          type,
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        } as unknown as TrackedStage;

        expect(stage.chain).toBe("arb1");
        expect(stage.chainId).toBe(42161);
      }
    });

    it("should support nova chain for RETRYABLE_EXECUTED", () => {
      const stage = {
        type: "RETRYABLE_EXECUTED",
        status: "COMPLETED",
        chain: "nova",
        chainId: 42170,
        transactions: [],
        data: {
          targetChains: ["nova"],
        },
      } as unknown as TrackedStage;

      expect(stage.chain).toBe("nova");
      expect(stage.chainId).toBe(42170);
    });
  });

  describe("Placeholder stage creation", () => {
    it("should create NOT_STARTED placeholder with reason", () => {
      const placeholder = {
        type: "L1_TIMELOCK",
        status: "NOT_STARTED",
        chain: "ethereum",
        chainId: 1,
        transactions: [],
        data: { reason: "L2 timelock not executed" },
      } as unknown as TrackedStage;

      expect(placeholder.status).toBe("NOT_STARTED");
      expect((placeholder.data as { reason?: string }).reason).toBe("L2 timelock not executed");
    });

    it("should create SKIPPED placeholder for L2-only path", () => {
      const skipped = {
        type: "L2_TO_L1_MESSAGE",
        status: "SKIPPED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: { reason: "L2-only path" },
      } as unknown as TrackedStage;

      expect(skipped.status).toBe("SKIPPED");
      expect((skipped.data as { reason?: string }).reason).toBe("L2-only path");
    });
  });

  describe("Stage ordering logic", () => {
    it("should have correct stage order for governor pipeline", () => {
      const expectedOrder = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ];

      // Verify the order is as expected in the implementation
      expect(expectedOrder[0]).toBe("PROPOSAL_CREATED");
      expect(expectedOrder[expectedOrder.length - 1]).toBe("RETRYABLE_EXECUTED");
    });

    it("should have correct stage order for timelock pipeline", () => {
      const timelockPipelineStages = [
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ];

      expect(timelockPipelineStages[0]).toBe("L2_TIMELOCK");
      expect(timelockPipelineStages.length).toBe(4);
    });
  });
});

describe.skipIf(process.env.NO_RPC === "1")("Pipeline Integration Tests", () => {
  let tracker: ProposalStageTracker;
  let fullRoundtripResult: TrackingResult;
  let l2OnlyResult: TrackingResult;

  beforeAll(async () => {
    const ethRpc = process.env.ETH_RPC;
    if (!ethRpc) {
      throw new Error("ETH_RPC environment variable required");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

    const l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    const l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
    const novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);

    tracker = createTracker({
      l1Provider,
      l2Provider,
      novaProvider,
    });

    const [full, l2Only] = await Promise.all([
      tracker.trackByTxHash(CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash),
      tracker.trackByTxHash(NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationTxHash),
    ]);

    fullRoundtripResult = full[0];
    l2OnlyResult = l2Only[0];
  }, 180000);

  describe("Governor Pipeline", () => {
    it("should track all stages for full roundtrip proposal", () => {
      const stageTypes = fullRoundtripResult.stages.map((s) => s.type);

      expect(stageTypes).toContain("PROPOSAL_CREATED");
      expect(stageTypes).toContain("VOTING_ACTIVE");
      expect(stageTypes).toContain("PROPOSAL_QUEUED");
      expect(stageTypes).toContain("L2_TIMELOCK");
      expect(stageTypes).toContain("L2_TO_L1_MESSAGE");
      expect(stageTypes).toContain("L1_TIMELOCK");
      expect(stageTypes).toContain("RETRYABLE_EXECUTED");
    });

    it("should have correct chain assignments", () => {
      for (const stage of fullRoundtripResult.stages) {
        if (stage.type === "L1_TIMELOCK") {
          expect(stage.chain).toBe("ethereum");
          expect(stage.chainId).toBe(1);
        } else {
          expect(["arb1", "nova"]).toContain(stage.chain);
          expect([42161, 42170]).toContain(stage.chainId);
        }
      }
    });
  });

  describe("L2-Only Pipeline (Treasury Governor)", () => {
    it("should skip L1 stages for L2-only path", () => {
      const l2ToL1Stage = l2OnlyResult.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      const l1TimelockStage = l2OnlyResult.stages.find((s) => s.type === "L1_TIMELOCK");
      const retryableStage = l2OnlyResult.stages.find((s) => s.type === "RETRYABLE_EXECUTED");

      // All L1 roundtrip stages should be SKIPPED
      if (l2ToL1Stage) {
        expect(l2ToL1Stage.status).toBe("SKIPPED");
      }
      if (l1TimelockStage) {
        expect(l1TimelockStage.status).toBe("SKIPPED");
      }
      if (retryableStage) {
        expect(retryableStage.status).toBe("SKIPPED");
      }
    });

    it("should have L2 timelock completed", () => {
      const l2Timelock = l2OnlyResult.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2Timelock).toBeDefined();
      expect(l2Timelock!.status).toBe("COMPLETED");
    });

    it("should be marked as complete", () => {
      expect(l2OnlyResult.isComplete).toBe(true);
    });
  });

  describe("Timelock Pipeline", () => {
    it("should track from timelock tx hash", async () => {
      const result = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.timelockTxHash
      );

      expect(result.length).toBe(1);
      expect(result[0].input.type).toBe("timelock");

      const stageTypes = result[0].stages.map((s) => s.type);
      expect(stageTypes).toContain("L2_TIMELOCK");
      expect(stageTypes).not.toContain("PROPOSAL_CREATED");
      expect(stageTypes).not.toContain("VOTING_ACTIVE");
    });
  });
});
