/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for bundled-cache.ts extraction utilities
 *
 * Tests for:
 * - extractProposals: extracts governor checkpoints, excludes elections/timelocks/discovery
 * - extractTimelockOps: extracts timelock checkpoints only
 * - extractElections: extracts election checkpoints only
 * - getWatermarksFromCache: retrieves discovery watermarks
 * - extractOperationIds: maps proposalId -> operationId
 * - extractTimelockLinkFromStages: extracts timelock link from PROPOSAL_QUEUED
 * - getVotingDataFromStages: extracts voting data from VOTING_ACTIVE
 */

import { describe, it, expect } from "vitest";
import {
  extractProposals,
  extractTimelockOps,
  extractElections,
  getWatermarksFromCache,
  extractOperationIds,
  extractTimelockLinkFromStages,
  getVotingDataFromStages,
  BundledCache,
} from "../src/tracker/bundled-cache";
import { StageBuilder } from "../src/stages/builder";
import type {
  TrackingCheckpoint,
  TrackedStage,
  GovernorTrackingInput,
  TimelockTrackingInput,
  ElectionTrackingInput,
  DiscoveryTrackingInput,
} from "../src/types";

function createMockCheckpoint(
  input:
    | GovernorTrackingInput
    | TimelockTrackingInput
    | ElectionTrackingInput
    | DiscoveryTrackingInput,
  stages: TrackedStage[] = [],
  overrides: Partial<TrackingCheckpoint> = {}
): TrackingCheckpoint {
  return {
    version: 1,
    createdAt: Date.now(),
    input,
    lastProcessedStage: stages.length > 0 ? stages[stages.length - 1].type : null,
    lastProcessedBlock: { l1: 100, l2: 200 },
    cachedData: {
      completedStages: stages,
    },
    ...overrides,
  };
}

