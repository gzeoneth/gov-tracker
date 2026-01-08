/**
 * Tests for Timing Utilities
 *
 * Tests for block-based timing calculations across L1 and L2.
 */

import { describe, it, expect } from "vitest";
import {
  estimateTimestampFromBlock,
  calculateEta,
  calculateRemainingSeconds,
  calculateExpectedEta,
} from "../src/utils/timing";
import { BLOCK_TIMES, GOVERNANCE_STAGE_DURATION_DAYS } from "../src/constants";
import { StageBuilder } from "../src/stages/stage-builder";
import type { TrackedStage } from "../src/types";

describe("Timing Utilities", () => {
  describe("estimateTimestampFromBlock", () => {
    it("should estimate future timestamp", () => {
      const currentBlock = 1000;
      const currentTimestamp = 1700000000;
      const targetBlock = 1100;
      const blockTime = 12;

      const result = estimateTimestampFromBlock(
        targetBlock,
        currentBlock,
        currentTimestamp,
        blockTime
      );

      // 100 blocks * 12 seconds = 1200 seconds ahead
      expect(result).toBe(1700001200);
    });

    it("should estimate past timestamp", () => {
      const currentBlock = 1000;
      const currentTimestamp = 1700000000;
      const targetBlock = 900;
      const blockTime = 12;

      const result = estimateTimestampFromBlock(
        targetBlock,
        currentBlock,
        currentTimestamp,
        blockTime
      );

      // 100 blocks * 12 seconds = 1200 seconds behind
      expect(result).toBe(1699998800);
    });

    it("should use default L2 block time (0.25s)", () => {
      const result = estimateTimestampFromBlock(1010, 1000, 1700000000);

      // 10 blocks * 0.25 seconds = 2.5 seconds, floored to 2
      expect(result).toBe(1700000000 + Math.floor(10 * BLOCK_TIMES.L2));
    });

    it("should handle same block (no difference)", () => {
      const result = estimateTimestampFromBlock(1000, 1000, 1700000000, 12);
      expect(result).toBe(1700000000);
    });

    it("should handle L1 block time", () => {
      const result = estimateTimestampFromBlock(1100, 1000, 1700000000, BLOCK_TIMES.L1);

      // 100 blocks * 12 seconds = 1200 seconds
      expect(result).toBe(1700001200);
    });

    it("should handle fractional block times correctly", () => {
      // L2 has 0.25 second blocks
      const result = estimateTimestampFromBlock(1040, 1000, 1700000000, 0.25);

      // 40 blocks * 0.25 seconds = 10 seconds
      expect(result).toBe(1700000010);
    });
  });

  describe("calculateEta", () => {
    it("should return null for past blocks", () => {
      const result = calculateEta(500, 1000, 1700000000);
      expect(result).toBeNull();
    });

    it("should return null for current block", () => {
      const result = calculateEta(1000, 1000, 1700000000);
      expect(result).toBeNull();
    });

    it("should calculate ETA for future blocks", () => {
      const result = calculateEta(1100, 1000, 1700000000, 12);
      expect(result).toBe(1700001200);
    });

    it("should use default L2 block time", () => {
      const result = calculateEta(1100, 1000, 1700000000);

      // 100 blocks * 0.25 seconds = 25 seconds
      expect(result).toBe(1700000000 + Math.floor(100 * BLOCK_TIMES.L2));
    });
  });

  describe("calculateRemainingSeconds", () => {
    it("should return 0 for past blocks", () => {
      expect(calculateRemainingSeconds(500, 1000)).toBe(0);
    });

    it("should return 0 for current block", () => {
      expect(calculateRemainingSeconds(1000, 1000)).toBe(0);
    });

    it("should calculate remaining time for future blocks", () => {
      const result = calculateRemainingSeconds(1100, 1000, 12);
      expect(result).toBe(1200); // 100 blocks * 12 seconds
    });

    it("should use default L2 block time", () => {
      const result = calculateRemainingSeconds(1100, 1000);
      expect(result).toBe(Math.floor(100 * BLOCK_TIMES.L2));
    });

    it("should handle large block differences", () => {
      const result = calculateRemainingSeconds(10000000, 1000000, 12);
      expect(result).toBe(9000000 * 12); // 9M blocks * 12 seconds
    });
  });

  describe("calculateExpectedEta", () => {
    // Helper to create test stages
    function createTestStages(): TrackedStage[] {
      return [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000 })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1")
          .status("COMPLETED")
          .tx("0xdef", 200, "arb1", 42161, { timestamp: 1700086400 })
          .timing({ eta: 1701209600 }) // ~14 days later
          .build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1")
          .status("COMPLETED")
          .tx("0xghi", 300, "arb1", 42161, { timestamp: 1701209600, description: "executed" })
          .build(),
        new StageBuilder("L2_TIMELOCK", "arb1")
          .status("PENDING")
          .timing({ eta: 1701296000 }) // +1 day
          .build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("L1_TIMELOCK", "ethereum").status("NOT_STARTED").build(),
        new StageBuilder("RETRYABLE_EXECUTED", "ethereum").status("NOT_STARTED").build(),
      ];
    }

    it("should calculate ETA based on previous stage ETA", () => {
      const stages = createTestStages();

      // L2_TO_L1_MESSAGE is index 4, should base off L2_TIMELOCK ETA (index 3)
      const eta = calculateExpectedEta(stages, 4);

      expect(eta).toBeDefined();
      // Should add L2_TO_L1_MESSAGE duration to L2_TIMELOCK ETA
      const expectedDays = GOVERNANCE_STAGE_DURATION_DAYS.CHALLENGE_PERIOD;
      const expectedEta = 1701296000 + expectedDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });

    it("should calculate ETA based on completed stage timestamp", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "executed" })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
      ];

      const eta = calculateExpectedEta(stages, 1);

      expect(eta).toBeDefined();
      // Should add VOTING_ACTIVE duration to PROPOSAL_CREATED completion time
      const expectedDays = GOVERNANCE_STAGE_DURATION_DAYS.VOTING;
      const expectedEta = 1700000000 + expectedDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });

    it("should return undefined when no reference point available", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
      ];

      const eta = calculateExpectedEta(stages, 1);

      expect(eta).toBeUndefined();
    });

    it("should accumulate delays across multiple stages", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "executed" })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("NOT_STARTED").build(),
        new StageBuilder("L2_TIMELOCK", "arb1").status("NOT_STARTED").build(),
      ];

      // Calculate ETA for L2_TIMELOCK (index 3)
      const eta = calculateExpectedEta(stages, 3);

      expect(eta).toBeDefined();
      // Should accumulate: VOTING + L2_TIMELOCK durations
      // PROPOSAL_QUEUED doesn't have a defined duration in GOVERNANCE_STAGE_DURATION_DAYS
      const votingDays = GOVERNANCE_STAGE_DURATION_DAYS.VOTING;
      const timelockDays = GOVERNANCE_STAGE_DURATION_DAYS.L2_CONSTITUTIONAL_TIMELOCK;
      const totalDays = votingDays + timelockDays;
      const expectedEta = 1700000000 + totalDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });

    it("should use first available reference going backwards", () => {
      const stages = [
        new StageBuilder("PROPOSAL_CREATED", "arb1")
          .status("COMPLETED")
          .tx("0xabc", 100, "arb1", 42161, { timestamp: 1700000000, description: "executed" })
          .build(),
        new StageBuilder("VOTING_ACTIVE", "arb1")
          .status("COMPLETED")
          .timing({ eta: 1701209600 })
          .build(),
        new StageBuilder("PROPOSAL_QUEUED", "arb1").status("NOT_STARTED").build(),
      ];

      // Should use VOTING_ACTIVE eta (1701209600) not PROPOSAL_CREATED timestamp
      const eta = calculateExpectedEta(stages, 2);

      expect(eta).toBeDefined();
      // PROPOSAL_QUEUED doesn't have duration, so should just be VOTING_ACTIVE eta
      expect(eta).toBe(1701209600);
    });

    it("should handle index 0 (first stage)", () => {
      const stages = [new StageBuilder("PROPOSAL_CREATED", "arb1").status("NOT_STARTED").build()];

      const eta = calculateExpectedEta(stages, 0);

      // No previous stages to reference
      expect(eta).toBeUndefined();
    });

    it("should prefer execution timestamp over other timestamps", () => {
      const stages = [
        new StageBuilder("L2_TIMELOCK", "arb1")
          .status("COMPLETED")
          .tx("0xqueue", 100, "arb1", 42161, { timestamp: 1700000000, description: "queued" })
          .tx("0xexec", 200, "arb1", 42161, { timestamp: 1700100000, description: "executed" })
          .build(),
        new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("NOT_STARTED").build(),
      ];

      const eta = calculateExpectedEta(stages, 1);

      expect(eta).toBeDefined();
      // Should use execution timestamp (1700100000)
      const expectedDays = GOVERNANCE_STAGE_DURATION_DAYS.CHALLENGE_PERIOD;
      const expectedEta = 1700100000 + expectedDays * 24 * 60 * 60;
      expect(eta).toBe(expectedEta);
    });
  });
});
