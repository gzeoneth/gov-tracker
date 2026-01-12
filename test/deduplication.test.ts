/**
 * Tests for checkpoint deduplication helpers
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  linkCheckpointToChild,
  getParentCheckpoint,
  isChildCheckpoint,
  filterChildCheckpoints,
  getChildToParentMap,
  getChildCheckpoints,
  getDeduplicationStats,
  isSecurityCouncilTimelockOp,
} from "../src/deduplication";
import { MemoryCache } from "../src/tracker/cache";
import { TrackingCheckpoint, TrackingResult } from "../src/types";
import { ADDRESSES } from "../src/constants";

describe("Deduplication Helpers", () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  describe("isSecurityCouncilTimelockOp", () => {
    it("should return true when calldata contains SC Manager address", () => {
      // #given
      const scManagerAddr = ADDRESSES.SECURITY_COUNCIL_MANAGER.toLowerCase().slice(2);
      const calldata = `0x1234${scManagerAddr}5678`;

      // #when
      const result = isSecurityCouncilTimelockOp(calldata);

      // #then
      expect(result).toBe(true);
    });

    it("should return false when calldata does not contain SC Manager address", () => {
      // #given
      const calldata = "0x123456789abcdef";

      // #when
      const result = isSecurityCouncilTimelockOp(calldata);

      // #then
      expect(result).toBe(false);
    });
  });

  describe("linkCheckpointToChild", () => {
    it("should link a child checkpoint to its parent", async () => {
      // #given
      const childCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x123",
          operationId: "0xabc",
          scheduledTxHash: "0x456",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };
      await cache.set("tx:0x456", childCheckpoint);

      // #when
      await linkCheckpointToChild("tx:0x456", "election:5", cache);

      // #then
      const updated = await cache.get<TrackingCheckpoint>("tx:0x456");
      expect(updated?.metadata?.sourceCheckpoint).toBe("election:5");
    });

    it("should not fail when child checkpoint does not exist", async () => {
      // #given - no checkpoint in cache

      // #when / #then - should not throw
      await expect(
        linkCheckpointToChild("tx:0xnonexistent", "election:5", cache)
      ).resolves.not.toThrow();
    });
  });

  describe("getParentCheckpoint", () => {
    it("should return parent key when checkpoint has one", async () => {
      // #given
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x123",
          operationId: "0xabc",
          scheduledTxHash: "0x456",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "election:3" },
      };
      await cache.set("tx:0x456", checkpoint);

      // #when
      const parent = await getParentCheckpoint("tx:0x456", cache);

      // #then
      expect(parent).toBe("election:3");
    });

    it("should return null when checkpoint has no parent", async () => {
      // #given
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x123",
          operationId: "0xabc",
          scheduledTxHash: "0x456",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };
      await cache.set("tx:0x456", checkpoint);

      // #when
      const parent = await getParentCheckpoint("tx:0x456", cache);

      // #then
      expect(parent).toBeNull();
    });
  });

  describe("isChildCheckpoint", () => {
    it("should return true for child checkpoints", async () => {
      // #given
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x123",
          operationId: "0xabc",
          scheduledTxHash: "0x456",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "tx:0x789" },
      };
      await cache.set("tx:0x456", checkpoint);

      // #when
      const isChild = await isChildCheckpoint("tx:0x456", cache);

      // #then
      expect(isChild).toBe(true);
    });

    it("should return false for root checkpoints", async () => {
      // #given
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0x123",
          proposalId: "1",
          creationTxHash: "0x456",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };
      await cache.set("tx:0x456", checkpoint);

      // #when
      const isChild = await isChildCheckpoint("tx:0x456", cache);

      // #then
      expect(isChild).toBe(false);
    });
  });

  describe("filterChildCheckpoints", () => {
    it("should filter out child checkpoints from results", () => {
      // #given
      const rootResult: TrackingResult = {
        input: {
          type: "governor",
          governorAddress: "0x123",
          proposalId: "1",
          creationTxHash: "0x456",
        },
        stages: [],
        checkpoint: {
          version: 1,
          createdAt: Date.now(),
          input: {
            type: "governor",
            governorAddress: "0x123",
            proposalId: "1",
            creationTxHash: "0x456",
          },
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 0, l2: 0 },
          cachedData: {},
        },
        isComplete: false,
      };

      const childResult: TrackingResult = {
        input: {
          type: "timelock",
          timelockAddress: "0x789",
          operationId: "0xabc",
          scheduledTxHash: "0xdef",
        },
        stages: [],
        checkpoint: {
          version: 1,
          createdAt: Date.now(),
          input: {
            type: "timelock",
            timelockAddress: "0x789",
            operationId: "0xabc",
            scheduledTxHash: "0xdef",
          },
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 0, l2: 0 },
          cachedData: {},
          metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "tx:0x456" },
        },
        isComplete: false,
      };

      // #when
      const filtered = filterChildCheckpoints([rootResult, childResult]);

      // #then
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(rootResult);
    });
  });

  describe("getChildToParentMap", () => {
    it("should return map of child to parent relationships", async () => {
      // #given
      const root: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 5 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };
      const child1: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x123",
          operationId: "0xabc",
          scheduledTxHash: "0x456",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "election:5" },
      };
      const child2: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x789",
          operationId: "0xdef",
          scheduledTxHash: "0xghi",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "election:5" },
      };

      await cache.set("election:5", root);
      await cache.set("tx:0x456", child1);
      await cache.set("tx:0xghi", child2);

      // #when
      const map = await getChildToParentMap(cache);

      // #then
      expect(map.size).toBe(2);
      expect(map.get("tx:0x456")).toBe("election:5");
      expect(map.get("tx:0xghi")).toBe("election:5");
    });
  });

  describe("getChildCheckpoints", () => {
    it("should return all children for a given parent", async () => {
      // #given
      const parent: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 3 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };
      const child1: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x111",
          operationId: "0x1",
          scheduledTxHash: "0xa",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "election:3" },
      };
      const child2: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x222",
          operationId: "0x2",
          scheduledTxHash: "0xb",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "election:3" },
      };
      const unrelated: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x333",
          operationId: "0x3",
          scheduledTxHash: "0xc",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "tx:0xother" },
      };

      await cache.set("election:3", parent);
      await cache.set("tx:0xa", child1);
      await cache.set("tx:0xb", child2);
      await cache.set("tx:0xc", unrelated);

      // #when
      const children = await getChildCheckpoints("election:3", cache);

      // #then
      expect(children).toHaveLength(2);
      expect(children).toContain("tx:0xa");
      expect(children).toContain("tx:0xb");
      expect(children).not.toContain("tx:0xc");
    });
  });

  describe("getDeduplicationStats", () => {
    it("should return correct statistics", async () => {
      // #given
      const election: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 1 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };
      const proposal: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0x123",
          proposalId: "1",
          creationTxHash: "0xabc",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };
      const electionChild: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x111",
          operationId: "0x1",
          scheduledTxHash: "0xa",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "election:1" },
      };
      const proposalChild: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: "0x222",
          operationId: "0x2",
          scheduledTxHash: "0xb",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now(), sourceCheckpoint: "tx:0xabc" },
      };

      await cache.set("election:1", election);
      await cache.set("tx:0xabc", proposal);
      await cache.set("tx:0xa", electionChild);
      await cache.set("tx:0xb", proposalChild);

      // #when
      const stats = await getDeduplicationStats(cache);

      // #then
      expect(stats.totalCheckpoints).toBe(4);
      expect(stats.rootCheckpoints).toBe(2);
      expect(stats.childCheckpoints).toBe(2);
      expect(stats.parentTypes.fromElections).toBe(1);
      expect(stats.parentTypes.fromProposals).toBe(1);
    });
  });
});
