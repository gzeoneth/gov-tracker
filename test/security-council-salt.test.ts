/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Security Council Salt Calculation Integration Test
 *
 * Validates that the SDK's salt calculation logic correctly handles
 * Security Council rotation operations.
 *
 * Key Facts from Real SC Rotation TX 0xa0d5366b...:
 * 1. SC rotations create MULTIPLE operations in a single transaction
 * 2. Each operation has its own incrementing nonce (e.g., 3, 4, 5, 6)
 * 3. Salt = keccak256(abi.encode(members, nonce))
 * 4. Operations update SC on different chains via L1 timelock
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as dotenv from "dotenv";
import { ethers, BigNumber } from "ethers";
import {
  extractSecurityCouncilParams,
  extractAllSecurityCouncilParams,
  extractSecurityCouncilParamsForOperation,
  isSecurityCouncilOperation,
} from "../src/discovery/security-council";
import { parseCallScheduledEvent } from "../src/discovery/timelock-discovery";
import { queryWithRetry } from "../src/utils/rpc-utils";
import { generateSecurityCouncilSalt } from "../src/utils/salt-computation";
import { computeAndValidateOperationHash } from "../src/utils/operation-id";
import { DEFAULT_RPC_URLS, EVENT_TOPICS } from "../src/constants";
import { createTracker } from "../src";

dotenv.config({ quiet: true });

const TX_HASH = "0xa0d5366b53fc16ad524446a74f19cad23de4c96a939dfcd64555b3b12036c700";

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

describe.skipIf(process.env.NO_RPC === "1")("Security Council Salt Calculation", () => {
  let provider: ethers.providers.JsonRpcProvider;
  let receipt: ethers.providers.TransactionReceipt;
  let callScheduledLogs: ethers.providers.Log[];

  beforeAll(async () => {
    const rpcUrl = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    receipt = await queryWithRetry(() => provider.getTransactionReceipt(TX_HASH));
    callScheduledLogs = receipt.logs.filter((log) => log.topics[0] === EVENT_TOPICS.CALL_SCHEDULED);
  });

  it("should detect SC operation", () => {
    expect(isSecurityCouncilOperation(receipt)).toBe(true);
  });

  it("should extract SC params (returns last operation)", () => {
    const params = extractSecurityCouncilParams(receipt);
    expect(params).not.toBeNull();
    expect(params!.members.length).toBe(12);
    expect(params!.nonce.toNumber()).toBe(6); // Last nonce
  });

  it("should extract all SC operations", () => {
    const allParams = extractAllSecurityCouncilParams(receipt);
    expect(allParams).not.toBeNull();
    expect(allParams!.operations.length).toBe(4);
    expect(allParams!.operations.map((op) => op.nonce.toNumber())).toEqual([3, 4, 5, 6]);
    expect(allParams!.operations.every((op) => op.operationId)).toBe(true);
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

  it("should validate salt computation for all operations", async () => {
    for (const log of callScheduledLogs) {
      const parsed = parseCallScheduledEvent(log)!;
      const extracted = extractMembersAndNonceFromCallData(parsed.data);
      expect(extracted).not.toBeNull();

      // Use on-chain SC salt generation for 100% accuracy
      const computedSalt = await generateSecurityCouncilSalt(
        extracted!.members,
        extracted!.nonce,
        provider
      );
      const validation = await computeAndValidateOperationHash(
        parsed.timelockAddress,
        parsed.operationId,
        {
          target: parsed.target,
          value: parsed.value,
          data: parsed.data,
          predecessor: parsed.predecessor,
          salt: computedSalt,
        },
        provider
      );
      expect(validation.isValid).toBe(true);
    }
  }, 30000);
});

describe.skipIf(process.env.NO_RPC === "1")("Security Council Rotation Tracking", () => {
  let l2Provider: ethers.providers.JsonRpcProvider;
  let l1Provider: ethers.providers.JsonRpcProvider;
  let novaProvider: ethers.providers.JsonRpcProvider;

  beforeAll(() => {
    const ethRpc = process.env.ETH_RPC || "https://eth-mainnet.g.alchemy.com/v2/demo";
    if (!ethRpc) {
      throw new Error("RPC URLs required: Set ETH_RPC environment variables");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

    l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
    novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);
  });

  it("should detect SC update in transaction receipt", async () => {
    const receipt = await queryWithRetry(() => l2Provider.getTransactionReceipt(TX_HASH));
    expect(isSecurityCouncilOperation(receipt)).toBe(true);
  }, 30000);

  it("should track SC rotation operation from tx hash", async () => {
    const tracker = createTracker({
      l2Provider,
      l1Provider,
      novaProvider,
    });

    // Track all operations from the SC rotation TX
    const results = await tracker.trackByTxHash(TX_HASH);

    // Should find all 4 operations from SC rotation
    expect(results.length).toBe(4);

    // First result should have timelock stages
    const result = results[0];
    expect(result.stages.length).toBeGreaterThan(0);

    // L2 timelock should be present
    const l2TimelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
    expect(l2TimelockStage).toBeDefined();
  }, 90000);
});
