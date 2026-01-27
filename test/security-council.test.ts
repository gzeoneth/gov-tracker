/**
 * Unit tests for discovery/security-council.ts
 *
 * Tests for extractAllSecurityCouncilParams, extractSecurityCouncilParamsForOperation,
 * and extractSecurityCouncilParams.
 *
 * Includes RPC integration tests for salt calculation validation.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers, BigNumber } from "ethers";
import * as dotenv from "dotenv";

import {
  extractAllSecurityCouncilParams,
  extractSecurityCouncilParamsForOperation,
  extractSecurityCouncilParams,
  isSecurityCouncilOperation,
} from "../src/discovery/security-council";
import { parseCallScheduledEvent } from "../src/discovery/timelock-discovery";
import {
  timelockInterface,
  arbSysInterface,
  upgradeExecutorInterface,
  memberSyncActionInterface,
} from "../src/abis";
import { ADDRESSES, EVENT_TOPICS, DEFAULT_RPC_URLS } from "../src/constants";
import { queryWithRetry } from "../src/utils/rpc-utils";
import { generateSecurityCouncilSalt } from "../src/utils/salt-computation";
import { computeAndValidateOperationHash } from "../src/utils/operation-id";
import { createTracker } from "../src";
import { shouldSkipRpc } from "./helpers";

dotenv.config({ quiet: true });

describe("security-council", () => {
  describe("extractAllSecurityCouncilParams", () => {
    function createMockReceipt(
      logs: Array<{ address: string; topics: string[]; data: string }>
    ): ethers.providers.TransactionReceipt {
      return {
        to: "0x0000000000000000000000000000000000000000",
        from: "0x0000000000000000000000000000000000000000",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(21000),
        logsBloom: "0x",
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs: logs.map((log, i) => ({
          blockNumber: 12345,
          blockHash: "0x" + "a".repeat(64),
          transactionIndex: 0,
          removed: false,
          address: log.address,
          data: log.data,
          topics: log.topics,
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

    function encodeSecurityCouncilCallData(): string {
      // Build the nested calldata structure:
      // 1. SecurityCouncilMemberSyncAction.perform(council, members, nonce)
      const members = ["0x" + "1".repeat(40), "0x" + "2".repeat(40), "0x" + "3".repeat(40)];
      const nonce = BigNumber.from(5);
      const performData = memberSyncActionInterface.encodeFunctionData("perform", [
        "0x" + "a".repeat(40), // council address
        members,
        nonce,
      ]);

      // 2. UpgradeExecutor.execute(upgrade, data)
      const executeData = upgradeExecutorInterface.encodeFunctionData("execute", [
        "0x" + "b".repeat(40), // upgrade address
        performData,
      ]);

      // 3. L1Timelock.scheduleBatch(...) with executeData as first payload
      const scheduleBatchData = timelockInterface.encodeFunctionData("scheduleBatch", [
        ["0x" + "c".repeat(40)], // targets
        [BigNumber.from(0)], // values
        [executeData], // payloads
        "0x" + "0".repeat(64), // predecessor
        "0x" + "d".repeat(64), // salt
        BigNumber.from(86400), // delay
      ]);

      // 4. ArbSys.sendTxToL1(destination, data)
      const sendTxToL1Data = arbSysInterface.encodeFunctionData("sendTxToL1", [
        "0x" + "e".repeat(40), // L1 destination
        scheduleBatchData,
      ]);

      return sendTxToL1Data;
    }

    function createCallScheduledLog(
      timelockAddress: string,
      operationId: string,
      callData: string
    ): { address: string; topics: string[]; data: string } {
      // Encode the CallScheduled event
      // event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)
      const abiCoder = ethers.utils.defaultAbiCoder;
      const target = "0x" + "0".repeat(24) + "0000000000000064"; // ArbSys precompile
      const value = BigNumber.from(0);
      const predecessor = "0x" + "0".repeat(64);
      const delay = BigNumber.from(86400);

      const data = abiCoder.encode(
        ["address", "uint256", "bytes", "bytes32", "uint256"],
        [target, value, callData, predecessor, delay]
      );

      return {
        address: timelockAddress,
        topics: [
          EVENT_TOPICS.CALL_SCHEDULED,
          operationId, // indexed id
          "0x" + "0".repeat(64), // indexed index (0)
        ],
        data,
      };
    }

    it("should return null for non-SC operation receipt", () => {
      // #given - receipt without SC manager logs
      const receipt = createMockReceipt([
        {
          address: "0x" + "1".repeat(40),
          topics: [EVENT_TOPICS.CALL_SCHEDULED],
          data: "0x",
        },
      ]);

      // #when
      const result = extractAllSecurityCouncilParams(receipt);

      // #then
      expect(result).toBeNull();
    });

    it("should return null when no CallScheduled logs present", () => {
      // #given - SC manager log but no CallScheduled
      const receipt = createMockReceipt([
        {
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          topics: ["0x" + "1".repeat(64)], // Some other event
          data: "0x",
        },
      ]);

      // #when
      const result = extractAllSecurityCouncilParams(receipt);

      // #then
      expect(result).toBeNull();
    });

    it("should return null when CallScheduled logs are from multiple timelocks", () => {
      // #given - SC operation with logs from different timelocks
      const callData = encodeSecurityCouncilCallData();
      const receipt = createMockReceipt([
        {
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          topics: [],
          data: "0x",
        },
        createCallScheduledLog("0x" + "1".repeat(40), "0x" + "a".repeat(64), callData),
        createCallScheduledLog("0x" + "2".repeat(40), "0x" + "b".repeat(64), callData), // Different timelock
      ]);

      // #when
      const result = extractAllSecurityCouncilParams(receipt);

      // #then
      expect(result).toBeNull();
    });

    it("should return null when calldata cannot be decoded", () => {
      // #given - SC operation with invalid calldata
      const receipt = createMockReceipt([
        {
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          topics: [],
          data: "0x",
        },
        {
          address: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          topics: [EVENT_TOPICS.CALL_SCHEDULED, "0x" + "a".repeat(64), "0x" + "0".repeat(64)],
          data: ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "uint256"],
            ["0x" + "1".repeat(40), 0, "0xdeadbeef", "0x" + "0".repeat(64), 86400]
          ),
        },
      ]);

      // #when
      const result = extractAllSecurityCouncilParams(receipt);

      // #then
      expect(result).toBeNull();
    });

    it("should return null when scheduleBatch has empty payloads", () => {
      // #given - nested calldata with empty payloads array (hits line 135)
      // Build calldata with empty payloads in scheduleBatch
      const scheduleBatchWithEmptyPayloads = timelockInterface.encodeFunctionData("scheduleBatch", [
        [], // empty targets
        [], // empty values
        [], // empty payloads - this triggers line 135
        "0x" + "0".repeat(64), // predecessor
        "0x" + "d".repeat(64), // salt
        BigNumber.from(86400), // delay
      ]);
      const sendTxToL1Data = arbSysInterface.encodeFunctionData("sendTxToL1", [
        "0x" + "e".repeat(40),
        scheduleBatchWithEmptyPayloads,
      ]);

      const abiCoder = ethers.utils.defaultAbiCoder;
      const eventData = abiCoder.encode(
        ["address", "uint256", "bytes", "bytes32", "uint256"],
        [
          "0x" + "0".repeat(24) + "0000000000000064",
          0,
          sendTxToL1Data,
          "0x" + "0".repeat(64),
          86400,
        ]
      );

      const receipt = createMockReceipt([
        {
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          topics: [],
          data: "0x",
        },
        {
          address: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          topics: [EVENT_TOPICS.CALL_SCHEDULED, "0x" + "a".repeat(64), "0x" + "0".repeat(64)],
          data: eventData,
        },
      ]);

      // #when
      const result = extractAllSecurityCouncilParams(receipt);

      // #then
      expect(result).toBeNull();
    });

    it("should extract params from valid SC operation", () => {
      // #given
      const timelockAddress = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;
      const operationId = "0x" + "f".repeat(64);
      const callData = encodeSecurityCouncilCallData();
      const receipt = createMockReceipt([
        {
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          topics: [],
          data: "0x",
        },
        createCallScheduledLog(timelockAddress, operationId, callData),
      ]);

      // #when
      const result = extractAllSecurityCouncilParams(receipt);

      // #then
      expect(result).not.toBeNull();
      expect(result!.timelockAddress).toBe(timelockAddress);
      expect(result!.operations).toHaveLength(1);
      expect(result!.operations[0].members).toHaveLength(3);
      expect(result!.operations[0].nonce.toNumber()).toBe(5);
      expect(result!.operations[0].operationId).toBe(operationId);
    });

    it("should extract multiple operations from batch SC rotation", () => {
      // #given - two operations in the same batch
      const timelockAddress = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;
      const callData = encodeSecurityCouncilCallData();
      const receipt = createMockReceipt([
        {
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          topics: [],
          data: "0x",
        },
        createCallScheduledLog(timelockAddress, "0x" + "a".repeat(64), callData),
        createCallScheduledLog(timelockAddress, "0x" + "b".repeat(64), callData),
      ]);

      // #when
      const result = extractAllSecurityCouncilParams(receipt);

      // #then
      expect(result).not.toBeNull();
      expect(result!.operations).toHaveLength(2);
      expect(result!.operations[0].operationId).toBe("0x" + "a".repeat(64));
      expect(result!.operations[1].operationId).toBe("0x" + "b".repeat(64));
    });
  });

  describe("extractSecurityCouncilParamsForOperation", () => {
    function createMockReceiptWithOperations(
      operationIds: string[]
    ): ethers.providers.TransactionReceipt {
      const timelockAddress = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;

      // Create minimal valid calldata structure
      const members = ["0x" + "1".repeat(40)];
      const performData = memberSyncActionInterface.encodeFunctionData("perform", [
        "0x" + "a".repeat(40),
        members,
        BigNumber.from(1),
      ]);
      const executeData = upgradeExecutorInterface.encodeFunctionData("execute", [
        "0x" + "b".repeat(40),
        performData,
      ]);
      const scheduleBatchData = timelockInterface.encodeFunctionData("scheduleBatch", [
        ["0x" + "c".repeat(40)],
        [BigNumber.from(0)],
        [executeData],
        "0x" + "0".repeat(64),
        "0x" + "d".repeat(64),
        BigNumber.from(86400),
      ]);
      const callData = arbSysInterface.encodeFunctionData("sendTxToL1", [
        "0x" + "e".repeat(40),
        scheduleBatchData,
      ]);

      const abiCoder = ethers.utils.defaultAbiCoder;
      const encodedData = abiCoder.encode(
        ["address", "uint256", "bytes", "bytes32", "uint256"],
        ["0x" + "0".repeat(24) + "0000000000000064", 0, callData, "0x" + "0".repeat(64), 86400]
      );

      const logs = [
        {
          blockNumber: 12345,
          blockHash: "0x" + "a".repeat(64),
          transactionIndex: 0,
          removed: false,
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          data: "0x",
          topics: [],
          transactionHash: "0x" + "b".repeat(64),
          logIndex: 0,
        },
        ...operationIds.map((opId, i) => ({
          blockNumber: 12345,
          blockHash: "0x" + "a".repeat(64),
          transactionIndex: 0,
          removed: false,
          address: timelockAddress,
          data: encodedData,
          topics: [EVENT_TOPICS.CALL_SCHEDULED, opId, "0x" + "0".repeat(64)],
          transactionHash: "0x" + "b".repeat(64),
          logIndex: i + 1,
        })),
      ];

      return {
        to: "0x0000000000000000000000000000000000000000",
        from: "0x0000000000000000000000000000000000000000",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(21000),
        logsBloom: "0x",
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs,
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(21000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };
    }

    it("should return null when batch extraction fails", () => {
      // #given - receipt without SC operation
      const receipt: ethers.providers.TransactionReceipt = {
        to: "0x0000000000000000000000000000000000000000",
        from: "0x0000000000000000000000000000000000000000",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(21000),
        logsBloom: "0x",
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs: [],
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(21000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };

      // #when
      const result = extractSecurityCouncilParamsForOperation(receipt, "0x" + "a".repeat(64));

      // #then
      expect(result).toBeNull();
    });

    it("should return null when operation ID not found", () => {
      // #given
      const receipt = createMockReceiptWithOperations(["0x" + "1".repeat(64)]);

      // #when
      const result = extractSecurityCouncilParamsForOperation(receipt, "0x" + "9".repeat(64));

      // #then
      expect(result).toBeNull();
    });

    it("should return params for matching operation ID", () => {
      // #given
      const targetOpId = "0x" + "2".repeat(64);
      const receipt = createMockReceiptWithOperations([
        "0x" + "1".repeat(64),
        targetOpId,
        "0x" + "3".repeat(64),
      ]);

      // #when
      const result = extractSecurityCouncilParamsForOperation(receipt, targetOpId);

      // #then
      expect(result).not.toBeNull();
      expect(result!.operationId).toBe(targetOpId);
    });

    it("should be case insensitive for operation ID matching", () => {
      // #given
      const receipt = createMockReceiptWithOperations(["0xABCD" + "0".repeat(60)]);

      // #when
      const result = extractSecurityCouncilParamsForOperation(receipt, "0xabcd" + "0".repeat(60));

      // #then
      expect(result).not.toBeNull();
    });
  });

  describe("extractSecurityCouncilParams", () => {
    function createMockReceiptWithOperations(
      operationIds: string[]
    ): ethers.providers.TransactionReceipt {
      const timelockAddress = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;

      const members = ["0x" + "1".repeat(40)];
      const performData = memberSyncActionInterface.encodeFunctionData("perform", [
        "0x" + "a".repeat(40),
        members,
        BigNumber.from(1),
      ]);
      const executeData = upgradeExecutorInterface.encodeFunctionData("execute", [
        "0x" + "b".repeat(40),
        performData,
      ]);
      const scheduleBatchData = timelockInterface.encodeFunctionData("scheduleBatch", [
        ["0x" + "c".repeat(40)],
        [BigNumber.from(0)],
        [executeData],
        "0x" + "0".repeat(64),
        "0x" + "d".repeat(64),
        BigNumber.from(86400),
      ]);
      const callData = arbSysInterface.encodeFunctionData("sendTxToL1", [
        "0x" + "e".repeat(40),
        scheduleBatchData,
      ]);

      const abiCoder = ethers.utils.defaultAbiCoder;
      const encodedData = abiCoder.encode(
        ["address", "uint256", "bytes", "bytes32", "uint256"],
        ["0x" + "0".repeat(24) + "0000000000000064", 0, callData, "0x" + "0".repeat(64), 86400]
      );

      const logs = [
        {
          blockNumber: 12345,
          blockHash: "0x" + "a".repeat(64),
          transactionIndex: 0,
          removed: false,
          address: ADDRESSES.SECURITY_COUNCIL_MANAGER,
          data: "0x",
          topics: [],
          transactionHash: "0x" + "b".repeat(64),
          logIndex: 0,
        },
        ...operationIds.map((opId, i) => ({
          blockNumber: 12345,
          blockHash: "0x" + "a".repeat(64),
          transactionIndex: 0,
          removed: false,
          address: timelockAddress,
          data: encodedData,
          topics: [EVENT_TOPICS.CALL_SCHEDULED, opId, "0x" + "0".repeat(64)],
          transactionHash: "0x" + "b".repeat(64),
          logIndex: i + 1,
        })),
      ];

      return {
        to: "0x0000000000000000000000000000000000000000",
        from: "0x0000000000000000000000000000000000000000",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(21000),
        logsBloom: "0x",
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs,
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(21000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };
    }

    it("should return null for non-SC receipt", () => {
      // #given
      const receipt: ethers.providers.TransactionReceipt = {
        to: "0x0000000000000000000000000000000000000000",
        from: "0x0000000000000000000000000000000000000000",
        contractAddress: "",
        transactionIndex: 0,
        gasUsed: BigNumber.from(21000),
        logsBloom: "0x",
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logs: [],
        blockNumber: 12345,
        confirmations: 1,
        cumulativeGasUsed: BigNumber.from(21000),
        effectiveGasPrice: BigNumber.from(1000000000),
        byzantium: true,
        type: 2,
        status: 1,
      };

      // #when
      const result = extractSecurityCouncilParams(receipt);

      // #then
      expect(result).toBeNull();
    });

    it("should return the last operation from batch", () => {
      // #given - batch with 3 operations
      const receipt = createMockReceiptWithOperations([
        "0x" + "1".repeat(64),
        "0x" + "2".repeat(64),
        "0x" + "3".repeat(64),
      ]);

      // #when
      const result = extractSecurityCouncilParams(receipt);

      // #then
      expect(result).not.toBeNull();
      expect(result!.operationId).toBe("0x" + "3".repeat(64));
    });

    it("should return single operation when only one exists", () => {
      // #given
      const receipt = createMockReceiptWithOperations(["0x" + "a".repeat(64)]);

      // #when
      const result = extractSecurityCouncilParams(receipt);

      // #then
      expect(result).not.toBeNull();
      expect(result!.operationId).toBe("0x" + "a".repeat(64));
    });
  });
});

/**
 * Security Council Salt Calculation Integration Tests
 *
 * Validates that the SDK's salt calculation logic correctly handles
 * Security Council rotation operations using real RPC data.
 */
