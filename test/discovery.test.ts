/**
 * Tests for Discovery Modules
 *
 * Tests for governor-discovery, timelock-discovery, and security-council modules.
 */

import { describe, it, expect } from "vitest";
import { ethers, BigNumber } from "ethers";
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
