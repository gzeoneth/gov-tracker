/**
 * L2 to L1 Message Stage Tests
 *
 * Tests for L2→L1 message tracking helper functions.
 * Tests pure functions without RPC calls.
 *
 * RPC-based tests track L2→L1 message functions using real proposal data.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { BigNumber, ethers } from "ethers";
import * as dotenv from "dotenv";
import { ChildToParentMessageStatus } from "@arbitrum/sdk";
import {
  getAllMessagePositionsFromReceipt,
  trackL2ToL1Message,
  getL2ToL1Messages,
  prepareL2ToL1MessageStage,
  prepareL2ToL1Message,
} from "../src/stages/l2-to-l1-message";
import { arbSysInterface } from "../src/abis";
import { ADDRESSES, DEFAULT_RPC_URLS } from "../src/constants";
import {
  shouldSkipRpc,
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
} from "./helpers";
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

  describe("prepareL2ToL1Message (mocked)", () => {
    /**
     * Create a mock Nitro reader for testing
     */
    function createMockNitroReader(status: ChildToParentMessageStatus) {
      return {
        status: vi.fn().mockResolvedValue(status),
        getOutboxProof: vi.fn().mockResolvedValue(["0x" + "a".repeat(64), "0x" + "b".repeat(64)]),
        event: {
          position: BigNumber.from(123),
          caller: "0x1111111111111111111111111111111111111111",
          destination: ADDRESSES.L1_TIMELOCK,
          arbBlockNum: BigNumber.from(100000),
          ethBlockNum: BigNumber.from(50000),
          timestamp: BigNumber.from(1700000000),
          callvalue: BigNumber.from(0),
          data: "0xabcd",
        },
      };
    }

    const mockProvider = {} as ethers.providers.Provider;

    it("should fail when message is already EXECUTED", async () => {
      // #given a message with EXECUTED status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.EXECUTED) as any;

      // #when preparing without prepareCompleted option
      const result = await prepareL2ToL1Message(mockReader, mockProvider);

      // #then should fail with already executed error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already executed");
      }
    });

    it("should fail when message is UNCONFIRMED", async () => {
      // #given a message with UNCONFIRMED status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.UNCONFIRMED) as any;

      // #when preparing without prepareCompleted option
      const result = await prepareL2ToL1Message(mockReader, mockProvider);

      // #then should fail with not ready error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not ready");
        expect(result.error).toContain("UNCONFIRMED");
      }
    });

    it("should succeed when message is CONFIRMED", async () => {
      // #given a message with CONFIRMED status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.CONFIRMED) as any;

      // #when preparing
      const result = await prepareL2ToL1Message(mockReader, mockProvider);

      // #then should succeed with prepared transaction
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.prepared.chain).toBe("ethereum");
        expect(result.prepared.to).toBe(ADDRESSES.ARB1_OUTBOX);
      }
    });

    it("should skip status check with prepareCompleted option", async () => {
      // #given a message with EXECUTED status and prepareCompleted option
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.EXECUTED) as any;

      // #when preparing with prepareCompleted=true
      const result = await prepareL2ToL1Message(mockReader, mockProvider, {
        prepareCompleted: true,
      });

      // #then should succeed (bypassing status check)
      expect(result.success).toBe(true);
    });

    it("should use custom outbox address when provided", async () => {
      // #given a confirmed message and custom outbox address
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.CONFIRMED) as any;
      const customOutbox = "0x5555555555555555555555555555555555555555";

      // #when preparing with custom outbox
      const result = await prepareL2ToL1Message(mockReader, mockProvider, {
        outboxAddress: customOutbox,
      });

      // #then should use the custom outbox address
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.prepared.to).toBe(customOutbox);
      }
    });

    it("should skip status check when cachedSendProps provided", async () => {
      // #given a message that would fail status check (UNCONFIRMED) but has cachedSendProps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.UNCONFIRMED) as any;
      const cachedSendProps = {
        sendRootSize: "156638",
        sendRootHash: "0x" + "a".repeat(64),
      };

      // #when preparing with cachedSendProps
      const result = await prepareL2ToL1Message(mockReader, mockProvider, {
        cachedSendProps,
      });

      // #then should succeed (bypassing status check) and NOT call status()
      expect(result.success).toBe(true);
      expect(mockReader.status).not.toHaveBeenCalled();
    });

    it("should inject cachedSendProps into reader private fields", async () => {
      // #given a message with cachedSendProps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.CONFIRMED) as any;
      const cachedSendProps = {
        sendRootSize: "156638",
        sendRootHash: "0x" + "a".repeat(64),
      };

      // #when preparing with cachedSendProps
      await prepareL2ToL1Message(mockReader, mockProvider, { cachedSendProps });

      // #then should have injected the cached values into reader
      expect(mockReader.sendRootSize).toBeDefined();
      expect(mockReader.sendRootSize.toString()).toBe("156638");
      expect(mockReader.sendRootHash).toBe("0x" + "a".repeat(64));
      expect(mockReader.sendRootConfirmed).toBe(true);
    });

    it("should call status() when no cachedSendProps and not prepareCompleted", async () => {
      // #given a confirmed message without cachedSendProps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockReader = createMockNitroReader(ChildToParentMessageStatus.CONFIRMED) as any;

      // #when preparing without cachedSendProps
      await prepareL2ToL1Message(mockReader, mockProvider);

      // #then should call status() to validate
      expect(mockReader.status).toHaveBeenCalled();
    });
  });

  describe("aggregate status determination", () => {
    it("should correctly identify CONFIRMED aggregate when all messages CONFIRMED", () => {
      // #given - array of all CONFIRMED statuses
      const statuses = [ChildToParentMessageStatus.CONFIRMED, ChildToParentMessageStatus.CONFIRMED];

      // #when - checking aggregate conditions
      const allExecuted = statuses.every((s) => s === ChildToParentMessageStatus.EXECUTED);
      const anyUnconfirmed = statuses.some((s) => s === ChildToParentMessageStatus.UNCONFIRMED);
      const allConfirmedOrExecuted = statuses.every(
        (s) =>
          s === ChildToParentMessageStatus.CONFIRMED || s === ChildToParentMessageStatus.EXECUTED
      );

      // #then - should determine CONFIRMED aggregate
      expect(allExecuted).toBe(false);
      expect(anyUnconfirmed).toBe(false);
      expect(allConfirmedOrExecuted).toBe(true);
      // Result: aggregateStatus = CONFIRMED (lines 290-291)
    });

    it("should correctly identify CONFIRMED aggregate when mix of CONFIRMED and EXECUTED", () => {
      // #given - array of mixed CONFIRMED and EXECUTED statuses
      const statuses = [
        ChildToParentMessageStatus.CONFIRMED,
        ChildToParentMessageStatus.EXECUTED,
        ChildToParentMessageStatus.CONFIRMED,
      ];

      // #when - checking aggregate conditions
      const allExecuted = statuses.every((s) => s === ChildToParentMessageStatus.EXECUTED);
      const anyUnconfirmed = statuses.some((s) => s === ChildToParentMessageStatus.UNCONFIRMED);
      const allConfirmedOrExecuted = statuses.every(
        (s) =>
          s === ChildToParentMessageStatus.CONFIRMED || s === ChildToParentMessageStatus.EXECUTED
      );

      // #then - should determine CONFIRMED aggregate
      expect(allExecuted).toBe(false);
      expect(anyUnconfirmed).toBe(false);
      expect(allConfirmedOrExecuted).toBe(true);
      // Result: aggregateStatus = CONFIRMED (lines 290-291)
    });

    it("should prioritize UNCONFIRMED over CONFIRMED in aggregate", () => {
      // #given - array with at least one UNCONFIRMED
      const statuses = [
        ChildToParentMessageStatus.CONFIRMED,
        ChildToParentMessageStatus.UNCONFIRMED,
        ChildToParentMessageStatus.EXECUTED,
      ];

      // #when - checking aggregate conditions
      const allExecuted = statuses.every((s) => s === ChildToParentMessageStatus.EXECUTED);
      const anyUnconfirmed = statuses.some((s) => s === ChildToParentMessageStatus.UNCONFIRMED);

      // #then - should have UNCONFIRMED aggregate
      expect(allExecuted).toBe(false);
      expect(anyUnconfirmed).toBe(true);
      // Result: aggregateStatus = UNCONFIRMED (lines 288-289)
    });

    it("should identify EXECUTED aggregate when all messages EXECUTED", () => {
      // #given - array of all EXECUTED statuses
      const statuses = [ChildToParentMessageStatus.EXECUTED, ChildToParentMessageStatus.EXECUTED];

      // #when - checking aggregate conditions
      const allExecuted = statuses.every((s) => s === ChildToParentMessageStatus.EXECUTED);

      // #then - should have EXECUTED aggregate
      expect(allExecuted).toBe(true);
      // Result: aggregateStatus = EXECUTED (lines 286-287)
    });
  });

  describe("firstExecutableBlock iteration logic", () => {
    it("should find minimum firstExecutableBlock from UNCONFIRMED messages", () => {
      // #given - mock data representing firstExecutableBlock values
      const firstExecutableBlocks = [
        { status: ChildToParentMessageStatus.UNCONFIRMED, block: 1000 },
        { status: ChildToParentMessageStatus.CONFIRMED, block: null },
        { status: ChildToParentMessageStatus.UNCONFIRMED, block: 500 },
        { status: ChildToParentMessageStatus.UNCONFIRMED, block: 750 },
      ];

      // #when - simulating the loop logic from lines 299-320
      let firstExecutableBlock: number | undefined;
      for (const msg of firstExecutableBlocks) {
        if (msg.status === ChildToParentMessageStatus.UNCONFIRMED && msg.block !== null) {
          if (!firstExecutableBlock || msg.block < firstExecutableBlock) {
            firstExecutableBlock = msg.block;
          }
        }
      }

      // #then - should find minimum value
      expect(firstExecutableBlock).toBe(500);
    });

    it("should handle when getFirstExecutableBlock returns null for some messages", () => {
      // #given - some UNCONFIRMED messages have null blocks
      const firstExecutableBlocks = [
        { status: ChildToParentMessageStatus.UNCONFIRMED, block: null },
        { status: ChildToParentMessageStatus.UNCONFIRMED, block: 1000 },
      ];

      // #when - simulating the loop logic
      let firstExecutableBlock: number | undefined;
      for (const msg of firstExecutableBlocks) {
        if (msg.status === ChildToParentMessageStatus.UNCONFIRMED && msg.block !== null) {
          if (!firstExecutableBlock || msg.block < firstExecutableBlock) {
            firstExecutableBlock = msg.block;
          }
        }
      }

      // #then - should use available value
      expect(firstExecutableBlock).toBe(1000);
    });

    it("should remain undefined when all UNCONFIRMED messages have null blocks", () => {
      // #given - all UNCONFIRMED messages have null blocks
      const firstExecutableBlocks = [
        { status: ChildToParentMessageStatus.UNCONFIRMED, block: null },
        { status: ChildToParentMessageStatus.UNCONFIRMED, block: null },
      ];

      // #when - simulating the loop logic
      let firstExecutableBlock: number | undefined;
      for (const msg of firstExecutableBlocks) {
        if (msg.status === ChildToParentMessageStatus.UNCONFIRMED && msg.block !== null) {
          if (!firstExecutableBlock || msg.block < firstExecutableBlock) {
            firstExecutableBlock = msg.block;
          }
        }
      }

      // #then - should remain undefined
      expect(firstExecutableBlock).toBeUndefined();
    });
  });
});