const SC_ROTATION_TX = "0xa0d5366b53fc16ad524446a74f19cad23de4c96a939dfcd64555b3b12036c700";

const ARB_SYS_ABI = ["function sendTxToL1(address, bytes) payable returns (uint256)"];
const TIMELOCK_ABI = [
  "function scheduleBatch(address[], uint256[], bytes[], bytes32, bytes32, uint256)",
];
const UPGRADE_EXECUTOR_ABI = ["function execute(address, bytes)"];
const MEMBER_SYNC_ACTION_ABI = ["function perform(address, address[], uint256) returns (bool)"];

function extractMembersAndNonceFromCallData(
  data: string
): { members: string[]; nonce: BigNumber } | null {
  const arbSysIface = new ethers.utils.Interface(ARB_SYS_ABI);
  const timelockIface = new ethers.utils.Interface(TIMELOCK_ABI);
  const upExecIface = new ethers.utils.Interface(UPGRADE_EXECUTOR_ABI);
  const actionIface = new ethers.utils.Interface(MEMBER_SYNC_ACTION_ABI);

  try {
    const sendTxDecoded = arbSysIface.decodeFunctionData("sendTxToL1", data);
    const scheduleBatch = timelockIface.decodeFunctionData("scheduleBatch", sendTxDecoded[1]);
    const payloads = scheduleBatch[2] as string[];
    const executeData = upExecIface.decodeFunctionData("execute", payloads[0]);
    const performData = actionIface.decodeFunctionData("perform", executeData[1]);
    return { members: performData[1] as string[], nonce: performData[2] as BigNumber };
  } catch {
    return null;
  }
}

