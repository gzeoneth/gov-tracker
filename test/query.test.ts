/**
 * Tracker Query Module Tests
 *
 * Tests for cache query and statistics functions.
 * Uses mock cache adapter - no RPC calls required.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  listCheckpointKeys,
  getCheckpoint,
  getAllCheckpoints,
  queryIncompleteCheckpoints,
  getStats,
} from "../src/tracker/query";
import type { CacheAdapter, TrackingCheckpoint, TrackedStage } from "../src/types";
import { ADDRESSES } from "../src/constants";

/**
 * Mock cache adapter for testing
 */
class MockCache implements CacheAdapter {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Helper to create a minimal checkpoint for testing
 */
function createCheckpoint(
  overrides: Partial<TrackingCheckpoint> & {
    stages?: TrackedStage[];
    inputType?: "governor" | "timelock";
    governorAddress?: string;
  } = {}
): TrackingCheckpoint {
  const stages = overrides.stages ?? [];
  return {
    input: {
      type: overrides.inputType ?? "governor",
      txHash: "0x" + "a".repeat(64),
      governorAddress: overrides.governorAddress,
    },
    cachedData: {
      completedStages: stages,
    },
    metadata: overrides.metadata ?? { errorCount: 0, lastTrackedAt: Date.now() },
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  } as TrackingCheckpoint;
}

/**
 * Helper to create a completed stage
 */
function createStage(
  type: string,
  status: "NOT_STARTED" | "PENDING" | "READY" | "COMPLETED" | "FAILED" | "SKIPPED"
): TrackedStage {
  return {
    type: type as any,
    status,
    chain: "arb1",
    chainId: 42161,
    transactions: [],
    data: {},
  };
}

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

    it("should skip checkpoints with failed voting even with non-terminal stages (line 89)", async () => {
      // #given - checkpoint with failed voting AND non-terminal stage
      // This edge case hits the votingStage?.status === "FAILED" check (line 89)
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

      // Election (nominee governor)
      await cache.set(
        "tx:0x222",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
          stages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "COMPLETED"),
          ],
        })
      );

      // Election (member governor)
      await cache.set(
        "tx:0x333",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.ELECTION_MEMBER_GOVERNOR,
          stages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "COMPLETED"),
          ],
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
      // Complete election (all stages done)
      await cache.set(
        "tx:0x111",
        createCheckpoint({
          inputType: "governor",
          governorAddress: ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
          stages: [
            createStage("PROPOSAL_CREATED", "COMPLETED"),
            createStage("VOTING_ACTIVE", "COMPLETED"),
          ],
        })
      );

      const result = await getStats(cache);
      expect(result.elections.total).toBe(1);
      expect(result.elections.complete).toBe(1);
    });
  });
});
