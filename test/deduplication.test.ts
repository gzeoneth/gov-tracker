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
  findPotentialParent,
  autoLinkOrphanedCheckpoints,
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

    it("should skip discovery:watermarks key", async () => {
      // #given
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 1 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };
      await cache.set("election:1", checkpoint);
      await cache.set("discovery:watermarks", { some: "data" });

      // #when
      const stats = await getDeduplicationStats(cache);

      // #then
      expect(stats.totalCheckpoints).toBe(1);
    });
  });

  describe("linkCheckpointToChild - edge cases", () => {
    it("should initialize metadata when checkpoint has none", async () => {
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
        // no metadata
      };
      await cache.set("tx:0x456", checkpoint);

      // #when
      await linkCheckpointToChild("tx:0x456", "election:5", cache);

      // #then
      const updated = await cache.get<TrackingCheckpoint>("tx:0x456");
      expect(updated?.metadata).toBeDefined();
      expect(updated?.metadata?.sourceCheckpoint).toBe("election:5");
      expect(updated?.metadata?.errorCount).toBe(0);
    });

    it("should preserve existing metadata fields when linking", async () => {
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
        metadata: { errorCount: 3, lastTrackedAt: 12345 },
      };
      await cache.set("tx:0x456", checkpoint);

      // #when
      await linkCheckpointToChild("tx:0x456", "tx:0x789", cache);

      // #then
      const updated = await cache.get<TrackingCheckpoint>("tx:0x456");
      expect(updated?.metadata?.sourceCheckpoint).toBe("tx:0x789");
      expect(updated?.metadata?.errorCount).toBe(3);
      expect(updated?.metadata?.lastTrackedAt).toBe(12345);
    });
  });

  describe("findPotentialParent", () => {
    it("should return null for non-timelock checkpoints", async () => {
      // #given
      const checkpoint: TrackingCheckpoint = {
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

      // #when
      const parent = await findPotentialParent(checkpoint, cache);

      // #then
      expect(parent).toBeNull();
    });

    it("should find completed election as parent for L2 constitutional timelock", async () => {
      // #given
      const l2ConstitutionalTimelock = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;
      const completedElection: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 2 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {
          electionStatus: {
            electionIndex: 2,
            phase: "COMPLETED",
            cohort: 0,
            nomineeProposalId: "111",
            memberProposalId: "222",
            nomineeProposalState: "Executed",
            memberProposalState: "Executed",
            compliantNomineeCount: 6,
            targetNomineeCount: 6,
            vettingDeadline: null,
            isInVettingPeriod: false,
            canProceedToMemberPhase: false,
            canExecuteMember: false,
          },
        },
      };
      await cache.set("election:2", completedElection);

      const timelockCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: l2ConstitutionalTimelock,
          operationId: "0xabc",
          scheduledTxHash: "0x456",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };

      // #when
      const parent = await findPotentialParent(timelockCheckpoint, cache);

      // #then
      expect(parent).toBe("election:2");
    });

    it("should return null when no completed election exists", async () => {
      // #given
      const l2ConstitutionalTimelock = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;
      const activeElection: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 3 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {
          electionStatus: {
            electionIndex: 3,
            phase: "MEMBER_ELECTION",
            cohort: 1,
            nomineeProposalId: "333",
            memberProposalId: "444",
            nomineeProposalState: "Executed",
            memberProposalState: "Active",
            compliantNomineeCount: 6,
            targetNomineeCount: 6,
            vettingDeadline: null,
            isInVettingPeriod: false,
            canProceedToMemberPhase: false,
            canExecuteMember: false,
          },
        },
      };
      await cache.set("election:3", activeElection);

      const timelockCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: l2ConstitutionalTimelock,
          operationId: "0xdef",
          scheduledTxHash: "0x789",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };

      // #when
      const parent = await findPotentialParent(timelockCheckpoint, cache);

      // #then
      expect(parent).toBeNull();
    });
  });

  describe("autoLinkOrphanedCheckpoints", () => {
    it("should link orphaned timelock checkpoints to potential parents", async () => {
      // #given
      const l2ConstitutionalTimelock = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;

      const completedElection: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 1 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {
          electionStatus: {
            electionIndex: 1,
            phase: "COMPLETED",
            cohort: 0,
            nomineeProposalId: "111",
            memberProposalId: "222",
            nomineeProposalState: "Executed",
            memberProposalState: "Executed",
            compliantNomineeCount: 6,
            targetNomineeCount: 6,
            vettingDeadline: null,
            isInVettingPeriod: false,
            canProceedToMemberPhase: false,
            canExecuteMember: false,
          },
        },
      };
      const orphanedTimelock: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: l2ConstitutionalTimelock,
          operationId: "0xorphan",
          scheduledTxHash: "0xorphantx",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        // no sourceCheckpoint - orphaned
      };

      await cache.set("election:1", completedElection);
      await cache.set("tx:0xorphantx", orphanedTimelock);

      // #when
      const linkedCount = await autoLinkOrphanedCheckpoints(cache);

      // #then
      expect(linkedCount).toBe(1);
      const updated = await cache.get<TrackingCheckpoint>("tx:0xorphantx");
      expect(updated?.metadata?.sourceCheckpoint).toBe("election:1");
    });

    it("should skip already linked checkpoints", async () => {
      // #given
      const l2ConstitutionalTimelock = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;

      const completedElection: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "election", electionIndex: 1 },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {
          electionStatus: {
            electionIndex: 1,
            phase: "COMPLETED",
            cohort: 0,
            nomineeProposalId: "111",
            memberProposalId: "222",
            nomineeProposalState: "Executed",
            memberProposalState: "Executed",
            compliantNomineeCount: 6,
            targetNomineeCount: 6,
            vettingDeadline: null,
            isInVettingPeriod: false,
            canProceedToMemberPhase: false,
            canExecuteMember: false,
          },
        },
      };
      const alreadyLinked: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "timelock",
          timelockAddress: l2ConstitutionalTimelock,
          operationId: "0xlinked",
          scheduledTxHash: "0xlinkedtx",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: {
          errorCount: 0,
          lastTrackedAt: Date.now(),
          sourceCheckpoint: "election:1",
        },
      };

      await cache.set("election:1", completedElection);
      await cache.set("tx:0xlinkedtx", alreadyLinked);

      // #when
      const linkedCount = await autoLinkOrphanedCheckpoints(cache);

      // #then
      expect(linkedCount).toBe(0);
    });

    it("should skip non-timelock checkpoints", async () => {
      // #given
      const governorCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0x123",
          proposalId: "1",
          creationTxHash: "0xgov",
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
      };

      await cache.set("tx:0xgov", governorCheckpoint);

      // #when
      const linkedCount = await autoLinkOrphanedCheckpoints(cache);

      // #then
      expect(linkedCount).toBe(0);
    });
  });

  describe("getCacheKeysAsync edge cases (via getChildToParentMap)", () => {
    it("should handle cache.keys() returning Promise<string[]>", async () => {
      // #given - mock cache where keys() returns a Promise
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

      const asyncKeysCache = {
        get: async <T>(key: string): Promise<T | null> => {
          if (key === "tx:0x456") return checkpoint as unknown as T;
          return null;
        },
        set: async (): Promise<void> => {},
        delete: async (): Promise<void> => {},
        clear: async (): Promise<void> => {},
        has: async (): Promise<boolean> => false,
        keys: (): Promise<string[]> => Promise.resolve(["tx:0x456"]),
      };

      // #when
      const map = await getChildToParentMap(asyncKeysCache);

      // #then
      expect(map.size).toBe(1);
      expect(map.get("tx:0x456")).toBe("tx:0x789");
    });

    it("should handle cache.keys() returning non-iterable non-Promise value", async () => {
      // #given - mock cache where keys() returns an unexpected type (defensive case)
      const brokenKeysCache = {
        get: async <T>(): Promise<T | null> => null,
        set: async (): Promise<void> => {},
        delete: async (): Promise<void> => {},
        clear: async (): Promise<void> => {},
        has: async (): Promise<boolean> => false,
        keys: (): string[] | IterableIterator<string> | Promise<string[]> => {
          // Return something that's not iterable and not a Promise
          // This exercises the fallback return [] on line 51
          return 42 as unknown as string[];
        },
      };

      // #when
      const map = await getChildToParentMap(brokenKeysCache);

      // #then - should return empty map since keys() returned invalid value
      expect(map.size).toBe(0);
    });

    it("should handle cache without keys method", async () => {
      // #given - cache adapter that doesn't implement keys()
      const noKeysCache = {
        get: async <T>(): Promise<T | null> => null,
        set: async (): Promise<void> => {},
        delete: async (): Promise<void> => {},
        clear: async (): Promise<void> => {},
        has: async (): Promise<boolean> => false,
        keys: undefined as unknown as () => Promise<string[]>,
      };

      // #when
      const map = await getChildToParentMap(noKeysCache);

      // #then - should return empty map since keys() is not a function
      expect(map.size).toBe(0);
    });
  });
});