describe.skipIf(shouldSkipRpc())("Security Council Salt Calculation (RPC)", () => {
  let provider: ethers.providers.JsonRpcProvider;
  let receipt: ethers.providers.TransactionReceipt;
  let callScheduledLogs: ethers.providers.Log[];

  // Cached extraction results - populated once in beforeAll
  let cachedIsScOperation: boolean;
  let cachedScParams: ReturnType<typeof extractSecurityCouncilParams>;
  let cachedAllScParams: ReturnType<typeof extractAllSecurityCouncilParams>;
  // Cached parsed logs and salts for validation - computed in parallel in beforeAll
  let cachedValidations: Array<{ operationId: string; isValid: boolean }>;

  beforeAll(async () => {
    const rpcUrl = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    receipt = await queryWithRetry(() => provider.getTransactionReceipt(SC_ROTATION_TX));
    callScheduledLogs = receipt.logs.filter((log) => log.topics[0] === EVENT_TOPICS.CALL_SCHEDULED);

    // Cache extraction results
    cachedIsScOperation = isSecurityCouncilOperation(receipt);
    cachedScParams = extractSecurityCouncilParams(receipt);
    cachedAllScParams = extractAllSecurityCouncilParams(receipt);

    // Cache salt validations in parallel (avoids 4 sequential RPC calls in test)
    const validationPromises = callScheduledLogs.map(async (log) => {
      const parsed = parseCallScheduledEvent(log)!;
      const extracted = extractMembersAndNonceFromCallData(parsed.data)!;
      const computedSalt = await generateSecurityCouncilSalt(
        extracted.members,
        extracted.nonce,
        provider
      );
      const validation = computeAndValidateOperationHash(parsed.operationId, {
        target: parsed.target,
        value: parsed.value,
        data: parsed.data,
        predecessor: parsed.predecessor,
        salt: computedSalt,
      });
      return { operationId: parsed.operationId, isValid: validation.isValid };
    });
    cachedValidations = await Promise.all(validationPromises);
  });

  it("should detect SC operation", () => {
    expect(cachedIsScOperation).toBe(true);
  });

  it("should extract SC params (returns last operation)", () => {
    expect(cachedScParams).not.toBeNull();
    expect(cachedScParams!.members.length).toBe(12);
    expect(cachedScParams!.nonce.toNumber()).toBe(6);
  });

  it("should extract all SC operations", () => {
    expect(cachedAllScParams).not.toBeNull();
    expect(cachedAllScParams!.operations.length).toBe(4);
    expect(cachedAllScParams!.operations.map((op) => op.nonce.toNumber())).toEqual([3, 4, 5, 6]);
  });

  it("should extract params for specific operation by ID", () => {
    for (let i = 0; i < callScheduledLogs.length; i++) {
      const parsed = parseCallScheduledEvent(callScheduledLogs[i])!;
      const params = extractSecurityCouncilParamsForOperation(receipt, parsed.operationId);
      expect(params).not.toBeNull();
      const expected = extractMembersAndNonceFromCallData(parsed.data);
      expect(params!.nonce.eq(expected!.nonce)).toBe(true);
    }
  });

  it("should validate salt computation for all operations", () => {
    // Uses cached validation results from beforeAll (4 parallel salt computations)
    expect(cachedValidations.length).toBe(callScheduledLogs.length);
    for (const validation of cachedValidations) {
      expect(validation.isValid).toBe(true);
    }
  });
});

