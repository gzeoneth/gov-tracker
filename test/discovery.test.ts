/**
 * Tests for Discovery Modules
 *
 * Tests for governor-discovery, timelock-discovery, and security-council modules.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ethers, BigNumber } from "ethers";
import type { CacheAdapter, TrackingCheckpoint, DiscoveryWatermarks } from "../src/types";
import {
  detectProposalType,
  isElectionProposal,
  parseProposalCreatedEvent,
} from "../src/discovery/governor-discovery";
import {
  isKnownL2Timelock,
  isL1Timelock,
  getL2TimelockForGovernor,
  parseCallScheduledEvent,
  parseCallExecutedEvent,
} from "../src/discovery/timelock-discovery";
import {
  isSecurityCouncilElectionProposal,
  isSecurityCouncilOperation,
} from "../src/discovery/security-council";
import {
  loadWatermarks,
  saveWatermarks,
  createPendingCheckpoints,
  WATERMARKS_KEY,
  DiscoveredProposal,
  DiscoveredTimelockOp,
} from "../src/tracker/discovery";
import { ADDRESSES } from "../src/constants";
import { proposalCreatedInterface, timelockInterface } from "../src/abis";

describe("Governor Discovery", () => {
  describe("detectProposalType", () => {
    it("should detect CONSTITUTIONAL governor", () => {
      expect(detectProposalType(ADDRESSES.CONSTITUTIONAL_GOVERNOR)).toBe("CONSTITUTIONAL");
    });

    it("should detect NON_CONSTITUTIONAL governor", () => {
      expect(detectProposalType(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR)).toBe("NON_CONSTITUTIONAL");
    });

    it("should detect ELECTION_NOMINEE governor", () => {
      expect(detectProposalType(ADDRESSES.ELECTION_NOMINEE_GOVERNOR)).toBe("ELECTION_NOMINEE");
    });

    it("should detect ELECTION_MEMBER governor", () => {
      expect(detectProposalType(ADDRESSES.ELECTION_MEMBER_GOVERNOR)).toBe("ELECTION_MEMBER");
    });

    it("should return UNKNOWN for unrecognized address", () => {
      expect(detectProposalType("0x0000000000000000000000000000000000000001")).toBe("UNKNOWN");
    });

    it("should be case insensitive", () => {
      expect(detectProposalType(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase())).toBe(
        "CONSTITUTIONAL"
      );
      expect(detectProposalType(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toUpperCase())).toBe(
        "CONSTITUTIONAL"
      );
    });
  });

  describe("isElectionProposal", () => {
    it("should return true for ELECTION_NOMINEE", () => {
      expect(isElectionProposal("ELECTION_NOMINEE")).toBe(true);
    });

    it("should return true for ELECTION_MEMBER", () => {
      expect(isElectionProposal("ELECTION_MEMBER")).toBe(true);
    });

    it("should return false for CONSTITUTIONAL", () => {
      expect(isElectionProposal("CONSTITUTIONAL")).toBe(false);
    });

    it("should return false for NON_CONSTITUTIONAL", () => {
      expect(isElectionProposal("NON_CONSTITUTIONAL")).toBe(false);
    });

    it("should return false for UNKNOWN", () => {
      expect(isElectionProposal("UNKNOWN")).toBe(false);
    });
  });

  describe("parseProposalCreatedEvent", () => {
    function createMockProposalCreatedLog(): ethers.providers.Log {
      // Create properly encoded event data
      const eventFragment = proposalCreatedInterface.getEvent("ProposalCreated");

      // Encode event with all required fields
      const encodedData = proposalCreatedInterface.encodeEventLog(eventFragment, [
        BigNumber.from("123456789"), // proposalId
        "0x1111111111111111111111111111111111111111", // proposer
        ["0x2222222222222222222222222222222222222222"], // targets
        [BigNumber.from(0)], // values
        [""], // signatures
        ["0xabcd"], // calldatas
        BigNumber.from(100), // startBlock
        BigNumber.from(200), // endBlock
        "Test proposal description", // description
      ]);

      return {
        blockNumber: 50,
        blockHash: "0x" + "a".repeat(64),
        transactionIndex: 0,
        removed: false,
        address: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        data: encodedData.data,
        topics: encodedData.topics,
        transactionHash: "0x" + "b".repeat(64),
        logIndex: 0,
      };
    }

    it("should parse valid ProposalCreated event", () => {
      const log = createMockProposalCreatedLog();
      const result = parseProposalCreatedEvent(log);

      expect(result).not.toBeNull();
      expect(result?.proposalId).toBe("123456789");
      expect(result?.proposer).toBe("0x1111111111111111111111111111111111111111");
      expect(result?.targets).toEqual(["0x2222222222222222222222222222222222222222"]);
      expect(result?.description).toBe("Test proposal description");
      expect(result?.startBlock.toNumber()).toBe(100);
      expect(result?.endBlock.toNumber()).toBe(200);
      expect(result?.creationBlock).toBe(50);
    });

    it("should return null for invalid log data", () => {
      const invalidLog: ethers.providers.Log = {
        blockNumber: 50,
        blockHash: "0x" + "a".repeat(64),
        transactionIndex: 0,
        removed: false,
        address: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        data: "0xinvalid",
        topics: ["0x" + "c".repeat(64)],
        transactionHash: "0x" + "b".repeat(64),
        logIndex: 0,
      };

      const result = parseProposalCreatedEvent(invalidLog);
      expect(result).toBeNull();
    });
  });
});

describe("Timelock Discovery", () => {
  describe("isKnownL2Timelock", () => {
    it("should return true for L2 Constitutional Timelock", () => {
      expect(isKnownL2Timelock(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK)).toBe(true);
    });

    it("should return true for L2 Non-Constitutional Timelock", () => {
      expect(isKnownL2Timelock(ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK)).toBe(true);
    });

    it("should return false for L1 Timelock", () => {
      expect(isKnownL2Timelock(ADDRESSES.L1_TIMELOCK)).toBe(false);
    });

    it("should return false for unknown address", () => {
      expect(isKnownL2Timelock("0x0000000000000000000000000000000000000001")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isKnownL2Timelock(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK.toLowerCase())).toBe(true);
      expect(isKnownL2Timelock(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK.toUpperCase())).toBe(true);
    });
  });

  describe("isL1Timelock", () => {
    it("should return true for L1 Timelock", () => {
      expect(isL1Timelock(ADDRESSES.L1_TIMELOCK)).toBe(true);
    });

    it("should return false for L2 timelocks", () => {
      expect(isL1Timelock(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK)).toBe(false);
      expect(isL1Timelock(ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK)).toBe(false);
    });

    it("should return false for unknown address", () => {
      expect(isL1Timelock("0x0000000000000000000000000000000000000001")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isL1Timelock(ADDRESSES.L1_TIMELOCK.toLowerCase())).toBe(true);
      expect(isL1Timelock(ADDRESSES.L1_TIMELOCK.toUpperCase())).toBe(true);
    });
  });

  describe("getL2TimelockForGovernor", () => {
    it("should return Constitutional Timelock for Constitutional Governor", () => {
      expect(getL2TimelockForGovernor(ADDRESSES.CONSTITUTIONAL_GOVERNOR)).toBe(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK
      );
    });

    it("should return Non-Constitutional Timelock for Non-Constitutional Governor", () => {
      expect(getL2TimelockForGovernor(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR)).toBe(
        ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK
      );
    });

    it("should return null for Election governors", () => {
      expect(getL2TimelockForGovernor(ADDRESSES.ELECTION_NOMINEE_GOVERNOR)).toBeNull();
      expect(getL2TimelockForGovernor(ADDRESSES.ELECTION_MEMBER_GOVERNOR)).toBeNull();
    });

    it("should return null for unknown governor", () => {
      expect(getL2TimelockForGovernor("0x0000000000000000000000000000000000000001")).toBeNull();
    });

    it("should be case insensitive", () => {
      expect(getL2TimelockForGovernor(ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase())).toBe(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK
      );
    });
  });

  describe("parseCallScheduledEvent", () => {
    function createMockCallScheduledLog(): ethers.providers.Log {
      const operationId = "0x" + "a".repeat(64);

      // CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)
      const eventFragment = timelockInterface.getEvent("CallScheduled");

      const encodedData = timelockInterface.encodeEventLog(eventFragment, [
        operationId, // id (indexed)
        BigNumber.from(0), // index (indexed)
        "0x1111111111111111111111111111111111111111", // target
        BigNumber.from(0), // value
        "0xabcdef", // data
        ethers.constants.HashZero, // predecessor
        BigNumber.from(86400), // delay
      ]);

      return {
        blockNumber: 12345,
        blockHash: "0x" + "b".repeat(64),
        transactionIndex: 0,
        removed: false,
        address: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        data: encodedData.data,
        topics: encodedData.topics,
        transactionHash: "0x" + "c".repeat(64),
        logIndex: 0,
      };
    }

    it("should parse valid CallScheduled event", () => {
      const log = createMockCallScheduledLog();
      const result = parseCallScheduledEvent(log);

      expect(result).not.toBeNull();
      expect(result?.operationId).toBe("0x" + "a".repeat(64));
      expect(result?.target).toBe("0x1111111111111111111111111111111111111111");
      expect(result?.value.toNumber()).toBe(0);
      expect(result?.data).toBe("0xabcdef");
      expect(result?.delay.toNumber()).toBe(86400);
      expect(result?.txHash).toBe("0x" + "c".repeat(64));
      expect(result?.blockNumber).toBe(12345);
    });

    it("should return null for invalid log", () => {
      const invalidLog: ethers.providers.Log = {
        blockNumber: 12345,
        blockHash: "0x" + "b".repeat(64),
        transactionIndex: 0,
        removed: false,
        address: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        data: "0x",
        topics: ["0x" + "d".repeat(64)],
        transactionHash: "0x" + "c".repeat(64),
        logIndex: 0,
      };

      const result = parseCallScheduledEvent(invalidLog);
      expect(result).toBeNull();
    });
  });

  describe("parseCallExecutedEvent", () => {
    function createMockCallExecutedLog(): ethers.providers.Log {
      const operationId = "0x" + "e".repeat(64);

      // CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)
      const eventFragment = timelockInterface.getEvent("CallExecuted");

      const encodedData = timelockInterface.encodeEventLog(eventFragment, [
        operationId, // id (indexed)
        BigNumber.from(0), // index (indexed)
        "0x2222222222222222222222222222222222222222", // target
        BigNumber.from(1000), // value
        "0x1234", // data
      ]);

      return {
        blockNumber: 99999,
        blockHash: "0x" + "f".repeat(64),
        transactionIndex: 0,
        removed: false,
        address: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        data: encodedData.data,
        topics: encodedData.topics,
        transactionHash: "0x" + "1".repeat(64),
        logIndex: 0,
      };
    }

    it("should parse valid CallExecuted event", () => {
      const log = createMockCallExecutedLog();
      const result = parseCallExecutedEvent(log);

      expect(result).not.toBeNull();
      expect(result?.operationId).toBe("0x" + "e".repeat(64));
      expect(result?.target).toBe("0x2222222222222222222222222222222222222222");
      expect(result?.value.toNumber()).toBe(1000);
      expect(result?.txHash).toBe("0x" + "1".repeat(64));
      expect(result?.blockNumber).toBe(99999);
    });

    it("should return null for invalid log", () => {
      const invalidLog: ethers.providers.Log = {
        blockNumber: 99999,
        blockHash: "0x" + "f".repeat(64),
        transactionIndex: 0,
        removed: false,
        address: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        data: "invalid",
        topics: [],
        transactionHash: "0x" + "1".repeat(64),
        logIndex: 0,
      };

      const result = parseCallExecutedEvent(invalidLog);
      expect(result).toBeNull();
    });
  });
});

describe("Security Council Discovery", () => {
  describe("isSecurityCouncilElectionProposal", () => {
    it("should return true when targets include Security Council Manager", () => {
      const targets = [
        "0x1111111111111111111111111111111111111111",
        ADDRESSES.SECURITY_COUNCIL_MANAGER,
        "0x2222222222222222222222222222222222222222",
      ];

      expect(isSecurityCouncilElectionProposal(targets)).toBe(true);
    });

    it("should return false when targets do not include Security Council Manager", () => {
      const targets = [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ];

      expect(isSecurityCouncilElectionProposal(targets)).toBe(false);
    });

    it("should be case insensitive", () => {
      const targets = [ADDRESSES.SECURITY_COUNCIL_MANAGER.toLowerCase()];
      expect(isSecurityCouncilElectionProposal(targets)).toBe(true);
    });

    it("should return false for empty targets", () => {
      expect(isSecurityCouncilElectionProposal([])).toBe(false);
    });
  });

  describe("isSecurityCouncilOperation", () => {
    function createMockReceipt(logAddresses: string[]): ethers.providers.TransactionReceipt {
      return {
        to: "0x0000000000000000000000000000000000000000",
        from: "0x0000000000000000000000000000000000000000",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(21000),
        logsBloom: "0x",
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs: logAddresses.map((address, i) => ({
          blockNumber: 12345,
          blockHash: "0x" + "a".repeat(64),
          transactionIndex: 0,
          removed: false,
          address,
          data: "0x",
          topics: [],
          transactionHash: "0x" + "b".repeat(64),
          logIndex: i,
        })),
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(21000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };
    }

    it("should return true when logs include Security Council Manager", () => {
      const receipt = createMockReceipt([
        "0x1111111111111111111111111111111111111111",
        ADDRESSES.SECURITY_COUNCIL_MANAGER,
      ]);

      expect(isSecurityCouncilOperation(receipt)).toBe(true);
    });

    it("should return false when logs do not include Security Council Manager", () => {
      const receipt = createMockReceipt([
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ]);

      expect(isSecurityCouncilOperation(receipt)).toBe(false);
    });

    it("should be case insensitive", () => {
      const receipt = createMockReceipt([ADDRESSES.SECURITY_COUNCIL_MANAGER.toLowerCase()]);

      expect(isSecurityCouncilOperation(receipt)).toBe(true);
    });

    it("should return false for empty logs", () => {
      const receipt = createMockReceipt([]);
      expect(isSecurityCouncilOperation(receipt)).toBe(false);
    });
  });
});

/**
 * Mock cache adapter for testing tracker discovery
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

describe("Tracker Discovery Module", () => {
  let cache: MockCache;

  beforeEach(() => {
    cache = new MockCache();
  });

  describe("loadWatermarks", () => {
    it("should return empty object for undefined cache", async () => {
      const result = await loadWatermarks(undefined);
      expect(result).toEqual({});
    });

    it("should return empty object for empty cache", async () => {
      const result = await loadWatermarks(cache);
      expect(result).toEqual({});
    });

    it("should return watermarks from cached checkpoint", async () => {
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: 100000,
        nonConstitutionalGovernor: 200000,
      };

      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "discovery", id: "watermarks" },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 200000 },
        cachedData: {
          discoveryWatermarks: watermarks,
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      await cache.set(WATERMARKS_KEY, checkpoint);

      const result = await loadWatermarks(cache);
      expect(result).toEqual(watermarks);
    });

    it("should return empty object if checkpoint has no discoveryWatermarks", async () => {
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: { type: "discovery", id: "watermarks" },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      await cache.set(WATERMARKS_KEY, checkpoint);

      const result = await loadWatermarks(cache);
      expect(result).toEqual({});
    });
  });

  describe("saveWatermarks", () => {
    it("should do nothing for undefined cache", async () => {
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: 100000,
      };

      // Should not throw
      await saveWatermarks(watermarks, undefined);
    });

    it("should save watermarks as checkpoint", async () => {
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: 100000,
        nonConstitutionalGovernor: 200000,
        l2ConstitutionalTimelock: 150000,
      };

      await saveWatermarks(watermarks, cache);

      const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
      expect(checkpoint).toBeDefined();
      expect(checkpoint!.input).toEqual({ type: "discovery", id: "watermarks" });
      expect(checkpoint!.cachedData.discoveryWatermarks).toEqual(watermarks);
      // Max L2 block should be 200000
      expect(checkpoint!.lastProcessedBlock.l2).toBe(200000);
      expect(checkpoint!.version).toBe(1);
    });

    it("should calculate max L2 block from all watermarks", async () => {
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: 100000,
        nonConstitutionalGovernor: 200000,
        electionNomineeGovernor: 150000,
        electionMemberGovernor: 175000,
        l2ConstitutionalTimelock: 300000, // This is the max
        l2NonConstitutionalTimelock: 250000,
      };

      await saveWatermarks(watermarks, cache);

      const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
      expect(checkpoint!.lastProcessedBlock.l2).toBe(300000);
    });

    it("should handle empty watermarks", async () => {
      await saveWatermarks({}, cache);

      const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
      expect(checkpoint).toBeDefined();
      expect(checkpoint!.lastProcessedBlock.l2).toBe(0);
    });
  });

  describe("createPendingCheckpoints", () => {
    it("should do nothing for undefined cache", async () => {
      const proposals: DiscoveredProposal[] = [
        {
          proposalId: "12345",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "a".repeat(64),
          creationBlock: 100000,
        },
      ];

      // Should not throw
      await createPendingCheckpoints(proposals, [], undefined);
    });

    it("should create pending checkpoints for proposals", async () => {
      const proposals: DiscoveredProposal[] = [
        {
          proposalId: "12345",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "a".repeat(64),
          creationBlock: 100000,
        },
        {
          proposalId: "67890",
          governorAddress: "0x" + "2".repeat(40),
          creationTxHash: "0x" + "b".repeat(64),
          creationBlock: 200000,
        },
      ];

      await createPendingCheckpoints(proposals, [], cache);

      // Check both proposals were cached
      const cp1 = await cache.get<TrackingCheckpoint>("tx:0x" + "a".repeat(64));
      expect(cp1).not.toBeNull();
      expect(cp1!.input.type).toBe("governor");
      if (cp1!.input.type === "governor") {
        expect(cp1!.input.proposalId).toBe("12345");
        expect(cp1!.metadata?.lastTrackedAt).toBe(0); // Never tracked
      }

      const cp2 = await cache.get<TrackingCheckpoint>("tx:0x" + "b".repeat(64));
      expect(cp2).not.toBeNull();
      if (cp2!.input.type === "governor") {
        expect(cp2!.input.proposalId).toBe("67890");
      }
    });

    it("should skip proposals that already have checkpoints", async () => {
      const existingCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now() - 1000,
        input: {
          type: "governor",
          proposalId: "existing",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "a".repeat(64),
        },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 50000 },
        cachedData: {},
        metadata: { errorCount: 0, lastTrackedAt: Date.now() - 500 },
      };

      // Pre-populate cache with existing checkpoint
      await cache.set("tx:0x" + "a".repeat(64), existingCheckpoint);

      const proposals: DiscoveredProposal[] = [
        {
          proposalId: "12345",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "a".repeat(64), // Same tx hash
          creationBlock: 100000,
        },
      ];

      await createPendingCheckpoints(proposals, [], cache);

      // Should not overwrite existing checkpoint
      const cp = await cache.get<TrackingCheckpoint>("tx:0x" + "a".repeat(64));
      if (cp!.input.type === "governor") {
        expect(cp!.input.proposalId).toBe("existing");
      }
    });

    it("should lowercase transaction hash for cache key", async () => {
      const proposals: DiscoveredProposal[] = [
        {
          proposalId: "12345",
          governorAddress: "0x" + "1".repeat(40),
          creationTxHash: "0x" + "A".repeat(64), // Uppercase
          creationBlock: 100000,
        },
      ];

      await createPendingCheckpoints(proposals, [], cache);

      // Should be stored with lowercase key
      const cp = await cache.get<TrackingCheckpoint>("tx:0x" + "a".repeat(64));
      expect(cp).toBeDefined();
    });

    it("should not create checkpoints for timelock ops (by design)", async () => {
      const timelockOps: DiscoveredTimelockOp[] = [
        {
          operationId: "0x" + "c".repeat(64),
          timelockAddress: "0x" + "3".repeat(40),
          scheduledTxHash: "0x" + "d".repeat(64),
          queueBlock: 100000,
        },
      ];

      await createPendingCheckpoints([], timelockOps, cache);

      // Timelock ops should not create pending checkpoints
      const keys = await cache.keys();
      expect(keys.length).toBe(0);
    });
  });

  describe("WATERMARKS_KEY", () => {
    it("should have correct format", () => {
      expect(WATERMARKS_KEY).toBe("discovery:watermarks");
    });
  });
});

/**
 * RPC-dependent tests for discovery functions
 */
