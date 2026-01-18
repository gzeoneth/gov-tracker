/**
 * Security Council special handling
 *
 * Detect Security Council updates, handle vetting periods, generate salts
 */

import { BigNumber, ethers } from "ethers";
import { ADDRESSES, EVENT_TOPICS } from "../constants";
import { queryWithRetry } from "../utils/rpc-utils";
import { getL1BlockNumberFromL2 } from "../utils/timing";
import { addressEquals } from "../utils/chain";
import {
  GOVERNOR_WITH_VETTER_ABI,
  timelockInterface,
  arbSysInterface,
  upgradeExecutorInterface,
  memberSyncActionInterface,
} from "../abis";

/**
 * Check vetting period for a Security Council nominee election
 *
 * IMPORTANT: The vetting deadline is an L1 block number, not an L2 block number.
 * We must compare against the L1 block number (via ArbSys) to determine if
 * vetting is still active. This is consistent with how voting deadlines work.
 */
export async function checkVettingPeriod(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider
): Promise<{
  hasVettingPeriod: boolean;
  vettingDeadline: BigNumber | null;
  isVettingActive: boolean;
  vetterAddress: string | null;
}> {
  const governor = new ethers.Contract(governorAddress, GOVERNOR_WITH_VETTER_ABI, provider);

  try {
    // First check if this governor has vetting functionality
    const [vettingDeadline, vetterAddress] = await Promise.all([
      queryWithRetry<BigNumber>(() => governor.proposalVettingDeadline(proposalId)),
      queryWithRetry<string>(() => governor.vetter()),
    ]);

    // If no vetting deadline set, no vetting period
    if (!vettingDeadline.gt(0)) {
      return {
        hasVettingPeriod: false,
        vettingDeadline: null,
        isVettingActive: false,
        vetterAddress,
      };
    }

    // CRITICAL: The vetting deadline is an L1 block number.
    // We need to get the current L1 block number via Multicall3.
    const currentL1Block = await getL1BlockNumberFromL2(provider);
    const isVettingActive = currentL1Block.lte(vettingDeadline);

    return {
      hasVettingPeriod: true,
      vettingDeadline,
      isVettingActive,
      vetterAddress,
    };
  } catch {
    // Governor doesn't have vetting functionality
    return {
      hasVettingPeriod: false,
      vettingDeadline: null,
      isVettingActive: false,
      vetterAddress: null,
    };
  }
}

/**
 * Detect if a proposal is a Security Council election
 */
export function isSecurityCouncilElectionProposal(targets: string[]): boolean {
  return targets.some((target) => addressEquals(target, ADDRESSES.SECURITY_COUNCIL_MANAGER));
}

/**
 * Extracted Security Council operation parameters
 */
export interface SecurityCouncilOperationParams {
  members: string[];
  nonce: BigNumber;
  timelockAddress: string;
  /** Operation ID for this specific operation */
  operationId?: string;
}

/**
 * All Security Council operations in a batch transaction
 */
export interface SecurityCouncilBatchParams {
  /** All operations with their individual params */
  operations: SecurityCouncilOperationParams[];
  /** Common timelock address */
  timelockAddress: string;
}

/**
 * Check if a transaction receipt is a Security Council operation
 */
export function isSecurityCouncilOperation(receipt: ethers.providers.TransactionReceipt): boolean {
  return receipt.logs.some((log) => addressEquals(log.address, ADDRESSES.SECURITY_COUNCIL_MANAGER));
}

/**
 * Extract members and nonce from CallScheduled event data
 *
 * The extraction follows this data nesting:
 * 1. CallScheduled event contains data for ArbSys.sendTxToL1
 * 2. sendTxToL1 contains data for L1Timelock.scheduleBatch
 * 3. scheduleBatch's first payload contains UpgradeExecutor.execute
 * 4. execute contains SecurityCouncilMemberSyncAction.perform(council, members, nonce)
 */
function extractMembersAndNonceFromCallData(
  data: string
): { members: string[]; nonce: BigNumber } | null {
  try {
    // Step 1: Decode ArbSys.sendTxToL1(destination, data)
    const sendTxToL1Data = arbSysInterface.decodeFunctionData("sendTxToL1", data);
    const l1TimelockData = sendTxToL1Data[1];

    // Step 2: Decode L1Timelock.scheduleBatch(...)
    const scheduleBatchData = timelockInterface.decodeFunctionData("scheduleBatch", l1TimelockData);
    const payloads = scheduleBatchData[2] as string[];

    if (payloads.length === 0) {
      return null;
    }

    // Step 3: Decode UpgradeExecutor.execute(upgrade, data)
    const executeData = upgradeExecutorInterface.decodeFunctionData("execute", payloads[0]);
    const actionData = executeData[1];

    // Step 4: Decode SecurityCouncilMemberSyncAction.perform(council, members, nonce)
    const performData = memberSyncActionInterface.decodeFunctionData("perform", actionData);
    const members = performData[1] as string[];
    const nonce = performData[2] as BigNumber;

    return { members, nonce };
  } catch {
    return null;
  }
}

/**
 * Extract Security Council params for ALL operations from a CallScheduled receipt
 *
 * SC rotations create MULTIPLE operations in a single transaction, each with
 * its own incrementing nonce. This function returns params for every operation.
 */
export function extractAllSecurityCouncilParams(
  receipt: ethers.providers.TransactionReceipt
): SecurityCouncilBatchParams | null {
  if (!isSecurityCouncilOperation(receipt)) {
    return null;
  }

  const callScheduledLogs = receipt.logs.filter(
    (log) => log.topics[0] === EVENT_TOPICS.CALL_SCHEDULED
  );

  if (callScheduledLogs.length === 0) {
    return null;
  }

  // Validate all CallScheduled logs come from the same timelock
  // SC operations should all target the same L2 timelock
  const timelockAddress = callScheduledLogs[0].address;
  const hasMultipleTimelocks = callScheduledLogs.some(
    (log) => !addressEquals(log.address, timelockAddress)
  );
  if (hasMultipleTimelocks) {
    // This shouldn't happen for SC operations, but guard against it
    return null;
  }

  const operations = callScheduledLogs.flatMap((log) => {
    const parsed = timelockInterface.parseLog(log);
    const operationId = parsed.args.id as string;
    const extracted = extractMembersAndNonceFromCallData(parsed.args.data as string);
    return extracted
      ? [
          {
            members: extracted.members,
            nonce: extracted.nonce,
            timelockAddress: log.address,
            operationId,
          },
        ]
      : [];
  });

  if (operations.length === 0) return null;

  return {
    operations,
    timelockAddress,
  };
}

/**
 * Extract Security Council params for a specific operation by operationId
 *
 * Use this when you need the salt for a specific operation in a multi-operation
 * SC rotation batch. Each operation has its own nonce and therefore its own salt.
 */
export function extractSecurityCouncilParamsForOperation(
  receipt: ethers.providers.TransactionReceipt,
  targetOperationId: string
): SecurityCouncilOperationParams | null {
  const batch = extractAllSecurityCouncilParams(receipt);
  if (!batch) {
    return null;
  }

  return (
    batch.operations.find(
      (op) => op.operationId && addressEquals(op.operationId, targetOperationId)
    ) ?? null
  );
}

/**
 * Extract Security Council params for the last operation in a batch
 *
 * Returns the last operation. Use extractSecurityCouncilParamsForOperation
 * for specific operation lookups.
 */
export function extractSecurityCouncilParams(
  receipt: ethers.providers.TransactionReceipt
): SecurityCouncilOperationParams | null {
  return extractAllSecurityCouncilParams(receipt)?.operations.at(-1) ?? null;
}
