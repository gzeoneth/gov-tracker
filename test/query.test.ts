/**
 * Tracker Query Module Tests
 *
 * Tests for cache query and statistics functions.
 * Uses mock cache adapter - no RPC calls required.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BigNumber } from "ethers";
import {
  listCheckpointKeys,
  getCheckpoint,
  getAllCheckpoints,
  queryIncompleteCheckpoints,
  getStats,
  getHighestScNonceFromCheckpoints,
} from "../src/tracker/query";
import { getHighestScNonce, isScOperationSuperseded } from "../src/discovery/security-council";
import type { TrackingCheckpoint, TrackedStage } from "../src/types";
import { ADDRESSES } from "../src/constants";
import { createTestCheckpoint, createTestStage, MockCache } from "./helpers";

// Aliases for cleaner test code
const createCheckpoint = createTestCheckpoint;
const createStage = createTestStage;

describe("Tracker Query Module", () => {
  let cache: MockCache;

  beforeEach(() => {
    cache = new MockCache();
  });

  describe("listCheckpointKeys", () => {
    it("should return empty array for undefined cache", async () => {
      const result = await listCheckpointKeys(undefined);
      expect(result).toEqual([]);
    });

    it("should return empty array for empty cache", async () => {
      const result = await listCheckpointKeys(cache);
      expect(result).toEqual([]);
    });

    it("should return only keys with tx: prefix", async () => {
      await cache.set("tx:0x123", {});
      await cache.set("tx:0x456", {});
      await cache.set("other:key", {});
      await cache.set("discovery:watermark", {});

      const result = await listCheckpointKeys(cache);
      expect(result).toHaveLength(2);
      expect(result).toContain("tx:0x123");
      expect(result).toContain("tx:0x456");
      expect(result).not.toContain("other:key");
    });
  });

  describe("getCheckpoint", () => {
    it("should return null for undefined cache", async () => {
      const result = await getCheckpoint(undefined, "tx:0x123");
      expect(result).toBeNull();
    });

    it("should return null for non-existent key", async () => {
      const result = await getCheckpoint(cache, "tx:0x123");
      expect(result).toBeNull();
    });

    it("should return checkpoint for existing key", async () => {
      const checkpoint = createCheckpoint();
      await cache.set("tx:0x123", checkpoint);

      const result = await getCheckpoint(cache, "tx:0x123");
      expect(result).toEqual(checkpoint);
    });
  });

  describe("getAllCheckpoints", () => {
    it("should return empty map for empty cache", async () => {
      const result = await getAllCheckpoints(cache);
      expect(result.size).toBe(0);
    });

    it("should return all checkpoints", async () => {
      const cp1 = createCheckpoint();
      const cp2 = createCheckpoint();
      await cache.set("tx:0x111", cp1);
      await cache.set("tx:0x222", cp2);

      const result = await getAllCheckpoints(cache);
      expect(result.size).toBe(2);
      expect(result.get("tx:0x111")).toEqual(cp1);
      expect(result.get("tx:0x222")).toEqual(cp2);
    });

    it("should skip non-checkpoint keys", async () => {
      await cache.set("tx:0x111", createCheckpoint());
      await cache.set("discovery:watermark", { block: 12345 });

      const result = await getAllCheckpoints(cache);
      expect(result.size).toBe(1);
    });
  });

  describe("queryIncompleteCheckpoints", () => {
    it("should return incomplete checkpoints", async () => {
      // Incomplete - has non-terminal stage (PENDING)
      const incomplete = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "PENDING"), // Not terminal - makes it incomplete
        ],
      });
      await cache.set("tx:0x111", incomplete);

      const result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("tx:0x111");
    });

    it("should skip completed checkpoints", async () => {
      // Complete - all stages done
      const complete = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "COMPLETED"),
          createStage("PROPOSAL_QUEUED", "COMPLETED"),
          createStage("L2_TIMELOCK", "COMPLETED"),
          createStage("L2_TO_L1_MESSAGE", "COMPLETED"),
          createStage("L1_TIMELOCK", "COMPLETED"),
          createStage("RETRYABLE_EXECUTED", "COMPLETED"),
        ],
      });
      await cache.set("tx:0x111", complete);

      const result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(0);
    });

    it("should include modular governor parent with PROPOSAL_QUEUED completed but no timelock stages", async () => {
      // #given - a modular parent checkpoint (3 parent stages only) whose linked
      // timelock checkpoint has not finished. The rebuilder must re-track this so
      // pending L2/L1 timelock stages advance. Pre-fix, `isCheckpointComplete`
      // returned true here and the rebuilder silently skipped the proposal forever.
      const modularParent = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "COMPLETED"),
          createStage("PROPOSAL_QUEUED", "COMPLETED"),
        ],
        metadata: {
          errorCount: 0,
          lastTrackedAt: Date.now(),
          timelockOpKey: "tx:0x" + "9".repeat(64) + ":op:0x" + "a".repeat(64),
        },
      });
      await cache.set("tx:0x0e065", modularParent);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - parent is classified incomplete so rebuilder re-tracks it
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("tx:0x0e065");
    });

    it("should skip checkpoints with failed voting", async () => {
      const failedVoting = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "FAILED"),
        ],
      });
      await cache.set("tx:0x111", failedVoting);

      const result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(0);
    });

    it("should skip checkpoints with failed voting even with non-terminal stages", async () => {
      // #given - checkpoint with failed voting AND non-terminal stage
      // because areAllStagesComplete returns false due to PENDING stage
      const failedVotingWithPending = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "FAILED"),
          createStage("PROPOSAL_QUEUED", "PENDING"), // Non-terminal, so not "complete"
        ],
      });
      await cache.set("tx:0x111", failedVotingWithPending);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - should still skip because voting failed
      expect(result).toHaveLength(0);
    });

    it("should skip checkpoints exceeding error threshold", async () => {
      const tooManyErrors = createCheckpoint({
        stages: [createStage("PROPOSAL_CREATED", "COMPLETED")],
        metadata: { errorCount: 5, lastTrackedAt: Date.now() },
      });
      await cache.set("tx:0x111", tooManyErrors);

      const result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(0);
    });

    it("should respect custom maxErrorCount", async () => {
      // Must have non-terminal stage to be considered incomplete
      const someErrors = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "PENDING"), // Not terminal
        ],
        metadata: { errorCount: 3, lastTrackedAt: Date.now() },
      });
      await cache.set("tx:0x111", someErrors);

      // Default threshold is 5, so 3 errors should pass
      let result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(1);

      // Custom threshold of 3 should skip it
      result = await queryIncompleteCheckpoints(cache, { maxErrorCount: 3 });
      expect(result).toHaveLength(0);
    });

    it("should skip checkpoints older than maxAgeDays", async () => {
      // Must have non-terminal stage to be considered incomplete for age test
      const old = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "READY"), // Not terminal
        ],
        createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000, // 90 days ago
      });
      await cache.set("tx:0x111", old);

      const result = await queryIncompleteCheckpoints(cache, { maxAgeDays: 60 });
      expect(result).toHaveLength(0);
    });

    it("should include checkpoints within maxAgeDays", async () => {
      // Must have non-terminal stage to be considered incomplete
      const recent = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "PENDING"), // Not terminal
        ],
        createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      });
      await cache.set("tx:0x111", recent);

      const result = await queryIncompleteCheckpoints(cache, { maxAgeDays: 60 });
      expect(result).toHaveLength(1);
    });

    it("should skip keys where checkpoint is null", async () => {
      // Simulate a case where a key exists but returns null (shouldn't happen normally)
      // We set a non-checkpoint value that the type system thinks is a checkpoint
      await cache.set("tx:0x111", null as unknown as TrackingCheckpoint);
      // Set a valid checkpoint too
      const valid = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "PENDING"),
        ],
      });
      await cache.set("tx:0x222", valid);

      const result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("tx:0x222");
    });

    it("should handle checkpoints with undefined metadata", async () => {
      // Create checkpoint without metadata
      const noMetadata = {
        version: 1 as const,
        input: {
          type: "governor" as const,
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalId: "12345",
          creationTxHash: "0x" + "b".repeat(64),
        },
        cachedData: {
          completedStages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "PENDING"),
          ],
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        createdAt: Date.now(),
        // No metadata field
      } as TrackingCheckpoint;
      await cache.set("tx:0x111", noMetadata);

      const result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(1);
    });

    it("should not skip checkpoints with createdAt of zero", async () => {
      // When createdAt is 0, age check should be skipped (createdAt > 0 check)
      const noCreatedAt = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "PENDING"),
        ],
        createdAt: 0,
      });
      await cache.set("tx:0x111", noCreatedAt);

      const result = await queryIncompleteCheckpoints(cache, { maxAgeDays: 1 });
      expect(result).toHaveLength(1);
    });

    it("should include checkpoints with empty stages array", async () => {
      // Empty stages means NOT_STARTED which is incomplete
      const empty = createCheckpoint({
        stages: [],
      });
      await cache.set("tx:0x111", empty);

      const result = await queryIncompleteCheckpoints(cache);
      expect(result).toHaveLength(1);
    });
  });

  describe("getStats", () => {
    it("should return zero stats for empty cache", async () => {
      const result = await getStats(cache);
      expect(result.total).toBe(0);
      expect(result.proposals.total).toBe(0);
      expect(result.timelocks.total).toBe(0);
      expect(result.elections.total).toBe(0);
    });

    it("should count proposals correctly", async () => {
      // Complete proposal - all stages completed
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          stages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "COMPLETED"),
            createStage("PROPOSAL_QUEUED", "COMPLETED"),
            createStage("L2_TIMELOCK", "COMPLETED"),
            createStage("L2_TO_L1_MESSAGE", "COMPLETED"),
            createStage("L1_TIMELOCK", "COMPLETED"),
            createStage("RETRYABLE_EXECUTED", "COMPLETED"),
          ],
        })
      );

      // Active proposal - has a PENDING stage (not terminal)
      await cache.set(
        "tx:0x222",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
          stages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "PENDING"), // Not terminal - makes it active
          ],
        })
      );

      // Errored proposal - exceeds error count, but also has non-terminal stage
      await cache.set(
        "tx:0x333",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          stages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "READY"), // Not terminal
          ],
          metadata: { errorCount: 5, lastTrackedAt: Date.now() },
        })
      );

      const result = await getStats(cache);
      expect(result.total).toBe(3);
      expect(result.proposals.total).toBe(3);
      expect(result.proposals.complete).toBe(1);
      expect(result.proposals.active).toBe(1);
      expect(result.proposals.errored).toBe(1);
    });

    it("should count timelocks correctly", async () => {
      // Complete timelock
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          inputType: "timelock",
          stages: [
            createStage("L2_TIMELOCK", "COMPLETED"),
            createStage("L2_TO_L1_MESSAGE", "COMPLETED"),
            createStage("L1_TIMELOCK", "COMPLETED"),
            createStage("RETRYABLE_EXECUTED", "COMPLETED"),
          ],
        })
      );

      // Active timelock
      await cache.set(
        "tx:0x222",
        createCheckpoint({
          inputType: "timelock",
          stages: [createStage("L2_TIMELOCK", "PENDING")],
        })
      );

      const result = await getStats(cache);
      expect(result.timelocks.total).toBe(2);
      expect(result.timelocks.complete).toBe(1);
      expect(result.timelocks.active).toBe(1);
    });

    it("should count elections separately from regular proposals", async () => {
      // Regular proposal
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          stages: [createStage("PROPOSAL_CREATED", "COMPLETED")],
        })
      );

      // Elections (using election:* keys with election type)
      await cache.set(
        "election:0",
        createCheckpoint({
          inputType: "election",
          electionStatus: { phase: "COMPLETED" },
        })
      );

      await cache.set(
        "election:1",
        createCheckpoint({
          inputType: "election",
          electionStatus: { phase: "MEMBER_ELECTION" },
        })
      );

      const result = await getStats(cache);
      expect(result.proposals.total).toBe(1);
      expect(result.elections.total).toBe(2);
    });

    it("should use custom maxErrorCount threshold", async () => {
      // Proposal with non-terminal stage (so it's not "complete") and some errors
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          stages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "PENDING"), // Not terminal
          ],
          metadata: { errorCount: 3, lastTrackedAt: Date.now() },
        })
      );

      // With default threshold (5), 3 errors is still active
      let result = await getStats(cache);
      expect(result.proposals.active).toBe(1);
      expect(result.proposals.errored).toBe(0);

      // With threshold 3, 3 errors is errored
      result = await getStats(cache, 3);
      expect(result.proposals.active).toBe(0);
      expect(result.proposals.errored).toBe(1);
    });

    it("should handle checkpoints with undefined cachedData", async () => {
      // Create checkpoint without cachedData
      const noCachedData = {
        version: 1 as const,
        input: {
          type: "governor" as const,
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalId: "12345",
          creationTxHash: "0x" + "b".repeat(64),
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        createdAt: Date.now(),
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
        cachedData: {},
      } as TrackingCheckpoint;
      await cache.set("tx:0x111", noCachedData);

      const result = await getStats(cache);
      expect(result.total).toBe(1);
      expect(result.proposals.total).toBe(1);
      expect(result.proposals.active).toBe(1);
    });

    it("should handle checkpoints with undefined metadata in stats", async () => {
      // Create checkpoint without metadata
      const noMetadata = {
        version: 1 as const,
        input: {
          type: "governor" as const,
          governorAddress: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalId: "12345",
          creationTxHash: "0x" + "b".repeat(64),
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {
          completedStages: [createStage("PROPOSAL_CREATED", "PENDING")],
        },
        createdAt: Date.now(),
        // No metadata field
      } as TrackingCheckpoint;
      await cache.set("tx:0x111", noMetadata);

      const result = await getStats(cache);
      expect(result.proposals.total).toBe(1);
      expect(result.proposals.active).toBe(1);
      expect(result.proposals.errored).toBe(0);
    });

    it("should count errored timelocks correctly", async () => {
      // Timelock with errors
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          inputType: "timelock",
          stages: [createStage("L2_TIMELOCK", "PENDING")],
          metadata: { errorCount: 5, lastTrackedAt: Date.now() },
        })
      );

      const result = await getStats(cache);
      expect(result.timelocks.total).toBe(1);
      expect(result.timelocks.errored).toBe(1);
      expect(result.timelocks.active).toBe(0);
    });

    it("should count complete elections correctly", async () => {
      // Complete election (uses election:* key with election type)
      await cache.set(
        "election:0",
        createCheckpoint({
          inputType: "election",
          electionStatus: { phase: "COMPLETED" },
        })
      );

      const result = await getStats(cache);
      expect(result.elections.total).toBe(1);
      expect(result.elections.complete).toBe(1);
    });

    it("should skip legacy election governor checkpoints", async () => {
      // Legacy election governor checkpoint (should be skipped)
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
          stages: [],
        })
      );

      const result = await getStats(cache);
      expect(result.elections.total).toBe(0);
      expect(result.proposals.total).toBe(0);
    });
  });

  describe("queryIncompleteCheckpoints - SC nonce filtering", () => {
    it("should skip SC operations with lower nonces when higher nonce exists", async () => {
      // #given - two SC operations with different nonces
      const scOpLowNonce = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("3")],
      });
      const scOpHighNonce = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("9")],
      });

      await cache.set("tx:0x111:op:0xaaa", scOpLowNonce);
      await cache.set("tx:0x222:op:0xbbb", scOpHighNonce);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - only the high nonce operation should be returned
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("tx:0x222:op:0xbbb");
    });

    it("should return all SC operations when they have the same nonce", async () => {
      // #given - multiple SC operations with the same nonce (from same SC action)
      const scOp1 = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("5")],
      });
      const scOp2 = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("5")],
      });

      await cache.set("tx:0x111:op:0xaaa", scOp1);
      await cache.set("tx:0x111:op:0xbbb", scOp2);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - both should be returned (same nonce)
      expect(result).toHaveLength(2);
    });

    it("should not filter non-SC operations", async () => {
      // #given - mixed SC and non-SC operations
      const scOp = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("3")],
      });
      const regularProposal = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "PENDING"),
        ],
      });

      await cache.set("tx:0x111:op:0xaaa", scOp);
      await cache.set("tx:0x222", regularProposal);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - both should be returned (regular proposal is not filtered by SC nonce)
      expect(result).toHaveLength(2);
    });

    it("should filter SC operations even when mixed with non-SC operations", async () => {
      // #given - low-nonce SC op, high-nonce SC op, and a regular proposal
      const scOpLow = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("3")],
      });
      const scOpHigh = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("9")],
      });
      const regularProposal = createCheckpoint({
        stages: [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "PENDING"),
        ],
      });

      await cache.set("tx:0x111:op:0xaaa", scOpLow);
      await cache.set("tx:0x222:op:0xbbb", scOpHigh);
      await cache.set("tx:0x333", regularProposal);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - low nonce SC op should be filtered, high nonce and regular should remain
      expect(result).toHaveLength(2);
      const keys = result.map((r) => r.key);
      expect(keys).toContain("tx:0x222:op:0xbbb");
      expect(keys).toContain("tx:0x333");
      expect(keys).not.toContain("tx:0x111:op:0xaaa");
    });

    it("should filter incomplete SC ops when completed SC op has higher nonce", async () => {
      // #given - incomplete low-nonce SC op and completed high-nonce SC op
      const scOpIncomplete = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("5")],
      });

      // Create a completed SC operation with higher nonce
      const scOpCompleted = createCheckpoint({
        inputType: "timelock",
        stages: [
          createScTimelockStageWithStatus("10", "COMPLETED"),
          createStage("L2_TO_L1_MESSAGE", "COMPLETED"),
          createStage("L1_TIMELOCK", "COMPLETED"),
          createStage("RETRYABLE_EXECUTED", "COMPLETED"),
        ],
      });

      await cache.set("tx:0x111:op:0xaaa", scOpIncomplete);
      await cache.set("tx:0x222:op:0xbbb", scOpCompleted);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - incomplete SC op with nonce 5 should be filtered because
      // completed SC op with nonce 10 exists
      expect(result).toHaveLength(0);
    });

    it("should not filter incomplete SC ops when completed SC op has lower nonce", async () => {
      // #given - incomplete high-nonce SC op and completed low-nonce SC op
      const scOpIncomplete = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("10")],
      });

      // Create a completed SC operation with lower nonce
      const scOpCompleted = createCheckpoint({
        inputType: "timelock",
        stages: [
          createScTimelockStageWithStatus("5", "COMPLETED"),
          createStage("L2_TO_L1_MESSAGE", "COMPLETED"),
          createStage("L1_TIMELOCK", "COMPLETED"),
          createStage("RETRYABLE_EXECUTED", "COMPLETED"),
        ],
      });

      await cache.set("tx:0x111:op:0xaaa", scOpIncomplete);
      await cache.set("tx:0x222:op:0xbbb", scOpCompleted);

      // #when
      const result = await queryIncompleteCheckpoints(cache);

      // #then - incomplete SC op with nonce 10 should be returned because
      // it's the highest nonce (completed nonce 5 is lower)
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("tx:0x111:op:0xaaa");
    });
  });

  describe("getHighestScNonceFromCheckpoints", () => {
    it("should return null for empty cache", async () => {
      const result = await getHighestScNonceFromCheckpoints(cache);
      expect(result).toBeNull();
    });

    it("should return null for cache with no SC operations", async () => {
      // #given - only regular proposals
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          stages: [createStage("PROPOSAL_CREATED", "COMPLETED")],
        })
      );

      // #when
      const result = await getHighestScNonceFromCheckpoints(cache);

      // #then
      expect(result).toBeNull();
    });

    it("should return the highest nonce from SC operations", async () => {
      // #given - multiple SC operations with different nonces
      await cache.set(
        "tx:0x111:op:0xaaa",
        createCheckpoint({
          inputType: "timelock",
          stages: [createScTimelockStage("3")],
        })
      );
      await cache.set(
        "tx:0x222:op:0xbbb",
        createCheckpoint({
          inputType: "timelock",
          stages: [createScTimelockStage("9")],
        })
      );
      await cache.set(
        "tx:0x333:op:0xccc",
        createCheckpoint({
          inputType: "timelock",
          stages: [createScTimelockStage("5")],
        })
      );

      // #when
      const result = await getHighestScNonceFromCheckpoints(cache);

      // #then
      expect(result).not.toBeNull();
      expect(result!.toNumber()).toBe(9);
    });

    it("should skip completed checkpoints", async () => {
      // #given - completed SC operation with high nonce
      const completed = createCheckpoint({
        inputType: "timelock",
        stages: [
          createScTimelockStage("99"),
          createStage("L2_TO_L1_MESSAGE", "COMPLETED"),
          createStage("L1_TIMELOCK", "COMPLETED"),
          createStage("RETRYABLE_EXECUTED", "COMPLETED"),
        ],
      });
      // Update the L2_TIMELOCK status to COMPLETED
      completed.cachedData.completedStages![0].status = "COMPLETED";

      const incomplete = createCheckpoint({
        inputType: "timelock",
        stages: [createScTimelockStage("5")],
      });

      await cache.set("tx:0x111:op:0xaaa", completed);
      await cache.set("tx:0x222:op:0xbbb", incomplete);

      // #when
      const result = await getHighestScNonceFromCheckpoints(cache);

      // #then - only incomplete checkpoints should be considered
      expect(result).not.toBeNull();
      expect(result!.toNumber()).toBe(5);
    });
  });
});

describe("Security Council Nonce Utilities", () => {
  describe("getHighestScNonce", () => {
    it("should return null for empty array", () => {
      expect(getHighestScNonce([])).toBeNull();
    });

    it("should return single nonce when array has one element", () => {
      const result = getHighestScNonce([BigNumber.from(5)]);
      expect(result?.toNumber()).toBe(5);
    });

    it("should return highest nonce from array", () => {
      const nonces = [BigNumber.from(3), BigNumber.from(9), BigNumber.from(5)];
      const result = getHighestScNonce(nonces);
      expect(result?.toNumber()).toBe(9);
    });
  });

  describe("isScOperationSuperseded", () => {
    it("should return false when highest nonce is null", () => {
      expect(isScOperationSuperseded(BigNumber.from(5), null)).toBe(false);
    });

    it("should return false when operation nonce equals highest", () => {
      expect(isScOperationSuperseded(BigNumber.from(5), BigNumber.from(5))).toBe(false);
    });

    it("should return false when operation nonce is higher", () => {
      expect(isScOperationSuperseded(BigNumber.from(9), BigNumber.from(5))).toBe(false);
    });

    it("should return true when operation nonce is lower", () => {
      expect(isScOperationSuperseded(BigNumber.from(3), BigNumber.from(9))).toBe(true);
    });
  });
});

/**
 * Helper to create an SC timelock stage with a specific nonce.
 * Includes minimal required fields for TimelockStageData to satisfy type checking.
 */
function createScTimelockStage(nonce: string): TrackedStage {
  return createScTimelockStageWithStatus(nonce, "PENDING");
}

/**
 * Helper to create an SC timelock stage with a specific nonce and status.
 */
function createScTimelockStageWithStatus(
  nonce: string,
  status: "PENDING" | "READY" | "COMPLETED" | "FAILED"
): TrackedStage {
  return {
    type: "L2_TIMELOCK",
    status,
    chain: "arb1",
    chainId: 42161,
    transactions: [],
    data: {
      isSecurityCouncilOperation: true,
      securityCouncilNonce: nonce,
      operationId: "0x" + "a".repeat(64),
      timelockAddress: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
      callScheduledData: [],
    },
  } as TrackedStage;
}