describe("Bundled Cache Extraction Utilities", () => {
  describe("extractProposals", () => {
    it("should extract governor checkpoints with all fields", () => {
      // #given - cache with a governor checkpoint containing completed stages
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED")
        .data({ proposer: "0xProposer", description: "Test", startBlock: "100", endBlock: "200" })
        .tx("0xCreateTx", 100, "arb1", 42161)
        .build();

      const votingActive = new StageBuilder("VOTING_ACTIVE", "arb1", "COMPLETED")
        .data({
          forVotes: "1000",
          forVotesRaw: "1000000000000000000000",
          againstVotes: "500",
          againstVotesRaw: "500000000000000000000",
          abstainVotes: "100",
          abstainVotesRaw: "100000000000000000000",
          quorum: "500",
          quorumRaw: "500000000000000000000",
          quorumReached: true,
          deadline: "300",
          proposalState: "Succeeded",
        })
        .build();

      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          timelockAddress: "0xTimelock",
          operationId: "0xOperationId",
          eta: 1700000000,
        })
        .tx("0xQueueTx", 300, "arb1", 42161)
        .build();

      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": createMockCheckpoint(input, [
          proposalCreated,
          votingActive,
          proposalQueued,
        ]),
      };

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should return proposal with all fields extracted
      expect(proposals).toHaveLength(1);
      expect(proposals[0].cacheKey).toBe("tx:0xCreateTx");
      expect(proposals[0].proposalId).toBe("12345");
      expect(proposals[0].governorAddress).toBe("0xGovernor");
      expect(proposals[0].creationTxHash).toBe("0xCreateTx");
      expect(proposals[0].stages).toHaveLength(3);
      expect(proposals[0].isComplete).toBe(true);
      expect(proposals[0].operationId).toBe("0xOperationId");
      // Derived from PROPOSAL_QUEUED=COMPLETED, supersedes the (stale) voting snapshot
      expect(proposals[0].currentState).toBe("Queued");
    });

    it("should merge linked timelock stages and derive Executed state", () => {
      // #given - a modular parent checkpoint (3 governor stages) whose linked
      // timelock checkpoint holds the 4 timelock stages all COMPLETED.
      // Without merging, consumers see only 3 stages and currentState freezes
      // at "Queued". This is the tally-zero list-view bug.
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED")
        .data({ proposer: "0xProposer", description: "T", startBlock: "100", endBlock: "200" })
        .tx("0xCreateTx", 100, "arb1", 42161)
        .build();
      const votingActive = new StageBuilder("VOTING_ACTIVE", "arb1", "COMPLETED")
        .data({ proposalState: "Queued" })
        .build();
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({ timelockAddress: "0xTimelock", operationId: "0xOpId", eta: 1700000000 })
        .tx("0xQueueTx", 300, "arb1", 42161)
        .build();

      const l2Timelock = new StageBuilder("L2_TIMELOCK", "arb1", "COMPLETED").build();
      const l2ToL1 = new StageBuilder("L2_TO_L1_MESSAGE", "arb1", "COMPLETED").build();
      const l1Timelock = new StageBuilder("L1_TIMELOCK", "ethereum", "COMPLETED").build();
      const retryables = new StageBuilder("RETRYABLE_EXECUTED", "arb1", "COMPLETED").build();

      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "11217799",
        creationTxHash: "0xCreateTx",
      };
      const timelockInput: TimelockTrackingInput = {
        type: "timelock",
        timelockAddress: "0xTimelock",
        operationId: "0xOpId",
        scheduledTxHash: "0xQueueTx",
      };

      const parent = createMockCheckpoint(input, [proposalCreated, votingActive, proposalQueued]);
      parent.metadata = {
        errorCount: 0,
        lastTrackedAt: Date.now(),
        timelockOpKey: "tx:0xQueueTx:op:0xOpId",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": parent,
        "tx:0xQueueTx:op:0xOpId": createMockCheckpoint(timelockInput, [
          l2Timelock,
          l2ToL1,
          l1Timelock,
          retryables,
        ]),
      };

      // #when
      const proposals = extractProposals(cache);

      // #then - full 7-stage lifecycle surfaces with derived Executed state
      expect(proposals).toHaveLength(1);
      expect(proposals[0].stages).toHaveLength(7);
      expect(proposals[0].stages.map((s) => s.type)).toEqual([
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ]);
      expect(proposals[0].currentState).toBe("Executed");
      expect(proposals[0].isComplete).toBe(true);
    });

    it("should surface Queued when linked timelock stages are still pending", () => {
      // #given - modular parent with linked timelock mid-flight (L2 still PENDING)
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED").build();
      const votingActive = new StageBuilder("VOTING_ACTIVE", "arb1", "COMPLETED")
        .data({ proposalState: "Queued" })
        .build();
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({ timelockAddress: "0xTL", operationId: "0xOp", eta: 1700000000 })
        .build();
      const l2Pending = new StageBuilder("L2_TIMELOCK", "arb1", "PENDING").build();

      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGov",
        proposalId: "1",
        creationTxHash: "0xC",
      };
      const tlInput: TimelockTrackingInput = {
        type: "timelock",
        timelockAddress: "0xTL",
        operationId: "0xOp",
        scheduledTxHash: "0xC",
      };
      const parent = createMockCheckpoint(input, [proposalCreated, votingActive, proposalQueued]);
      parent.metadata = {
        errorCount: 0,
        lastTrackedAt: Date.now(),
        timelockOpKey: "tx:0xC:op:0xOp",
      };

      const cache: BundledCache = {
        "tx:0xC": parent,
        "tx:0xC:op:0xOp": createMockCheckpoint(tlInput, [l2Pending]),
      };

      // #when
      const proposals = extractProposals(cache);

      // #then - merged, state Queued (derived from PROPOSAL_QUEUED=COMPLETED), incomplete
      expect(proposals[0].stages).toHaveLength(4);
      expect(proposals[0].currentState).toBe("Queued");
      expect(proposals[0].isComplete).toBe(false);
    });

    it("should fall back to parent-only stages when no linked timelock checkpoint exists", () => {
      // #given - a modular parent whose timelockOpKey points at a key not in cache
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED").build();
      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xG",
        proposalId: "1",
        creationTxHash: "0xC",
      };
      const parent = createMockCheckpoint(input, [proposalCreated]);
      parent.metadata = {
        errorCount: 0,
        lastTrackedAt: Date.now(),
        timelockOpKey: "tx:0xMissing:op:0xGone",
      };
      const cache: BundledCache = { "tx:0xC": parent };

      // #when / #then - no crash, parent-only stages
      const proposals = extractProposals(cache);
      expect(proposals[0].stages).toHaveLength(1);
    });

    it("should filter out election checkpoints", () => {
      // #given - cache with election checkpoint (governor type but election key)
      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xNomineeGovernor",
        proposalId: "99999",
        creationTxHash: "0xElectionTx",
      };

      const cache: BundledCache = {
        "election:0": createMockCheckpoint(input, []),
      };

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should exclude election checkpoints
      expect(proposals).toHaveLength(0);
    });

    it("should filter out timelock operation checkpoints", () => {
      // #given - cache with timelock operation key
      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xScheduleTx:op:0xOperationId": createMockCheckpoint(input, []),
      };

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should exclude timelock op checkpoints
      expect(proposals).toHaveLength(0);
    });

    it("should filter out discovery checkpoints", () => {
      // #given - cache with discovery checkpoint
      const input: DiscoveryTrackingInput = {
        type: "discovery",
        id: "watermarks",
      };

      const cache: BundledCache = {
        "discovery:watermarks": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {
            discoveryWatermarks: { constitutionalGovernor: 1000 },
          },
        },
      };

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should exclude discovery checkpoints
      expect(proposals).toHaveLength(0);
    });

    it("should handle empty cache", () => {
      // #given - empty cache
      const cache: BundledCache = {};

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should return empty array
      expect(proposals).toHaveLength(0);
    });

    it("should mark incomplete proposals correctly", () => {
      // #given - cache with proposal having PENDING stage
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED")
        .data({ proposer: "0xProposer", description: "Test", startBlock: "100", endBlock: "200" })
        .build();

      const votingActive = new StageBuilder("VOTING_ACTIVE", "arb1", "PENDING")
        .data({
          forVotes: "0",
          forVotesRaw: "0",
          againstVotes: "0",
          againstVotesRaw: "0",
          abstainVotes: "0",
          abstainVotesRaw: "0",
          quorum: "500",
          quorumRaw: "500000000000000000000",
          quorumReached: false,
          deadline: "1000",
        })
        .build();

      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": createMockCheckpoint(input, [proposalCreated, votingActive]),
      };

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should mark as incomplete
      expect(proposals[0].isComplete).toBe(false);
    });

    it("should extract timelockLink when PROPOSAL_QUEUED is complete", () => {
      // #given - cache with complete PROPOSAL_QUEUED stage
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          timelockAddress: "0xTimelock",
          operationId: "0xOperationId",
          eta: 1700000000,
        })
        .tx("0xQueueTx", 300, "arb1", 42161)
        .build();

      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": createMockCheckpoint(input, [proposalQueued]),
      };

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should have timelockLink
      expect(proposals[0].timelockLink).toBeDefined();
      expect(proposals[0].timelockLink?.txHash).toBe("0xQueueTx");
      expect(proposals[0].timelockLink?.operationId).toBe("0xOperationId");
      expect(proposals[0].timelockLink?.timelockAddress).toBe("0xTimelock");
      expect(proposals[0].timelockLink?.queueBlockNumber).toBe(300);
    });

    it("should handle missing cachedData.completedStages", () => {
      // #given - checkpoint with no completedStages
      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {},
        },
      };

      // #when - extracting proposals
      const proposals = extractProposals(cache);

      // #then - should return proposal with empty stages
      expect(proposals).toHaveLength(1);
      expect(proposals[0].stages).toHaveLength(0);
      expect(proposals[0].isComplete).toBe(false);
    });
  });

  describe("extractTimelockOps", () => {
    it("should extract timelock checkpoints with all fields", () => {
      // #given - cache with timelock checkpoint
      const l2Timelock = new StageBuilder("L2_TIMELOCK", "arb1", "COMPLETED")
        .data({
          operationId: "0xOperationId",
          timelockAddress: "0xTimelock",
          callScheduledData: [],
          eta: 1700000000,
        })
        .tx("0xExecuteTx", 400, "arb1", 42161)
        .build();

      const input: TimelockTrackingInput = {
        type: "timelock",
        timelockAddress: "0xTimelock",
        operationId: "0xOperationId",
        scheduledTxHash: "0xScheduleTx",
      };

      const cache: BundledCache = {
        "tx:0xScheduleTx:op:0xoperationid": createMockCheckpoint(input, [l2Timelock]),
      };

      // #when - extracting timelock ops
      const timelockOps = extractTimelockOps(cache);

      // #then - should return timelock op with all fields
      expect(timelockOps).toHaveLength(1);
      expect(timelockOps[0].cacheKey).toBe("tx:0xScheduleTx:op:0xoperationid");
      expect(timelockOps[0].timelockAddress).toBe("0xTimelock");
      expect(timelockOps[0].operationId).toBe("0xOperationId");
      expect(timelockOps[0].scheduledTxHash).toBe("0xScheduleTx");
      expect(timelockOps[0].stages).toHaveLength(1);
      expect(timelockOps[0].isComplete).toBe(true);
    });

    it("should filter out non-timelock checkpoints", () => {
      // #given - cache with governor and election checkpoints
      const governorInput: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const electionInput: ElectionTrackingInput = {
        type: "election",
        electionIndex: 0,
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": createMockCheckpoint(governorInput, []),
        "election:0": createMockCheckpoint(electionInput, []),
      };

      // #when - extracting timelock ops
      const timelockOps = extractTimelockOps(cache);

      // #then - should return empty
      expect(timelockOps).toHaveLength(0);
    });

    it("should mark incomplete timelock ops correctly", () => {
      // #given - timelock with PENDING stage
      const l2Timelock = new StageBuilder("L2_TIMELOCK", "arb1", "PENDING")
        .data({
          operationId: "0xOperationId",
          timelockAddress: "0xTimelock",
          callScheduledData: [],
          waitingForDelay: true,
        })
        .build();

      const input: TimelockTrackingInput = {
        type: "timelock",
        timelockAddress: "0xTimelock",
        operationId: "0xOperationId",
        scheduledTxHash: "0xScheduleTx",
      };

      const cache: BundledCache = {
        "tx:0xScheduleTx:op:0xoperationid": createMockCheckpoint(input, [l2Timelock]),
      };

      // #when - extracting timelock ops
      const timelockOps = extractTimelockOps(cache);

      // #then - should mark as incomplete
      expect(timelockOps[0].isComplete).toBe(false);
    });

    it("should handle missing cachedData.completedStages", () => {
      // #given - timelock checkpoint with no completedStages
      const input: TimelockTrackingInput = {
        type: "timelock",
        timelockAddress: "0xTimelock",
        operationId: "0xOperationId",
        scheduledTxHash: "0xScheduleTx",
      };

      const cache: BundledCache = {
        "tx:0xScheduleTx:op:0xoperationid": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {},
        },
      };

      // #when - extracting timelock ops
      const timelockOps = extractTimelockOps(cache);

      // #then - should return timelock with empty stages
      expect(timelockOps).toHaveLength(1);
      expect(timelockOps[0].stages).toHaveLength(0);
      expect(timelockOps[0].isComplete).toBe(false);
    });
  });

  describe("extractElections", () => {
    it("should extract election checkpoints with all fields", () => {
      // #given - cache with election checkpoint
      const input: ElectionTrackingInput = {
        type: "election",
        electionIndex: 2,
      };

      const cache: BundledCache = {
        "election:2": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {
            completedStages: [],
            electionStatus: { phase: "MEMBER_ELECTION" } as any,
          },
        },
      };

      // #when - extracting elections
      const elections = extractElections(cache);

      // #then - should return election with all fields
      expect(elections).toHaveLength(1);
      expect(elections[0].cacheKey).toBe("election:2");
      expect(elections[0].electionIndex).toBe(2);
      expect(elections[0].phase).toBe("MEMBER_ELECTION");
      expect(elections[0].isComplete).toBe(false);
    });

    it("should mark completed elections correctly", () => {
      // #given - completed election
      const input: ElectionTrackingInput = {
        type: "election",
        electionIndex: 0,
      };

      const cache: BundledCache = {
        "election:0": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {
            completedStages: [],
            electionStatus: { phase: "COMPLETED" } as any,
          },
        },
      };

      // #when - extracting elections
      const elections = extractElections(cache);

      // #then - should mark as complete
      expect(elections[0].isComplete).toBe(true);
      expect(elections[0].phase).toBe("COMPLETED");
    });

    it("should filter out non-election checkpoints", () => {
      // #given - cache with governor checkpoint
      const governorInput: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": createMockCheckpoint(governorInput, []),
      };

      // #when - extracting elections
      const elections = extractElections(cache);

      // #then - should return empty
      expect(elections).toHaveLength(0);
    });

    it("should handle election with stages", () => {
      // #given - election with tracked stages
      const createElection = new StageBuilder("CREATE_ELECTION", "arb1", "COMPLETED")
        .data({ electionIndex: 1, cohort: 0, startTimestamp: 1700000000 })
        .build();

      const input: ElectionTrackingInput = {
        type: "election",
        electionIndex: 1,
      };

      const cache: BundledCache = {
        "election:1": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: "CREATE_ELECTION",
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {
            completedStages: [createElection],
            electionStatus: { phase: "NOMINEE_SELECTION" } as any,
          },
        },
      };

      // #when - extracting elections
      const elections = extractElections(cache);

      // #then - should include stages
      expect(elections[0].stages).toHaveLength(1);
      expect(elections[0].stages[0].type).toBe("CREATE_ELECTION");
    });

    it("should handle missing cachedData.completedStages", () => {
      // #given - election checkpoint with no completedStages
      const input: ElectionTrackingInput = {
        type: "election",
        electionIndex: 3,
      };

      const cache: BundledCache = {
        "election:3": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {
            electionStatus: { phase: "NOMINEE_SELECTION" } as any,
          },
        },
      };

      // #when - extracting elections
      const elections = extractElections(cache);

      // #then - should return election with empty stages
      expect(elections).toHaveLength(1);
      expect(elections[0].stages).toHaveLength(0);
      expect(elections[0].electionIndex).toBe(3);
    });
  });

  describe("getWatermarksFromCache", () => {
    it("should return watermarks when present", () => {
      // #given - cache with discovery checkpoint containing watermarks
      const input: DiscoveryTrackingInput = {
        type: "discovery",
        id: "watermarks",
      };

      const cache: BundledCache = {
        "discovery:watermarks": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {
            discoveryWatermarks: {
              constitutionalGovernor: 1000,
              nonConstitutionalGovernor: 2000,
              l2ConstitutionalTimelock: 3000,
            },
          },
        },
      };

      // #when - getting watermarks
      const watermarks = getWatermarksFromCache(cache);

      // #then - should return watermarks
      expect(watermarks).toBeDefined();
      expect(watermarks?.constitutionalGovernor).toBe(1000);
      expect(watermarks?.nonConstitutionalGovernor).toBe(2000);
      expect(watermarks?.l2ConstitutionalTimelock).toBe(3000);
    });

    it("should return null when discovery checkpoint missing", () => {
      // #given - cache without discovery checkpoint
      const cache: BundledCache = {
        "tx:0xSomeTx": createMockCheckpoint(
          { type: "governor", governorAddress: "0x", proposalId: "1", creationTxHash: "0x" },
          []
        ),
      };

      // #when - getting watermarks
      const watermarks = getWatermarksFromCache(cache);

      // #then - should return null
      expect(watermarks).toBeNull();
    });

    it("should return null when discoveryWatermarks missing in cachedData", () => {
      // #given - discovery checkpoint without watermarks in cachedData
      const input: DiscoveryTrackingInput = {
        type: "discovery",
        id: "watermarks",
      };

      const cache: BundledCache = {
        "discovery:watermarks": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {},
        },
      };

      // #when - getting watermarks
      const watermarks = getWatermarksFromCache(cache);

      // #then - should return null
      expect(watermarks).toBeNull();
    });
  });

  describe("extractOperationIds", () => {
    it("should extract operationId from governor checkpoints", () => {
      // #given - cache with governor checkpoints having operationIds
      const proposalQueued1 = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          timelockAddress: "0xTimelock",
          operationId: "0xOperationId1",
        })
        .build();

      const proposalQueued2 = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          timelockAddress: "0xTimelock",
          operationId: "0xOperationId2",
        })
        .build();

      const input1: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx1",
      };

      const input2: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "67890",
        creationTxHash: "0xCreateTx2",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx1": createMockCheckpoint(input1, [proposalQueued1]),
        "tx:0xCreateTx2": createMockCheckpoint(input2, [proposalQueued2]),
      };

      // #when - extracting operation IDs
      const operationIds = extractOperationIds(cache);

      // #then - should return map with both mappings
      expect(operationIds.size).toBe(2);
      expect(operationIds.get("12345")).toBe("0xOperationId1");
      expect(operationIds.get("67890")).toBe("0xOperationId2");
    });

    it("should skip checkpoints without operationId", () => {
      // #given - cache with checkpoint that has no PROPOSAL_QUEUED or no operationId
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED")
        .data({ proposer: "0xProposer", description: "Test", startBlock: "100", endBlock: "200" })
        .build();

      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": createMockCheckpoint(input, [proposalCreated]),
      };

      // #when - extracting operation IDs
      const operationIds = extractOperationIds(cache);

      // #then - should return empty map
      expect(operationIds.size).toBe(0);
    });

    it("should skip non-governor checkpoints", () => {
      // #given - cache with timelock checkpoint
      const l2Timelock = new StageBuilder("L2_TIMELOCK", "arb1", "COMPLETED")
        .data({
          operationId: "0xOperationId",
          timelockAddress: "0xTimelock",
          callScheduledData: [],
        })
        .build();

      const input: TimelockTrackingInput = {
        type: "timelock",
        timelockAddress: "0xTimelock",
        operationId: "0xOperationId",
        scheduledTxHash: "0xScheduleTx",
      };

      const cache: BundledCache = {
        "tx:0xScheduleTx:op:0xoperationid": createMockCheckpoint(input, [l2Timelock]),
      };

      // #when - extracting operation IDs
      const operationIds = extractOperationIds(cache);

      // #then - should return empty map
      expect(operationIds.size).toBe(0);
    });

    it("should handle empty cache", () => {
      // #given - empty cache
      const cache: BundledCache = {};

      // #when - extracting operation IDs
      const operationIds = extractOperationIds(cache);

      // #then - should return empty map
      expect(operationIds.size).toBe(0);
    });

    it("should handle missing cachedData.completedStages", () => {
      // #given - governor checkpoint with no completedStages
      const input: GovernorTrackingInput = {
        type: "governor",
        governorAddress: "0xGovernor",
        proposalId: "12345",
        creationTxHash: "0xCreateTx",
      };

      const cache: BundledCache = {
        "tx:0xCreateTx": {
          version: 1,
          createdAt: Date.now(),
          input,
          lastProcessedStage: null,
          lastProcessedBlock: { l1: 100, l2: 200 },
          cachedData: {},
        },
      };

      // #when - extracting operation IDs
      const operationIds = extractOperationIds(cache);

      // #then - should return empty map since no stages
      expect(operationIds.size).toBe(0);
    });
  });

  describe("extractTimelockLinkFromStages", () => {
    it("should extract timelock link from completed PROPOSAL_QUEUED", () => {
      // #given - stages with completed PROPOSAL_QUEUED having all required fields
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          timelockAddress: "0xTimelockAddress",
          operationId: "0xOperationIdHash",
        })
        .tx("0xQueueTxHash", 500, "arb1", 42161)
        .build();

      const stages: TrackedStage[] = [proposalQueued];

      // #when - extracting timelock link
      const link = extractTimelockLinkFromStages(stages);

      // #then - should return complete timelock link
      expect(link).toBeDefined();
      expect(link?.txHash).toBe("0xQueueTxHash");
      expect(link?.operationId).toBe("0xOperationIdHash");
      expect(link?.timelockAddress).toBe("0xTimelockAddress");
      expect(link?.queueBlockNumber).toBe(500);
    });

    it("should return undefined when PROPOSAL_QUEUED not completed", () => {
      // #given - stages with PENDING PROPOSAL_QUEUED
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "PENDING")
        .data({
          proposalState: "Active",
          timelockAddress: "0xTimelock",
          operationId: "0xOperationId",
        })
        .tx("0xQueueTx", 500, "arb1", 42161)
        .build();

      const stages: TrackedStage[] = [proposalQueued];

      // #when - extracting timelock link
      const link = extractTimelockLinkFromStages(stages);

      // #then - should return undefined
      expect(link).toBeUndefined();
    });

    it("should return undefined when PROPOSAL_QUEUED is missing", () => {
      // #given - stages without PROPOSAL_QUEUED
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED")
        .data({ proposer: "0xProposer", description: "Test", startBlock: "100", endBlock: "200" })
        .build();

      const stages: TrackedStage[] = [proposalCreated];

      // #when - extracting timelock link
      const link = extractTimelockLinkFromStages(stages);

      // #then - should return undefined
      expect(link).toBeUndefined();
    });

    it("should return undefined when transaction hash is missing", () => {
      // #given - PROPOSAL_QUEUED without transaction
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          timelockAddress: "0xTimelock",
          operationId: "0xOperationId",
        })
        .build();

      const stages: TrackedStage[] = [proposalQueued];

      // #when - extracting timelock link
      const link = extractTimelockLinkFromStages(stages);

      // #then - should return undefined due to missing tx
      expect(link).toBeUndefined();
    });

    it("should return undefined when operationId is missing", () => {
      // #given - PROPOSAL_QUEUED without operationId
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          timelockAddress: "0xTimelock",
        })
        .tx("0xQueueTx", 500, "arb1", 42161)
        .build();

      const stages: TrackedStage[] = [proposalQueued];

      // #when - extracting timelock link
      const link = extractTimelockLinkFromStages(stages);

      // #then - should return undefined due to missing operationId
      expect(link).toBeUndefined();
    });

    it("should return undefined when timelockAddress is missing", () => {
      // #given - PROPOSAL_QUEUED without timelockAddress
      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({
          proposalState: "Queued",
          operationId: "0xOperationId",
        })
        .tx("0xQueueTx", 500, "arb1", 42161)
        .build();

      const stages: TrackedStage[] = [proposalQueued];

      // #when - extracting timelock link
      const link = extractTimelockLinkFromStages(stages);

      // #then - should return undefined due to missing timelockAddress
      expect(link).toBeUndefined();
    });

    it("should handle empty stages array", () => {
      // #given - empty stages array
      const stages: TrackedStage[] = [];

      // #when - extracting timelock link
      const link = extractTimelockLinkFromStages(stages);

      // #then - should return undefined
      expect(link).toBeUndefined();
    });
  });

  describe("getVotingDataFromStages", () => {
    it("should extract voting data from VOTING_ACTIVE stage", () => {
      // #given - stages with VOTING_ACTIVE containing vote data
      const votingActive = new StageBuilder("VOTING_ACTIVE", "arb1", "COMPLETED")
        .data({
          forVotes: "1000",
          forVotesRaw: "1000000000000000000000",
          againstVotes: "500",
          againstVotesRaw: "500000000000000000000",
          abstainVotes: "100",
          abstainVotesRaw: "100000000000000000000",
          quorum: "500",
          quorumRaw: "500000000000000000000",
          quorumReached: true,
          deadline: "300",
          proposalState: "Succeeded",
        })
        .build();

      const stages: TrackedStage[] = [votingActive];

      // #when - getting voting data
      const votingData = getVotingDataFromStages(stages);

      // #then - should return complete voting data
      expect(votingData).toBeDefined();
      expect(votingData?.forVotes).toBe("1000");
      expect(votingData?.forVotesRaw).toBe("1000000000000000000000");
      expect(votingData?.againstVotes).toBe("500");
      expect(votingData?.againstVotesRaw).toBe("500000000000000000000");
      expect(votingData?.abstainVotes).toBe("100");
      expect(votingData?.quorum).toBe("500");
      expect(votingData?.quorumReached).toBe(true);
      expect(votingData?.deadline).toBe("300");
      expect(votingData?.proposalState).toBe("Succeeded");
    });

    it("should return null when VOTING_ACTIVE is missing", () => {
      // #given - stages without VOTING_ACTIVE
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED")
        .data({ proposer: "0xProposer", description: "Test", startBlock: "100", endBlock: "200" })
        .build();

      const stages: TrackedStage[] = [proposalCreated];

      // #when - getting voting data
      const votingData = getVotingDataFromStages(stages);

      // #then - should return null
      expect(votingData).toBeNull();
    });

    it("should handle empty stages array", () => {
      // #given - empty stages array
      const stages: TrackedStage[] = [];

      // #when - getting voting data
      const votingData = getVotingDataFromStages(stages);

      // #then - should return null
      expect(votingData).toBeNull();
    });

    it("should extract voting data regardless of status", () => {
      // #given - stages with PENDING VOTING_ACTIVE
      const votingActive = new StageBuilder("VOTING_ACTIVE", "arb1", "PENDING")
        .data({
          forVotes: "0",
          forVotesRaw: "0",
          againstVotes: "0",
          againstVotesRaw: "0",
          abstainVotes: "0",
          abstainVotesRaw: "0",
          quorum: "500",
          quorumRaw: "500000000000000000000",
          quorumReached: false,
          deadline: "1000",
        })
        .build();

      const stages: TrackedStage[] = [votingActive];

      // #when - getting voting data
      const votingData = getVotingDataFromStages(stages);

      // #then - should return voting data even when pending
      expect(votingData).toBeDefined();
      expect(votingData?.forVotes).toBe("0");
      expect(votingData?.quorumReached).toBe(false);
    });

    it("should find VOTING_ACTIVE among multiple stages", () => {
      // #given - multiple stages including VOTING_ACTIVE
      const proposalCreated = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED")
        .data({ proposer: "0xProposer", description: "Test", startBlock: "100", endBlock: "200" })
        .build();

      const votingActive = new StageBuilder("VOTING_ACTIVE", "arb1", "COMPLETED")
        .data({
          forVotes: "750",
          forVotesRaw: "750000000000000000000",
          againstVotes: "250",
          againstVotesRaw: "250000000000000000000",
          abstainVotes: "50",
          abstainVotesRaw: "50000000000000000000",
          quorum: "500",
          quorumRaw: "500000000000000000000",
          quorumReached: true,
          deadline: "300",
        })
        .build();

      const proposalQueued = new StageBuilder("PROPOSAL_QUEUED", "arb1", "COMPLETED")
        .data({ proposalState: "Queued" })
        .build();

      const stages: TrackedStage[] = [proposalCreated, votingActive, proposalQueued];

      // #when - getting voting data
      const votingData = getVotingDataFromStages(stages);

      // #then - should find and return VOTING_ACTIVE data
      expect(votingData).toBeDefined();
      expect(votingData?.forVotes).toBe("750");
    });
  });
});
