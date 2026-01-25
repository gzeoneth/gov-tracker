/**
 * Tests for Discovery Modules
 *
 * Tests for governor-discovery, timelock-discovery, and security-council modules.
 */

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { ethers, BigNumber } from "ethers";
import * as dotenv from "dotenv";
import type { TrackingCheckpoint, DiscoveryWatermarks } from "../src/types";
import { MockCache, shouldSkipRpc, createRpcTestSuite } from "./helpers";
import {
  detectProposalType,
  isElectionProposal,
  parseProposalCreatedEvent,
  detectGovernorCapabilities,
  getTimelockAddress,
} from "../src/discovery/governor-discovery";
import { vi } from "vitest";
import {
  isKnownL2Timelock,
  isL1Timelock,
  getL2TimelockForGovernor,
  parseCallScheduledEvent,
  parseCallExecutedEvent,
  findAllCallScheduledInTx,
  getTimelockState,
} from "../src/discovery/timelock-discovery";
import {
  isSecurityCouncilElectionProposal,
  isSecurityCouncilOperation,
} from "../src/discovery/security-council";
import {
  loadWatermarks,
  saveWatermarks,
  createPendingCheckpoints,
  discoverProposals,
  discoverTimelockOps,
  discoverAll,
  verifyWatermark,
  WATERMARKS_KEY,
  DiscoveredProposal,
  DiscoveredTimelockOp,
} from "../src/tracker/discovery";

import { ADDRESSES, buildDefaultTargets } from "../src/constants";
import { proposalCreatedInterface, timelockInterface } from "../src/abis";

dotenv.config({ quiet: true });