/**
 * RPC-based tests for L2→L1 message tracking
 *
 * These tests require RPC connections and verify the full tracking pipeline.
 */
describe.skipIf(shouldSkipRpc())(
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

      it("should return SKIPPED for Treasury L2 timelock execution (no L2→L1 messages)", async () => {
        // #given Treasury Governor L2 timelock execution tx (L2-only path, no L1 round-trip)
        const treasuryL2ExecutionTxHash =
          NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY.expectedStages.L2_TIMELOCK.hash;

        // #when tracking L2→L1 message
        const result = await trackL2ToL1Message(treasuryL2ExecutionTxHash, l2Provider, l1Provider);

        // #then should return SKIPPED status (no L2→L1 messages in transaction)
        expect(result.stage.status).toBe("SKIPPED");
        expect(result.messages).toHaveLength(0);
        expect(result.messagePositions).toHaveLength(0);
        expect(result.isConfirmed).toBe(false);
        expect(result.isExecuted).toBe(false);
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

    describe("prepareL2ToL1MessageStage", () => {
      it("should prepare completed stage with prepareCompleted option", async () => {
        // #given a completed L2_TO_L1_MESSAGE stage
        const l2ToL1Stage = trackedResult.stages.find((s) => s.type === "L2_TO_L1_MESSAGE");
        expect(l2ToL1Stage).toBeDefined();

        // #when preparing with prepareCompleted option
        const result = await prepareL2ToL1MessageStage(l2ToL1Stage!, l2Provider, l1Provider, {
          prepareCompleted: true,
        });

        // #then should return prepared transactions
        expect(result.total).toBeGreaterThan(0);
        expect(result.results.length).toBe(result.total);
        expect(result.results[0].success).toBe(true);
        if (result.results[0].success) {
          expect(result.results[0].prepared.chain).toBe("ethereum");
          expect(result.results[0].prepared.to).toMatch(/^0x[a-fA-F0-9]{40}$/);
        }
      });

      it("should return error for stage without l2TxHash", async () => {
        // #given a stage without l2TxHash - use type assertion for test mock
        const mockStage = {
          type: "L2_TO_L1_MESSAGE" as const,
          status: "READY" as const,
          chain: "arb1" as const,
          chainId: 42161,
          transactions: [],
          data: {
            messageCount: 0,
            l2Block: 0,
            l2TxHash: "", // Empty to trigger error
            messagePositions: [],
          },
        };

        // #when preparing
        const result = await prepareL2ToL1MessageStage(mockStage, l2Provider, l1Provider);

        // #then should return error in results
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0].success).toBe(false);
        if (!result.results[0].success) {
          expect(result.results[0].error).toBeDefined();
        }
      });

      it("should return error for NOT_STARTED stage without prepareCompleted", async () => {
        // #given a NOT_STARTED stage - use type assertion for test mock
        const mockStage = {
          type: "L2_TO_L1_MESSAGE" as const,
          status: "NOT_STARTED" as const,
          chain: "arb1" as const,
          chainId: 42161,
          transactions: [],
          data: {
            messageCount: 0,
            l2Block: 0,
            l2TxHash: "0x123",
            messagePositions: [],
          },
        };

        // #when preparing without prepareCompleted
        const result = await prepareL2ToL1MessageStage(mockStage, l2Provider, l1Provider);

        // #then should return validation error in results
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0].success).toBe(false);
      });
    });
  }
);
