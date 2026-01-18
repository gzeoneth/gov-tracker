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
import { shouldSkipRpc } from "./helpers";

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

describe.skipIf(shouldSkipRpc())("Security Council Salt Calculation", () => {
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
    // #given - a transaction receipt from a known SC rotation transaction

    // #when - checking if the receipt contains SC operation
    const result = isSecurityCouncilOperation(receipt);

    // #then - it should be detected as a security council operation
    expect(result).toBe(true);
  });

  it("should extract SC params (returns last operation)", () => {
    // #given - a transaction receipt containing multiple SC operations

    // #when - extracting SC params (which returns the last operation)
    const params = extractSecurityCouncilParams(receipt);

    // #then - should return the last operation with 12 members and nonce 6
    expect(params).not.toBeNull();
    expect(params!.members.length).toBe(12);
    expect(params!.nonce.toNumber()).toBe(6); // Last nonce
  });

  it("should extract all SC operations", () => {
    // #given - a transaction receipt containing 4 SC rotation operations

    // #when - extracting all SC operations from the receipt
    const allParams = extractAllSecurityCouncilParams(receipt);

    // #then - should return all 4 operations with incrementing nonces 3-6
    expect(allParams).not.toBeNull();
    expect(allParams!.operations.length).toBe(4);
    expect(allParams!.operations.map((op) => op.nonce.toNumber())).toEqual([3, 4, 5, 6]);
    expect(allParams!.operations.every((op) => op.operationId)).toBe(true);
  });

  it("should extract params for specific operation by ID", () => {
    // #given - callScheduled logs from the SC rotation transaction
    for (let i = 0; i < callScheduledLogs.length; i++) {
      const parsed = parseCallScheduledEvent(callScheduledLogs[i])!;

      // #when - extracting params for a specific operation ID
      const params = extractSecurityCouncilParamsForOperation(receipt, parsed.operationId);

      // #then - should match the nonce extracted directly from calldata
      expect(params).not.toBeNull();
      const expected = extractMembersAndNonceFromCallData(parsed.data);
      expect(params!.nonce.eq(expected!.nonce)).toBe(true);
    }
  });

  it("should validate salt computation for all operations", async () => {
    for (const log of callScheduledLogs) {
      // #given - a callScheduled log with members and nonce extracted from calldata
      const parsed = parseCallScheduledEvent(log)!;
      const extracted = extractMembersAndNonceFromCallData(parsed.data);
      expect(extracted).not.toBeNull();

      // #when - computing salt on-chain and validating the operation hash
      const computedSalt = await generateSecurityCouncilSalt(
        extracted!.members,
        extracted!.nonce,
        provider
      );
      const validation = await computeAndValidateOperationHash(parsed.operationId, {
        target: parsed.target,
        value: parsed.value,
        data: parsed.data,
        predecessor: parsed.predecessor,
        salt: computedSalt,
      });

      // #then - the computed salt should produce a valid operation hash
      expect(validation.isValid).toBe(true);
    }
  });
});

describe.skipIf(shouldSkipRpc())("Security Council Rotation Tracking", () => {
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
    // #given - a transaction receipt fetched from a known SC rotation tx hash
    const receipt = await queryWithRetry(() => l2Provider.getTransactionReceipt(TX_HASH));

    // #when - checking if it's a security council operation

    // #then - it should be detected as a security council operation
    expect(isSecurityCouncilOperation(receipt)).toBe(true);
  });

  it("should track SC rotation operation from tx hash", async () => {
    // #given - a tracker configured with L1, L2, and Nova providers
    const tracker = createTracker({
      l2Provider,
      l1Provider,
      novaProvider,
    });

    // #when - tracking all operations from the SC rotation TX
    const results = await tracker.trackByTxHash(TX_HASH);

    // #then - should find all 4 operations with L2 timelock stages
    expect(results.length).toBe(4);
    const result = results[0];
    expect(result.stages.length).toBeGreaterThan(0);
    const l2TimelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
    expect(l2TimelockStage).toBeDefined();
  }, 300000); // 5 minute timeout for slow SC tracking
});