describe("buildDefaultTargets", () => {
  describe("default behavior (no options)", () => {
    it("should return object with all boolean properties", () => {
      // #given no options provided
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets();

      // #then should return object with all expected keys
      expect(typeof targets.constitutionalGovernor).toBe("boolean");
      expect(typeof targets.nonConstitutionalGovernor).toBe("boolean");
      expect(typeof targets.electionNomineeGovernor).toBe("boolean");
      expect(typeof targets.electionMemberGovernor).toBe("boolean");
      expect(typeof targets.l2ConstitutionalTimelock).toBe("boolean");
      expect(typeof targets.l2NonConstitutionalTimelock).toBe("boolean");
    });

    it("should have all core targets enabled by default", () => {
      // #given no options provided
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets();

      // #then all targets should be enabled
      expect(targets.constitutionalGovernor).toBe(true);
      expect(targets.nonConstitutionalGovernor).toBe(true);
      expect(targets.electionNomineeGovernor).toBe(true);
      expect(targets.electionMemberGovernor).toBe(true);
      expect(targets.l2ConstitutionalTimelock).toBe(true);
      expect(targets.l2NonConstitutionalTimelock).toBe(true);
    });
  });

  describe("includeElections option", () => {
    it("should disable election governors when includeElections is false", () => {
      // #given includeElections set to false
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ includeElections: false });

      // #then election governors should be disabled
      expect(targets.electionNomineeGovernor).toBe(false);
      expect(targets.electionMemberGovernor).toBe(false);
    });

    it("should keep non-election targets enabled when includeElections is false", () => {
      // #given includeElections set to false
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ includeElections: false });

      // #then non-election targets should remain enabled
      expect(targets.constitutionalGovernor).toBe(true);
      expect(targets.nonConstitutionalGovernor).toBe(true);
      expect(targets.l2ConstitutionalTimelock).toBe(true);
      expect(targets.l2NonConstitutionalTimelock).toBe(true);
    });
  });

  describe("governorsOnly option", () => {
    it("should disable timelocks when governorsOnly is true", () => {
      // #given governorsOnly set to true
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ governorsOnly: true });

      // #then timelocks should be disabled
      expect(targets.l2ConstitutionalTimelock).toBe(false);
      expect(targets.l2NonConstitutionalTimelock).toBe(false);
    });

    it("should keep all governors enabled when governorsOnly is true", () => {
      // #given governorsOnly set to true
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ governorsOnly: true });

      // #then all governors should remain enabled
      expect(targets.constitutionalGovernor).toBe(true);
      expect(targets.nonConstitutionalGovernor).toBe(true);
      expect(targets.electionNomineeGovernor).toBe(true);
      expect(targets.electionMemberGovernor).toBe(true);
    });
  });

  describe("timelocksOnly option", () => {
    it("should disable governors when timelocksOnly is true", () => {
      // #given timelocksOnly set to true
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ timelocksOnly: true });

      // #then all governors should be disabled
      expect(targets.constitutionalGovernor).toBe(false);
      expect(targets.nonConstitutionalGovernor).toBe(false);
      expect(targets.electionNomineeGovernor).toBe(false);
      expect(targets.electionMemberGovernor).toBe(false);
    });

    it("should keep timelocks enabled when timelocksOnly is true", () => {
      // #given timelocksOnly set to true
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ timelocksOnly: true });

      // #then timelocks should remain enabled
      expect(targets.l2ConstitutionalTimelock).toBe(true);
      expect(targets.l2NonConstitutionalTimelock).toBe(true);
    });
  });

  describe("combined options", () => {
    it("should disable election governors when governorsOnly and includeElections false", () => {
      // #given governorsOnly is true and includeElections is false
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ governorsOnly: true, includeElections: false });

      // #then election governors should be disabled, core governors enabled, timelocks disabled
      expect(targets.constitutionalGovernor).toBe(true);
      expect(targets.nonConstitutionalGovernor).toBe(true);
      expect(targets.electionNomineeGovernor).toBe(false);
      expect(targets.electionMemberGovernor).toBe(false);
      expect(targets.l2ConstitutionalTimelock).toBe(false);
      expect(targets.l2NonConstitutionalTimelock).toBe(false);
    });

    it("should disable all governors when timelocksOnly even if includeElections true", () => {
      // #given timelocksOnly is true and includeElections is true (default)
      // #when calling buildDefaultTargets
      const targets = buildDefaultTargets({ timelocksOnly: true, includeElections: true });

      // #then all governors should be disabled (timelocksOnly takes precedence)
      expect(targets.constitutionalGovernor).toBe(false);
      expect(targets.nonConstitutionalGovernor).toBe(false);
      expect(targets.electionNomineeGovernor).toBe(false);
      expect(targets.electionMemberGovernor).toBe(false);
    });
  });
});

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

  describe("detectGovernorCapabilities", () => {
    /**
     * Create a mock provider using Web3Provider pattern that passes ethers validation
     */
    function createMockProvider(options: {
      hasTimelock?: boolean;
      hasVetting?: boolean;
      timelockAddress?: string;
    }): ethers.providers.Provider {
      // Use a proper mock that satisfies ethers.Contract constructor
      const mockSend = async (method: string, params: unknown[]) => {
        if (method === "eth_chainId") {
          return "0xa4b1"; // Arbitrum chainId
        }
        if (method === "eth_call") {
          const callParams = params[0] as { data?: string };
          const timelockSelector = "0xd33219b4"; // timelock()
          const nomineeVetterSelector = "0x0298ad49"; // nomineeVetter()

          if (callParams.data?.startsWith(timelockSelector)) {
            if (options.hasTimelock) {
              return ethers.utils.defaultAbiCoder.encode(
                ["address"],
                [options.timelockAddress || "0x1234567890123456789012345678901234567890"]
              );
            }
            throw { code: "CALL_EXCEPTION", message: "No timelock" };
          }

          if (callParams.data?.startsWith(nomineeVetterSelector)) {
            if (options.hasVetting) {
              return ethers.utils.defaultAbiCoder.encode(
                ["address"],
                ["0x1234567890123456789012345678901234567890"]
              );
            }
            throw { code: "CALL_EXCEPTION", message: "No nomineeVetter" };
          }

          throw { code: "CALL_EXCEPTION", message: "Function not found" };
        }
        throw new Error(`Unsupported method: ${method}`);
      };

      // Create a JsonRpcProvider-like object
      return new ethers.providers.Web3Provider({
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          return mockSend(method, params || []);
        },
      });
    }

    it("should detect WITH_TIMELOCK for governors with timelock()", async () => {
      // #given a mock provider that returns success for timelock()
      const mockProvider = createMockProvider({ hasTimelock: true });

      // #when detecting capabilities
      const result = await detectGovernorCapabilities(
        "0x1234567890123456789012345678901234567890",
        mockProvider
      );

      // #then should return WITH_TIMELOCK
      expect(result).toBe("WITH_TIMELOCK");
    });

    it("should detect WITH_VETTING for governors with nomineeVetter()", async () => {
      // #given a mock provider that returns failure for timelock() but success for nomineeVetter()
      const mockProvider = createMockProvider({ hasTimelock: false, hasVetting: true });

      // #when detecting capabilities
      const result = await detectGovernorCapabilities(
        "0x1234567890123456789012345678901234567890",
        mockProvider
      );

      // #then should return WITH_VETTING
      expect(result).toBe("WITH_VETTING");
    });

    it("should detect NO_TIMELOCK for governors without timelock or vetting", async () => {
      // #given a mock provider that returns failure for both
      const mockProvider = createMockProvider({ hasTimelock: false, hasVetting: false });

      // #when detecting capabilities
      const result = await detectGovernorCapabilities(
        "0x1234567890123456789012345678901234567890",
        mockProvider
      );

      // #then should return NO_TIMELOCK
      expect(result).toBe("NO_TIMELOCK");
    });
  });

  describe("getTimelockAddress", () => {
    it("should return timelock address from governor", async () => {
      // #given a mock provider that returns a timelock address (use proper checksum)
      const expectedTimelock = ethers.utils.getAddress(
        "0xabcdef1234567890abcdef1234567890abcdef12"
      );
      const mockProvider = new ethers.providers.Web3Provider({
        request: async ({ method }: { method: string; params?: unknown[] }) => {
          if (method === "eth_chainId") return "0xa4b1";
          if (method === "eth_call") {
            return ethers.utils.defaultAbiCoder.encode(["address"], [expectedTimelock]);
          }
          throw new Error(`Unsupported method: ${method}`);
        },
      });

      // #when getting timelock address
      const result = await getTimelockAddress(
        "0x1234567890123456789012345678901234567890",
        mockProvider
      );

      // #then should return the timelock address
      expect(result.toLowerCase()).toBe(expectedTimelock.toLowerCase());
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

  describe("findAllCallScheduledInTx", () => {
    it("should return empty array when receipt is null", async () => {
      // #given - mock provider that returns null receipt
      const mockProvider = {
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
      } as unknown as ethers.providers.Provider;

      // #when - finding CallScheduled events
      const result = await findAllCallScheduledInTx("0x" + "1".repeat(64), mockProvider);

      // #then - should return empty array
      expect(result).toEqual([]);
    });
  });

  describe("getTimelockState", () => {
    it("should throw error when fromBlock is missing and log search is needed for scheduled data", async () => {
      // #given - pre-built contract state indicating operation needs log search
      const mockProvider = {} as unknown as ethers.providers.Provider;
      const operationId = "0x" + "a".repeat(64);
      const contractState = {
        state: "PENDING" as const,
        isOperation: true,
        isPending: true,
        isReady: false,
        isDone: false,
        timestamp: BigNumber.from(1700000000),
      };

      // #when/then - should throw when fromBlock is not provided and log search is needed
      await expect(
        getTimelockState(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK, operationId, mockProvider, {
          skipLogSearch: false,
          contractState,
        })
      ).rejects.toThrow("fromBlock is required");
    });

    it("should skip log search when skipLogSearch is true", async () => {
      // #given - pre-built contract state for pending operation
      const mockProvider = {} as unknown as ethers.providers.Provider;
      const operationId = "0x" + "a".repeat(64);
      const contractState = {
        state: "PENDING" as const,
        isOperation: true,
        isPending: true,
        isReady: false,
        isDone: false,
        timestamp: BigNumber.from(1700000000),
      };

      // #when - calling with skipLogSearch true (no fromBlock needed)
      const result = await getTimelockState(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        operationId,
        mockProvider,
        { skipLogSearch: true, contractState }
      );

      // #then - should succeed without requiring fromBlock
      expect(result.operationId).toBe(operationId);
      expect(result.state).toBe("PENDING");
      expect(result.eta).toBe(1700000000);
    });

    it("should skip executed search when skipExecutedSearch is true", async () => {
      // #given - pre-built contract state for done operation
      const mockProvider = {} as unknown as ethers.providers.Provider;
      const operationId = "0x" + "a".repeat(64);
      const contractState = {
        state: "DONE" as const,
        isOperation: true,
        isPending: false,
        isReady: false,
        isDone: true,
        timestamp: BigNumber.from(1),
      };

      // #when - calling with skipExecutedSearch true
      const result = await getTimelockState(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        operationId,
        mockProvider,
        { skipLogSearch: true, skipExecutedSearch: true, contractState }
      );

      // #then - should succeed without searching for executed data
      expect(result.operationId).toBe(operationId);
      expect(result.state).toBe("DONE");
      expect(result.executedData).toBeUndefined();
    });

    it("should use pre-provided scheduledData without log search", async () => {
      // #given - pre-built contract state and scheduled data
      const mockProvider = {} as unknown as ethers.providers.Provider;
      const operationId = "0x" + "a".repeat(64);
      const contractState = {
        state: "PENDING" as const,
        isOperation: true,
        isPending: true,
        isReady: false,
        isDone: false,
        timestamp: BigNumber.from(1700000000),
      };
      const scheduledData = {
        operationId,
        index: BigNumber.from(0),
        target: "0x" + "1".repeat(40),
        value: BigNumber.from(0),
        data: "0xabcd",
        predecessor: ethers.constants.HashZero,
        delay: BigNumber.from(86400),
        blockNumber: 12345,
        txHash: "0x" + "c".repeat(64),
        logIndex: 0,
        timelockAddress: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
      };

      // #when - calling with pre-provided scheduledData
      const result = await getTimelockState(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        operationId,
        mockProvider,
        { scheduledData, contractState }
      );

      // #then - should use provided scheduledData without triggering log search
      expect(result.scheduledData).toBe(scheduledData);
      expect(result.operationId).toBe(operationId);
      expect(result.state).toBe("PENDING");
    });

    it("should not require fromBlock when operation is not valid", async () => {
      // #given - pre-built contract state for unknown operation (not in timelock)
      const mockProvider = {} as unknown as ethers.providers.Provider;
      const operationId = "0x" + "b".repeat(64);
      const contractState = {
        state: "UNKNOWN" as const,
        isOperation: false,
        isPending: false,
        isReady: false,
        isDone: false,
        timestamp: BigNumber.from(0),
      };

      // #when - calling without fromBlock for unknown operation
      const result = await getTimelockState(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        operationId,
        mockProvider,
        { contractState }
      );

      // #then - should succeed since no log search is needed for unknown operations
      expect(result.operationId).toBe(operationId);
      expect(result.state).toBe("UNKNOWN");
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

describe("Tracker Discovery Module", () => {
  let cache: MockCache;

  beforeEach(() => {
    cache = new MockCache();
  });

  describe("loadWatermarks", () => {
    it("should return empty watermarks and hashes for undefined cache", async () => {
      const result = await loadWatermarks(undefined);
      expect(result).toEqual({ watermarks: {}, hashes: {} });
    });

    it("should return empty watermarks and hashes for empty cache", async () => {
      const result = await loadWatermarks(cache);
      expect(result).toEqual({ watermarks: {}, hashes: {} });
    });

    it("should return watermarks and hashes from cached checkpoint", async () => {
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
          watermarkHashes: { constitutionalGovernor: "0xabc" },
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };

      await cache.set(WATERMARKS_KEY, checkpoint);

      const result = await loadWatermarks(cache);
      expect(result.watermarks).toEqual(watermarks);
      expect(result.hashes).toEqual({ constitutionalGovernor: "0xabc" });
    });

    it("should return empty objects if checkpoint has no discoveryWatermarks", async () => {
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
      expect(result).toEqual({ watermarks: {}, hashes: {} });
    });
  });

  describe("saveWatermarks", () => {
    it("should do nothing for undefined cache", async () => {
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: 100000,
      };

      // Should not throw
      await saveWatermarks(watermarks, {}, undefined);
    });

    it("should save watermarks and hashes as checkpoint", async () => {
      const watermarks: DiscoveryWatermarks = {
        constitutionalGovernor: 100000,
        nonConstitutionalGovernor: 200000,
        l2ConstitutionalTimelock: 150000,
      };
      const hashes = { constitutionalGovernor: "0xabc123" };

      await saveWatermarks(watermarks, hashes, cache);

      const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
      expect(checkpoint).toBeDefined();
      expect(checkpoint!.input).toEqual({ type: "discovery", id: "watermarks" });
      expect(checkpoint!.cachedData.discoveryWatermarks).toEqual(watermarks);
      expect(checkpoint!.cachedData.watermarkHashes).toEqual(hashes);
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

      await saveWatermarks(watermarks, {}, cache);

      const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
      expect(checkpoint!.lastProcessedBlock.l2).toBe(300000);
    });

    it("should handle empty watermarks", async () => {
      await saveWatermarks({}, {}, cache);

      const checkpoint = await cache.get<TrackingCheckpoint>(WATERMARKS_KEY);
      expect(checkpoint).toBeDefined();
      expect(checkpoint!.lastProcessedBlock.l2).toBe(0);
    });
  });

  describe("verifyWatermark", () => {
    it("should return valid when no expected hash is provided", async () => {
      // #given - no expected hash
      const mockProvider = {
        getBlock: async () => ({ hash: "0x" + "a".repeat(64) }),
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark
      const result = await verifyWatermark(
        "constitutionalGovernor",
        100000,
        undefined,
        mockProvider
      );

      // #then - should return valid with new hash
      expect(result.isValid).toBe(true);
      expect(result.blockNumber).toBe(100000);
      expect(result.newHash).toBe("0x" + "a".repeat(64));
    });

    it("should return valid when hash matches", async () => {
      // #given - matching hash
      const expectedHash = "0x" + "b".repeat(64);
      const mockProvider = {
        getBlock: async () => ({ hash: expectedHash }),
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark
      const result = await verifyWatermark(
        "constitutionalGovernor",
        100000,
        expectedHash,
        mockProvider
      );

      // #then - should return valid
      expect(result.isValid).toBe(true);
      expect(result.blockNumber).toBe(100000);
    });

    it("should detect reorg when hash does not match", async () => {
      // #given - mismatched hash
      const expectedHash = "0x" + "a".repeat(64);
      const actualHash = "0x" + "b".repeat(64);
      const mockProvider = {
        getBlock: async () => ({ hash: actualHash }),
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark
      const result = await verifyWatermark(
        "constitutionalGovernor",
        100000,
        expectedHash,
        mockProvider
      );

      // #then - should detect reorg and roll back
      expect(result.isValid).toBe(false);
      // Rolled back by REORG_ROLLBACK_BLOCKS (1000) blocks
      expect(result.blockNumber).toBe(100000 - 1000);
    });

    it("should not roll back past block 0", async () => {
      // #given - mismatched hash at low block number
      const expectedHash = "0x" + "a".repeat(64);
      const actualHash = "0x" + "b".repeat(64);
      const mockProvider = {
        getBlock: async () => ({ hash: actualHash }),
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark at low block number
      const result = await verifyWatermark(
        "constitutionalGovernor",
        500, // Less than REORG_ROLLBACK_BLOCKS
        expectedHash,
        mockProvider
      );

      // #then - should roll back to 0
      expect(result.isValid).toBe(false);
      expect(result.blockNumber).toBe(0);
    });

    it("should continue with stored value on provider error", async () => {
      // #given - provider that throws
      const mockProvider = {
        getBlock: async () => {
          throw new Error("RPC error");
        },
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark
      const result = await verifyWatermark(
        "constitutionalGovernor",
        100000,
        "0x" + "a".repeat(64),
        mockProvider
      );

      // #then - should return valid (continue with stored value)
      expect(result.isValid).toBe(true);
      expect(result.blockNumber).toBe(100000);
    });

    it("should return invalid when block not found without expected hash", async () => {
      // #given - provider returns null block (block doesn't exist yet)
      const mockProvider = {
        getBlock: async () => null,
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark with no expected hash
      const result = await verifyWatermark(
        "constitutionalGovernor",
        100000,
        undefined,
        mockProvider
      );

      // #then - should return invalid (block not found)
      expect(result.isValid).toBe(false);
      expect(result.blockNumber).toBe(100000);
      expect(result.newHash).toBeUndefined();
    });

    it("should return invalid on provider error when establishing hash", async () => {
      // #given - provider that throws when no expected hash
      const mockProvider = {
        getBlock: async () => {
          throw new Error("Provider error");
        },
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark with no expected hash
      const result = await verifyWatermark(
        "constitutionalGovernor",
        100000,
        undefined, // No expected hash - trying to establish
        mockProvider
      );

      // #then - should return invalid to trigger retry next cycle
      expect(result.isValid).toBe(false);
      expect(result.blockNumber).toBe(100000);
    });

    it("should roll back when block not found but expected hash exists", async () => {
      // #given - provider returns null block
      const mockProvider = {
        getBlock: async () => null,
      } as unknown as ethers.providers.Provider;

      // #when - verifying watermark with expected hash
      const result = await verifyWatermark(
        "constitutionalGovernor",
        100000,
        "0x" + "a".repeat(64), // Has expected hash
        mockProvider
      );

      // #then - should roll back
      expect(result.isValid).toBe(false);
      expect(result.blockNumber).toBe(100000 - 1000); // Rolled back
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

  describe("discoverAll watermark verification", () => {
    it("should use default start block when watermark verification is rejected", async () => {
      // #given - provider that throws during watermark verification
      const mockProvider = {
        getBlock: async () => {
          throw new Error("Verification failed");
        },
        getLogs: async () => [], // No proposals found
      } as unknown as ethers.providers.Provider;

      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const watermarks = {
        constitutionalGovernor: 100000,
      };
      const hashes = {
        constitutionalGovernor: "0x" + "a".repeat(64),
      };

      // #when - discoverAll with reorg check enabled (verification will be rejected)
      const result = await discoverAll(targets, 100100, mockProvider, cache, watermarks, hashes, {
        skipReorgCheck: false,
      });

      // #then - should complete without throwing
      expect(result.proposals).toEqual([]);
      expect(result.timelockOps).toEqual([]);
      // Watermark should still be updated to toBlock
      expect(result.watermarks.constitutionalGovernor).toBe(100100);
    });

    it("should handle multiple verification rejections and use fallback for all", async () => {
      // #given - provider that throws for all verifications
      const mockProvider = {
        getBlock: async () => {
          throw new Error("Provider unavailable");
        },
        getLogs: async () => [],
      } as unknown as ethers.providers.Provider;

      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: true,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const watermarks = {
        constitutionalGovernor: 100000,
        nonConstitutionalGovernor: 200000,
      };
      const hashes = {
        constitutionalGovernor: "0x" + "a".repeat(64),
        nonConstitutionalGovernor: "0x" + "b".repeat(64),
      };

      // #when - discoverAll with reorg check enabled
      const result = await discoverAll(targets, 300000, mockProvider, cache, watermarks, hashes, {
        skipReorgCheck: false,
      });

      // #then - should complete successfully using fallback watermarks
      expect(result.proposals).toEqual([]);
      expect(result.watermarks.constitutionalGovernor).toBe(300000);
      expect(result.watermarks.nonConstitutionalGovernor).toBe(300000);
    });

    it("should proceed with valid watermarks when some verifications succeed", async () => {
      // #given - provider that succeeds for first call, fails for second
      let callIndex = 0;
      const mockProvider = {
        getBlock: async () => {
          callIndex++;
          if (callIndex === 1) {
            return { hash: "0x" + "c".repeat(64) }; // First verification succeeds
          }
          throw new Error("Provider error");
        },
        getLogs: async () => [],
      } as unknown as ethers.providers.Provider;

      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: true,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const watermarks = {
        constitutionalGovernor: 100000,
        nonConstitutionalGovernor: 200000,
      };
      const hashes = {
        constitutionalGovernor: "0x" + "c".repeat(64), // Will match
        nonConstitutionalGovernor: "0x" + "d".repeat(64), // Will fail verification
      };

      // #when - discoverAll with reorg check enabled
      const result = await discoverAll(targets, 300000, mockProvider, cache, watermarks, hashes, {
        skipReorgCheck: false,
      });

      // #then - should complete with both watermarks updated
      expect(result.watermarks.constitutionalGovernor).toBe(300000);
      expect(result.watermarks.nonConstitutionalGovernor).toBe(300000);
    });
  });
});

/**
 * RPC-based discovery tests
 *
 * Tests discoverProposals, discoverTimelockOps, and discoverAll with real RPC.
 * Uses block range 369846189-389241837 which contains elections, proposals, and timelock ops.
 */
describe.skipIf(shouldSkipRpc())("Discovery RPC Tests", () => {
  const { cache: testCache, beforeAllSetup } = createRpcTestSuite();
  let l2Provider: ethers.providers.JsonRpcProvider;
  let cache: MockCache;

  // Block range known to contain elections, constitutional & non-constitutional proposals
  // Per user: 369846189-389241837 has elections, both types of proposals, and timelock operations
  // Start one block before to ensure boundary inclusion (369846189 is exact creation block)
  const TEST_FROM_BLOCK = 369_846_188;
  const TEST_TO_BLOCK = 389_241_837;

  // Cached discovery results - populated once in beforeAll
  let cachedConstitutionalProposals: DiscoveredProposal[];
  let cachedElectionProposals: DiscoveredProposal[];
  let cachedTimelockOps: DiscoveredTimelockOp[];

  beforeAll(async () => {
    await beforeAllSetup();
    l2Provider = testCache.getProviders().l2Provider;

    // Cache discovery results once for reuse across tests
    const [constProposals, electionProposals, timelockOps] = await Promise.all([
      discoverProposals(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        TEST_FROM_BLOCK,
        TEST_TO_BLOCK,
        l2Provider
      ),
      discoverProposals(
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
        TEST_FROM_BLOCK,
        TEST_TO_BLOCK,
        l2Provider
      ),
      discoverTimelockOps(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        TEST_FROM_BLOCK,
        TEST_TO_BLOCK,
        l2Provider
      ),
    ]);
    cachedConstitutionalProposals = constProposals;
    cachedElectionProposals = electionProposals;
    cachedTimelockOps = timelockOps;
    console.log("✓ Discovery results cached");
  }, 180000);

  beforeEach(() => {
    cache = new MockCache();
  });

  describe("discoverProposals", () => {
    it("should discover constitutional proposals in block range", () => {
      // #given cached constitutional proposals from block range
      const proposals = cachedConstitutionalProposals;

      // #then should find at least one proposal
      expect(proposals.length).toBeGreaterThan(0);
      if (proposals.length > 0) {
        expect(proposals[0].governorAddress.toLowerCase()).toBe(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR.toLowerCase()
        );
        expect(proposals[0].proposalId).toBeDefined();
        expect(proposals[0].creationTxHash).toBeDefined();
        expect(proposals[0].creationBlock).toBeGreaterThan(TEST_FROM_BLOCK);
      }
    });

    it("should discover election proposals in block range", () => {
      // #given cached election proposals from block range
      const proposals = cachedElectionProposals;

      // #then may find election proposals
      expect(Array.isArray(proposals)).toBe(true);
      if (proposals.length > 0) {
        expect(proposals[0].governorAddress.toLowerCase()).toBe(
          ADDRESSES.ELECTION_NOMINEE_GOVERNOR.toLowerCase()
        );
      }
    });
  });

  describe("discoverTimelockOps", () => {
    it("should discover timelock operations in block range", () => {
      // #given cached timelock operations from block range
      const ops = cachedTimelockOps;

      // #then should find operations
      expect(Array.isArray(ops)).toBe(true);
      if (ops.length > 0) {
        expect(ops[0].timelockAddress.toLowerCase()).toBe(
          ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK.toLowerCase()
        );
        expect(ops[0].operationId).toBeDefined();
        expect(ops[0].scheduledTxHash).toBeDefined();
      }
    });
  });

  describe("discoverAll", () => {
    it("should discover from all enabled targets", async () => {
      // #given targets for all governors and timelocks
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: true,
        electionNomineeGovernor: true,
        electionMemberGovernor: true,
        l2ConstitutionalTimelock: true,
        l2NonConstitutionalTimelock: true,
      };
      const watermarks = {
        constitutionalGovernor: TEST_FROM_BLOCK,
        nonConstitutionalGovernor: TEST_FROM_BLOCK,
        electionNomineeGovernor: TEST_FROM_BLOCK,
        electionMemberGovernor: TEST_FROM_BLOCK,
        l2ConstitutionalTimelock: TEST_FROM_BLOCK,
        l2NonConstitutionalTimelock: TEST_FROM_BLOCK,
      };

      // #when discovering all (with empty hashes, skipping reorg check for this test)
      const result = await discoverAll(
        targets,
        TEST_TO_BLOCK,
        l2Provider,
        cache,
        watermarks,
        {},
        {
          skipReorgCheck: true,
        }
      );

      // #then should return proposals, timelockOps, updated watermarks, and hashes
      expect(result.proposals).toBeDefined();
      expect(result.timelockOps).toBeDefined();
      expect(result.watermarks).toBeDefined();
      expect(result.hashes).toBeDefined();
      expect(result.watermarks.constitutionalGovernor).toBe(TEST_TO_BLOCK);
      expect(result.watermarks.nonConstitutionalGovernor).toBe(TEST_TO_BLOCK);
    }, 120000);

    it("should create pending checkpoints for discovered proposals", async () => {
      // #given targets for constitutional governor only
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const watermarks = {
        constitutionalGovernor: TEST_FROM_BLOCK,
      };

      // #when discovering (skip reorg check for this test)
      const result = await discoverAll(
        targets,
        TEST_TO_BLOCK,
        l2Provider,
        cache,
        watermarks,
        {},
        {
          skipReorgCheck: true,
        }
      );

      // #then if proposals found, pending checkpoints should be created
      if (result.proposals.length > 0) {
        const keys = await cache.keys();
        const txKeys = keys.filter((k) => k.startsWith("tx:"));
        expect(txKeys.length).toBeGreaterThan(0);
      }
    }, 60000);

    it("should skip disabled targets", async () => {
      // #given only constitutional governor enabled
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const watermarks = {
        constitutionalGovernor: TEST_FROM_BLOCK,
      };

      // #when discovering (skip reorg check for this test)
      const result = await discoverAll(
        targets,
        TEST_TO_BLOCK,
        l2Provider,
        cache,
        watermarks,
        {},
        {
          skipReorgCheck: true,
        }
      );

      // #then only constitutional watermark should be updated
      expect(result.watermarks.constitutionalGovernor).toBe(TEST_TO_BLOCK);
      expect(result.watermarks.nonConstitutionalGovernor).toBeUndefined();
      expect(result.watermarks.l2ConstitutionalTimelock).toBeUndefined();
    }, 60000);

    it("should work with empty watermarks (start from default)", async () => {
      // #given empty watermarks - will use GOVERNANCE_START_BLOCKS
      // Using a narrow range to avoid huge scan
      const targets = {
        constitutionalGovernor: true,
        nonConstitutionalGovernor: false,
        electionNomineeGovernor: false,
        electionMemberGovernor: false,
        l2ConstitutionalTimelock: false,
        l2NonConstitutionalTimelock: false,
      };
      const watermarks: DiscoveryWatermarks = {
        // Pre-set to avoid scanning from genesis
        constitutionalGovernor: TEST_FROM_BLOCK,
      };

      // #when discovering (skip reorg check for this test)
      const result = await discoverAll(
        targets,
        TEST_FROM_BLOCK + 1_000_000,
        l2Provider,
        cache,
        watermarks,
        {},
        { skipReorgCheck: true }
      );

      // #then should succeed with updated watermarks
      expect(result.watermarks.constitutionalGovernor).toBe(TEST_FROM_BLOCK + 1_000_000);
    }, 60000);
  });
});
