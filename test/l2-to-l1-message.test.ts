/**
 * L2 to L1 Message Stage Tests
 *
 * Tests for L2→L1 message tracking helper functions.
 * Tests pure functions without RPC calls.
 *
 * RPC-based tests track L2→L1 message functions using real proposal data.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { BigNumber, ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  getAllMessagePositionsFromReceipt,
  trackL2ToL1Message,
  getL2ToL1Messages,
} from "../src/stages/l2-to-l1-message";
import { arbSysInterface } from "../src/abis";
import { ADDRESSES, DEFAULT_RPC_URLS } from "../src/constants";
import { CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP } from "./fixtures";
import { createTracker, TrackingResult } from "../src";

dotenv.config({ quiet: true });

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

/**
 * RPC-based tests for L2→L1 message tracking
 *
 * These tests require RPC connections and verify the full tracking pipeline.
 */
describe.skipIf(process.env.NO_RPC === "1")(
  "L2 to L1 Message Tracking (RPC)",
  {
    timeout: 300000, // 5 minutes for slow RPC tests
  },
  () => {
    let l2Provider: ethers.providers.JsonRpcProvider;
    let l1Provider: ethers.providers.JsonRpcProvider;
    let trackedResult: TrackingResult;
    let l2TimelockExecutionTxHash: string;

    beforeAll(async () => {
      const ethRpc = process.env.ETH_RPC;
      if (!ethRpc) {
        throw new Error("ETH_RPC required for L2→L1 message tests");
      }
      const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;

      l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
      l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);

      // Track the full proposal once to get stage data
      const tracker = createTracker({ l1Provider, l2Provider });
      const results = await tracker.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      trackedResult = results[0];

      // Extract L2 timelock execution tx hash from tracked result
      const l2TimelockStage = trackedResult.stages.find(
        (s) => s.type === "L2_TIMELOCK" && s.status === "COMPLETED"
      );
      expect(l2TimelockStage).toBeDefined();

      // Find execution transaction (not the queue tx)
      const executionTx = l2TimelockStage?.transactions?.find(
        (tx) => tx.description === "executed"
      );
      expect(executionTx).toBeDefined();
      l2TimelockExecutionTxHash = executionTx!.hash;
    }, 300000);

    describe("trackL2ToL1Message", () => {
      it("should track completed L2→L1 message with outbox execution", async () => {
        // #when tracking L2→L1 message from L2 timelock execution
        const result = await trackL2ToL1Message(l2TimelockExecutionTxHash, l2Provider, l1Provider);

        // #then should return COMPLETED with outbox execution data
        expect(result.stage.status).toBe("COMPLETED");
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.messagePositions.length).toBeGreaterThan(0);
        expect(result.isExecuted).toBe(true);
        expect(result.outboxExecutionTx).toBeDefined();
        expect(result.outboxExecutionTx?.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      });

      it("should return NOT_STARTED for empty tx hash", async () => {
        const result = await trackL2ToL1Message("", l2Provider, l1Provider);
        expect(result.stage.status).toBe("NOT_STARTED");
        expect(result.messages).toHaveLength(0);
      });

      it("should return NOT_STARTED for non-existent tx", async () => {
        const fakeTxHash = "0x" + "0".repeat(64);
        const result = await trackL2ToL1Message(fakeTxHash, l2Provider, l1Provider);
        expect(result.stage.status).toBe("NOT_STARTED");
        expect(result.stage.data.reason).toBeDefined();
      });

      it("should include message details in stage data", async () => {
        const result = await trackL2ToL1Message(l2TimelockExecutionTxHash, l2Provider, l1Provider);

        expect(result.stage.data.messageCount).toBeGreaterThan(0);
        expect(result.stage.data.l2Block).toBeGreaterThan(0);
        expect(result.stage.data.l2TxHash).toBe(l2TimelockExecutionTxHash);
        expect(result.stage.data.messagePositions).toBeDefined();
        expect(Array.isArray(result.stage.data.messagePositions)).toBe(true);
      });
    });

    describe("getL2ToL1Messages", () => {
      it("should get messages from L2 timelock execution tx", async () => {
        const messages = await getL2ToL1Messages(l2TimelockExecutionTxHash, l2Provider, l1Provider);

        expect(messages.length).toBeGreaterThan(0);
      });

      it("should return empty array for non-existent tx", async () => {
        const fakeTxHash = "0x" + "0".repeat(64);
        const messages = await getL2ToL1Messages(fakeTxHash, l2Provider, l1Provider);
        expect(messages).toHaveLength(0);
      });

      it("should return empty array for tx without L2→L1 messages", async () => {
        // Use the proposal creation tx (no L2→L1 messages)
        const messages = await getL2ToL1Messages(
          CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash,
          l2Provider,
          l1Provider
        );
        expect(messages).toHaveLength(0);
      });
    });

    describe("L2_TO_L1_MESSAGE stage in tracked result", () => {
      it("should have L2_TO_L1_MESSAGE stage with COMPLETED status", () => {
        const l2ToL1Stage = trackedResult.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
        expect(l2ToL1Stage).toBeDefined();
        expect(l2ToL1Stage?.status).toBe("COMPLETED");
      });

      it("should have transactions for both L2 send and L1 confirm", () => {
        const l2ToL1Stage = trackedResult.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
        expect(l2ToL1Stage?.transactions?.length).toBeGreaterThanOrEqual(2);

        const l2Tx = l2ToL1Stage?.transactions?.find((tx) => tx.chain === "arb1");
        const l1Tx = l2ToL1Stage?.transactions?.find((tx) => tx.chain === "ethereum");

        expect(l2Tx).toBeDefined();
        expect(l1Tx).toBeDefined();
      });

      it("should have l2ToL1TxEvent in stage data", () => {
        const l2ToL1Stage = trackedResult.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
        expect(l2ToL1Stage?.data.l2ToL1TxEvent).toBeDefined();
      });
    });
  }
);