describe.skipIf(shouldSkipRpc())("Security Council Rotation Tracking (RPC)", () => {
  let l2Provider: ethers.providers.JsonRpcProvider;
  let l1Provider: ethers.providers.JsonRpcProvider;
  let novaProvider: ethers.providers.JsonRpcProvider;

  // Cached results - populated once in beforeAll
  let cachedReceipt: ethers.providers.TransactionReceipt;
  let cachedTrackingResults: Awaited<ReturnType<ReturnType<typeof createTracker>["trackByTxHash"]>>;

  beforeAll(async () => {
    const ethRpc = process.env.ETH_RPC;
    if (!ethRpc) {
      throw new Error("RPC URLs required: Set ETH_RPC environment variables");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

    l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
    novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);

    // Cache receipt and tracking results once
    const tracker = createTracker({ l2Provider, l1Provider, novaProvider });
    const [receipt, results] = await Promise.all([
      queryWithRetry(() => l2Provider.getTransactionReceipt(SC_ROTATION_TX)),
      tracker.trackByTxHash(SC_ROTATION_TX),
    ]);
    cachedReceipt = receipt;
    cachedTrackingResults = results;
    console.log("✓ SC rotation tracking results cached");
  }, 300000);

  it("should detect SC update in transaction receipt", () => {
    expect(isSecurityCouncilOperation(cachedReceipt)).toBe(true);
  });

  it("should track SC rotation operation from tx hash", () => {
    expect(cachedTrackingResults.length).toBe(4);
    const result = cachedTrackingResults[0];
    expect(result.stages.length).toBeGreaterThan(0);
    const l2TimelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
    expect(l2TimelockStage).toBeDefined();
  });
});