import * as dotenv from "dotenv";
import { discoverProposals, discoverTimelockOps, discoverAll } from "../src/tracker/discovery";
import {
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./fixtures";
import { DEFAULT_RPC_URLS } from "../src/constants";

dotenv.config({ quiet: true });

describe.skipIf(process.env.NO_RPC === "1")(
  "Discovery RPC Tests",
  {
    timeout: 120000,
  },
  () => {
    let l2Provider: ethers.providers.JsonRpcProvider;
    let cache: CacheAdapter;

    beforeEach(() => {
      const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
      l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
      cache = createMemoryCache();
    });

    describe("discoverProposals", () => {
      it("should discover proposals in block range containing known proposal", async () => {
        const creationBlock = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationBlock;
        // Search a small range around the known creation block
        const fromBlock = creationBlock - 10;
        const toBlock = creationBlock + 10;

        const proposals = await discoverProposals(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          fromBlock,
          toBlock,
          l2Provider
        );

        expect(proposals.length).toBeGreaterThan(0);
        const found = proposals.find(
          (p) => p.proposalId === CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.proposalId
        );
        expect(found).toBeDefined();
        expect(found?.creationBlock).toBe(creationBlock);
      });

      it("should return empty array for empty block range", async () => {
        // Use a range with no proposals
        const proposals = await discoverProposals(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          100,
          110,
          l2Provider
        );

        expect(proposals).toEqual([]);
      });
    });

    describe("discoverTimelockOps", () => {
      it("should discover timelock ops in block range containing known op", async () => {
        const queueBlock = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.queueBlockNumber;
        // Search a small range around the known queue block
        const fromBlock = queueBlock - 10;
        const toBlock = queueBlock + 10;

        const ops = await discoverTimelockOps(
          ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          fromBlock,
          toBlock,
          l2Provider
        );

        expect(ops.length).toBeGreaterThan(0);
        const found = ops.find(
          (op) =>
            op.operationId.toLowerCase() ===
            CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.operationId.toLowerCase()
        );
        expect(found).toBeDefined();
      });

      it("should return empty array for empty block range", async () => {
        const ops = await discoverTimelockOps(
          ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          100,
          110,
          l2Provider
        );

        expect(ops).toEqual([]);
      });
    });

    describe("discoverAll", () => {
      it("should discover from multiple targets", async () => {
        const creationBlock = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationBlock;
        const fromBlock = creationBlock - 10;
        const toBlock = creationBlock + 10;

        const result = await discoverAll(
          { constitutionalGovernor: true },
          toBlock,
          l2Provider,
          cache,
          { constitutionalGovernor: fromBlock }
        );

        expect(result.proposals.length).toBeGreaterThan(0);
        expect(result.watermarks.constitutionalGovernor).toBe(toBlock);
      });

      it("should create pending checkpoints for discovered proposals", async () => {
        const creationBlock = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationBlock;
        const fromBlock = creationBlock - 10;
        const toBlock = creationBlock + 10;

        await discoverAll({ constitutionalGovernor: true }, toBlock, l2Provider, cache, {
          constitutionalGovernor: fromBlock,
        });

        // Check that a pending checkpoint was created
        const keysResult = await cache.keys();
        const keys = Array.isArray(keysResult) ? keysResult : Array.from(keysResult);
        expect(keys.length).toBeGreaterThan(0);
        const txKey = keys.find((k: string) => k.startsWith("tx:"));
        expect(txKey).toBeDefined();
      });

      it("should handle multiple governor targets", async () => {
        // Use NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY for a second governor
        const block1 = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationBlock;
        const block2 = NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.creationBlock;

        const result = await discoverAll(
          {
            constitutionalGovernor: true,
            nonConstitutionalGovernor: true,
          },
          Math.max(block1, block2) + 10,
          l2Provider,
          cache,
          {
            constitutionalGovernor: block1 - 10,
            nonConstitutionalGovernor: block2 - 10,
          }
        );

        // Should have discovered from both governors
        expect(result.watermarks.constitutionalGovernor).toBeDefined();
        expect(result.watermarks.nonConstitutionalGovernor).toBeDefined();
      });

      it("should handle timelock targets", async () => {
        const queueBlock = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.queueBlockNumber;
        const fromBlock = queueBlock - 10;
        const toBlock = queueBlock + 10;

        const result = await discoverAll(
          { l2ConstitutionalTimelock: true },
          toBlock,
          l2Provider,
          cache,
          { l2ConstitutionalTimelock: fromBlock }
        );

        expect(result.timelockOps.length).toBeGreaterThan(0);
        expect(result.watermarks.l2ConstitutionalTimelock).toBe(toBlock);
      });

      it("should return empty results for no targets enabled", async () => {
        const result = await discoverAll({}, 1000, l2Provider, cache, {});

        expect(result.proposals).toEqual([]);
        expect(result.timelockOps).toEqual([]);
      });

      it("should work without cache", async () => {
        const creationBlock = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationBlock;
        const fromBlock = creationBlock - 10;
        const toBlock = creationBlock + 10;

        const result = await discoverAll(
          { constitutionalGovernor: true },
          toBlock,
          l2Provider,
          undefined, // No cache
          { constitutionalGovernor: fromBlock }
        );

        expect(result.proposals.length).toBeGreaterThan(0);
      });
    });
  }
);

function createMemoryCache(): CacheAdapter {
  const store = new Map<string, string>();
  return {
    get: async <T>(key: string): Promise<T | null> => {
      const value = store.get(key);
      return value ? JSON.parse(value) : null;
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      store.set(key, JSON.stringify(value));
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
    clear: async (): Promise<void> => {
      store.clear();
    },
    has: async (key: string): Promise<boolean> => {
      return store.has(key);
    },
    keys: async (): Promise<string[]> => {
      return Array.from(store.keys());
    },
  };
}
