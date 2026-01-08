/**
 * L2 to L1 Message Stage Tests
 *
 * Tests for L2→L1 message tracking helper functions.
 * Includes both pure function tests (no RPC) and integration tests (RPC required).
 *
 * PERFORMANCE OPTIMIZATION:
 * L2→L1 messages are tracked once in beforeAll and reused across tests.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { BigNumber, ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  getAllMessagePositionsFromReceipt,
  trackL2ToL1Message,
  findOutboxExecutionTransaction,
  getL2ToL1Messages,
  prepareL2ToL1Message,
  prepareL2ToL1MessageStage,
  L2ToL1MessageResult,
} from "../src/stages/l2-to-l1-message";
import { ChildToParentMessageReaderNitro } from "@arbitrum/sdk/dist/lib/message/ChildToParentMessageNitro";
import { arbSysInterface } from "../src/abis";
import { ADDRESSES, DEFAULT_RPC_URLS } from "../src/constants";
import {
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./fixtures";

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
 * RPC-dependent tests for L2→L1 message tracking
 */
describe.skipIf(process.env.NO_RPC === "1")(
  "L2→L1 Message RPC Tests",
  {
    timeout: 180000,
  },
  () => {
    let l1Provider: ethers.providers.JsonRpcProvider;
    let l2Provider: ethers.providers.JsonRpcProvider;

    // L2 timelock execution tx that creates L2→L1 messages
    const L2_TIMELOCK_TX = CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.expectedStages.L2_TIMELOCK.hash;
    const L2_TIMELOCK_BLOCK =
      CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.expectedStages.L2_TIMELOCK.block;

    // L2-only tx (no L2→L1 messages)
    const L2_ONLY_TX = NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.expectedStages.L2_TIMELOCK.hash;

    // Cached tracking result
    let l2ToL1Result: L2ToL1MessageResult;

    beforeAll(async () => {
      const ethRpc = process.env.ETH_RPC;
      if (!ethRpc) {
        throw new Error("ETH_RPC required for L2→L1 message tests");
      }
      const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;

      l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
      l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);

      // Track L2→L1 message once for reuse
      console.log("Tracking L2→L1 message for test suite...");
      l2ToL1Result = await trackL2ToL1Message(L2_TIMELOCK_TX, l2Provider, l1Provider);
      console.log("✓ L2→L1 message tracked and cached");
    }, 180000);

    describe("trackL2ToL1Message", () => {
      it("should track completed L2→L1 message with COMPLETED status", () => {
        expect(l2ToL1Result.stage.type).toBe("L2_TO_L1_MESSAGE");
        expect(l2ToL1Result.stage.status).toBe("COMPLETED");
        expect(l2ToL1Result.isExecuted).toBe(true);
      });

      it("should extract message positions from receipt", () => {
        expect(l2ToL1Result.messagePositions.length).toBeGreaterThan(0);
        expect(l2ToL1Result.messagePosition).toBeDefined();
      });

      it("should include L2 execution block", () => {
        expect(l2ToL1Result.l2ExecutionBlock).toBe(L2_TIMELOCK_BLOCK);
      });

      it("should find outbox execution transaction", () => {
        expect(l2ToL1Result.outboxExecutionTx).toBeDefined();
        if (l2ToL1Result.outboxExecutionTx) {
          expect(l2ToL1Result.outboxExecutionTx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
          expect(l2ToL1Result.outboxExecutionTx.blockNumber).toBeGreaterThan(0);
        }
      });

      it("should have messages from Arbitrum SDK", () => {
        expect(l2ToL1Result.messages.length).toBeGreaterThan(0);
      });

      it("should include stage transactions", () => {
        expect(l2ToL1Result.stage.transactions.length).toBeGreaterThan(0);
        // First tx should be the L2 execution
        const l2Tx = l2ToL1Result.stage.transactions.find((tx) => tx.chain === "arb1");
        expect(l2Tx).toBeDefined();
        expect(l2Tx?.hash.toLowerCase()).toBe(L2_TIMELOCK_TX.toLowerCase());
      });

      it("should include stage data with message details", () => {
        expect(l2ToL1Result.stage.data.messageCount).toBeGreaterThan(0);
        expect(l2ToL1Result.stage.data.l2TxHash).toBe(L2_TIMELOCK_TX);
        expect(l2ToL1Result.stage.data.l2Block).toBe(L2_TIMELOCK_BLOCK);
      });

      it("should return NOT_STARTED for empty tx hash", async () => {
        const result = await trackL2ToL1Message("", l2Provider, l1Provider);
        expect(result.stage.status).toBe("NOT_STARTED");
        expect(result.messages.length).toBe(0);
      });

      it("should return NOT_STARTED for non-existent tx", async () => {
        const invalidHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const result = await trackL2ToL1Message(invalidHash, l2Provider, l1Provider);
        expect(result.stage.status).toBe("NOT_STARTED");
      });

      it("should return SKIPPED for L2-only tx without L2→L1 messages", async () => {
        const result = await trackL2ToL1Message(L2_ONLY_TX, l2Provider, l1Provider);
        expect(result.stage.status).toBe("SKIPPED");
        expect(result.messages.length).toBe(0);
        expect(result.isExecuted).toBe(false);
      });
    });

    describe("getL2ToL1Messages", () => {
      it("should return messages for valid L2 tx", async () => {
        const messages = await getL2ToL1Messages(L2_TIMELOCK_TX, l2Provider, l1Provider);
        expect(messages.length).toBeGreaterThan(0);
      });

      it("should return empty array for non-existent tx", async () => {
        const invalidHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const messages = await getL2ToL1Messages(invalidHash, l2Provider, l1Provider);
        expect(messages).toEqual([]);
      });

      it("should return empty array for L2-only tx", async () => {
        const messages = await getL2ToL1Messages(L2_ONLY_TX, l2Provider, l1Provider);
        expect(messages).toEqual([]);
      });
    });

    describe("findOutboxExecutionTransaction", () => {
      it("should find outbox execution for known message position", async () => {
        // Use the message position from tracked result
        if (!l2ToL1Result.messagePosition || !l2ToL1Result.l1SearchFromBlock) {
          console.log("Skipping - no message position available");
          return;
        }

        const result = await findOutboxExecutionTransaction(
          l2ToL1Result.messagePosition,
          l2Provider,
          l1Provider,
          { fromBlock: l2ToL1Result.l1SearchFromBlock }
        );

        expect(result).toBeDefined();
        if (result) {
          expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
          expect(result.blockNumber).toBeGreaterThan(0);
        }
      });

      it("should return undefined for non-existent message position", async () => {
        const fakePosition = BigNumber.from("999999999999999");
        const currentBlock = await l1Provider.getBlockNumber();

        const result = await findOutboxExecutionTransaction(fakePosition, l2Provider, l1Provider, {
          fromBlock: currentBlock - 1000,
          toBlock: currentBlock,
          chunkSize: 500,
        });

        expect(result).toBeUndefined();
      });
    });

    describe("prepareL2ToL1Message", () => {
      it("should reject preparation for already executed message", async () => {
        const messages = l2ToL1Result.messages;
        if (messages.length === 0) {
          console.log("Skipping - no messages available");
          return;
        }

        // Access the nitro reader
        const reader = (messages[0] as any).nitroReader as ChildToParentMessageReaderNitro;

        const result = await prepareL2ToL1Message(reader, l2Provider);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("already executed");
        }
      });

      it("should allow forced preparation for historical validation", async () => {
        const messages = l2ToL1Result.messages;
        if (messages.length === 0) {
          console.log("Skipping - no messages available");
          return;
        }

        const reader = (messages[0] as any).nitroReader as ChildToParentMessageReaderNitro;

        const result = await prepareL2ToL1Message(reader, l2Provider, {
          prepareCompleted: true,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.to.toLowerCase()).toBe(ADDRESSES.ARB1_OUTBOX.toLowerCase());
          expect(result.prepared.data).toMatch(/^0x/);
          expect(result.prepared.chain).toBe("ethereum");
        }
      });
    });

    describe("prepareL2ToL1MessageStage", () => {
      it("should reject stage without l2TxHash", async () => {
        const invalidStage = {
          ...l2ToL1Result.stage,
          data: { ...l2ToL1Result.stage.data, l2TxHash: undefined },
        };

        const result = await prepareL2ToL1MessageStage(invalidStage, l2Provider, l1Provider);

        expect(result.total).toBe(0);
        expect(result.results.length).toBe(1);
        expect(result.results[0].success).toBe(false);
      });

      it("should prepare all messages from stage with prepareCompleted", async () => {
        const result = await prepareL2ToL1MessageStage(l2ToL1Result.stage, l2Provider, l1Provider, {
          prepareCompleted: true,
        });

        expect(result.total).toBeGreaterThan(0);
        expect(result.results.length).toBe(result.total);

        // All should succeed with prepareCompleted
        for (const r of result.results) {
          expect(r.success).toBe(true);
        }
      });

      it("should reject completed stage without prepareCompleted flag", async () => {
        const result = await prepareL2ToL1MessageStage(l2ToL1Result.stage, l2Provider, l1Provider);

        // Should fail because stage is already COMPLETED
        expect(result.results.length).toBeGreaterThan(0);
        // Either validation fails or individual preparations fail
        const hasFailure = result.results.some((r) => !r.success);
        expect(hasFailure).toBe(true);
      });
    });
  }
);
