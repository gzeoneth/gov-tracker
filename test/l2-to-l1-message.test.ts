/**
 * L2 to L1 Message Stage Tests
 *
 * Tests for L2→L1 message tracking helper functions.
 * Tests pure functions without RPC calls.
 */

import { describe, it, expect } from "vitest";
import { BigNumber, ethers } from "ethers";
import { getAllMessagePositionsFromReceipt } from "../src/stages/l2-to-l1-message";
import { arbSysInterface } from "../src/abis";
import { ADDRESSES } from "../src/constants";

/**
 * Create a mock transaction receipt with L2ToL1Tx events
 */
function createMockReceiptWithMessages(
  messagePositions: BigNumber[]
): ethers.providers.TransactionReceipt {
  const logs: ethers.providers.Log[] = messagePositions.map((position, i) => {
    // Encode the L2ToL1Tx event data
    // L2ToL1Tx(address indexed caller, address indexed destination, uint256 indexed hash, uint256 position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)
    const eventFragment = arbSysInterface.getEvent("L2ToL1Tx");

    // Create dummy values for the event
    const caller = "0x1111111111111111111111111111111111111111";
    const destination = "0x2222222222222222222222222222222222222222";
    const hash = BigNumber.from(i + 1);
    const arbBlockNum = BigNumber.from(100000);
    const ethBlockNum = BigNumber.from(50000);
    const timestamp = BigNumber.from(Date.now());
    const callvalue = BigNumber.from(0);
    const data = "0x";

    const encoded = arbSysInterface.encodeEventLog(eventFragment, [
      caller,
      destination,
      hash,
      position,
      arbBlockNum,
      ethBlockNum,
      timestamp,
      callvalue,
      data,
    ]);

    return {
      blockNumber: 12345,
      blockHash: "0x" + "a".repeat(64),
      transactionIndex: 0,
      removed: false,
      address: ADDRESSES.ARB_SYS,
      data: encoded.data,
      topics: encoded.topics,
      transactionHash: "0x" + "b".repeat(64),
      logIndex: i,
    };
  });

  return {
    to: "0x3333333333333333333333333333333333333333",
    from: "0x4444444444444444444444444444444444444444",
    contractAddress: "",
    transactionIndex: 0,
    gasUsed: BigNumber.from(100000),
    logsBloom: "0x" + "0".repeat(512),
    blockHash: "0x" + "a".repeat(64),
    transactionHash: "0x" + "b".repeat(64),
    logs,
    blockNumber: 12345,
    confirmations: 1,
    cumulativeGasUsed: BigNumber.from(100000),
    effectiveGasPrice: BigNumber.from(1000000000),
    byzantium: true,
    type: 2,
    status: 1,
  };
}

describe("L2 to L1 Message Stage", () => {
  describe("getAllMessagePositionsFromReceipt", () => {
    it("should return empty array for receipt with no messages", () => {
      const receipt: ethers.providers.TransactionReceipt = {
        to: "0x3333333333333333333333333333333333333333",
        from: "0x4444444444444444444444444444444444444444",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(100000),
        logsBloom: "0x" + "0".repeat(512),
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs: [],
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(100000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };

      const positions = getAllMessagePositionsFromReceipt(receipt);
      expect(positions).toEqual([]);
    });

    it("should extract single message position", () => {
      const expectedPosition = BigNumber.from(12345);
      const receipt = createMockReceiptWithMessages([expectedPosition]);

      const positions = getAllMessagePositionsFromReceipt(receipt);
      expect(positions).toHaveLength(1);
      expect(positions[0].eq(expectedPosition)).toBe(true);
    });

    it("should extract multiple message positions", () => {
      const expectedPositions = [BigNumber.from(100), BigNumber.from(200), BigNumber.from(300)];
      const receipt = createMockReceiptWithMessages(expectedPositions);

      const positions = getAllMessagePositionsFromReceipt(receipt);
      expect(positions).toHaveLength(3);
      expect(positions[0].eq(BigNumber.from(100))).toBe(true);
      expect(positions[1].eq(BigNumber.from(200))).toBe(true);
      expect(positions[2].eq(BigNumber.from(300))).toBe(true);
    });

    it("should ignore logs from other addresses", () => {
      const receipt: ethers.providers.TransactionReceipt = {
        to: "0x3333333333333333333333333333333333333333",
        from: "0x4444444444444444444444444444444444444444",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(100000),
        logsBloom: "0x" + "0".repeat(512),
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs: [
          {
            blockNumber: 12345,
            blockHash: "0x" + "a".repeat(64),
            transactionIndex: 0,
            removed: false,
            address: "0x5555555555555555555555555555555555555555", // Wrong address
            data: "0x",
            topics: [arbSysInterface.getEventTopic("L2ToL1Tx")],
            transactionHash: "0x" + "b".repeat(64),
            logIndex: 0,
          },
        ],
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(100000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };

      const positions = getAllMessagePositionsFromReceipt(receipt);
      expect(positions).toEqual([]);
    });

    it("should ignore logs with wrong topic", () => {
      const receipt: ethers.providers.TransactionReceipt = {
        to: "0x3333333333333333333333333333333333333333",
        from: "0x4444444444444444444444444444444444444444",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(100000),
        logsBloom: "0x" + "0".repeat(512),
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs: [
          {
            blockNumber: 12345,
            blockHash: "0x" + "a".repeat(64),
            transactionIndex: 0,
            removed: false,
            address: ADDRESSES.ARB_SYS,
            data: "0x",
            topics: ["0x" + "1".repeat(64)], // Wrong topic
            transactionHash: "0x" + "b".repeat(64),
            logIndex: 0,
          },
        ],
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(100000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };

      const positions = getAllMessagePositionsFromReceipt(receipt);
      expect(positions).toEqual([]);
    });

    it("should handle large message positions", () => {
      const largePosition = BigNumber.from("999999999999999999999");
      const receipt = createMockReceiptWithMessages([largePosition]);

      const positions = getAllMessagePositionsFromReceipt(receipt);
      expect(positions).toHaveLength(1);
      expect(positions[0].eq(largePosition)).toBe(true);
    });
  });
});
