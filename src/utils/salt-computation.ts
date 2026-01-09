/**
 * Salt Computation for Timelock Operations
 *
 * Centralized salt computation logic for different proposal types.
 * Salt is computed during tracking and cached in stage data.
 */

import { ethers, BigNumber } from "ethers";
import { TrackedStage } from "../types";
import { SECURITY_COUNCIL_MANAGER_ABI, timelockInterface } from "../abis";
import { ADDRESSES } from "../constants";
import { queryWithRetry } from "./rpc-utils";

/**
 * Derive salt from a proposal description (Governor pattern)
 *
 * The Governor contract uses `keccak256(bytes(description))` as the salt
 * In Solidity, bytes(string) converts to UTF-8 bytes, which is equivalent to id()
 */
export function saltFromDescription(description: string): string {
  return ethers.utils.id(description);
}

/**
 * Generate salt for a Security Council member update using on-chain contract
 *
 * Calls SecurityCouncilManager.generateSalt() for 100% accuracy.
 *
 * Security Council uses `keccak256(abi.encode(newMembers, nonce))`
 */
export async function generateSecurityCouncilSalt(
  members: string[],
  nonce: BigNumber,
  provider: ethers.providers.Provider
): Promise<string> {
  const manager = new ethers.Contract(
    ADDRESSES.SECURITY_COUNCIL_MANAGER,
    SECURITY_COUNCIL_MANAGER_ABI,
    provider
  );

  // Use contract's generateSalt function for consistency
  return await queryWithRetry(() => manager.generateSalt(members, nonce));
}

/**
 * Decoded L1 timelock schedule call parameters
 */
export type DecodedTimelockSchedule =
  | {
      type: "single";
      target: string;
      value: BigNumber;
      data: string;
      predecessor: string;
      salt: string;
      delay: BigNumber;
    }
  | {
      type: "batch";
      targets: string[];
      values: BigNumber[];
      payloads: string[];
      predecessor: string;
      salt: string;
      delay: BigNumber;
    };

/**
 * Decode L1 timelock schedule call from L2ToL1Tx event data
 *
 * Extracts the actual schedule/scheduleBatch parameters that were sent to L1.
 * This is the ground truth for what was scheduled on L1 timelock.
 *
 * @param l2ToL1TxData - The `data` field from L2ToL1Tx event
 * @returns Decoded schedule parameters or null if not a timelock schedule call
 */
export function decodeL1TimelockSchedule(l2ToL1TxData: string): DecodedTimelockSchedule | null {
  // Try scheduleBatch first, fall back to schedule
  const decodeBatch = (): DecodedTimelockSchedule | null => {
    try {
      const [targets, values, payloads, predecessor, salt, delay] =
        timelockInterface.decodeFunctionData("scheduleBatch", l2ToL1TxData) as [
          string[],
          BigNumber[],
          string[],
          string,
          string,
          BigNumber,
        ];
      return { type: "batch", targets, values, payloads, predecessor, salt, delay };
    } catch {
      return null;
    }
  };

  const decodeSingle = (): DecodedTimelockSchedule | null => {
    try {
      const [target, value, data, predecessor, salt, delay] = timelockInterface.decodeFunctionData(
        "schedule",
        l2ToL1TxData
      ) as [string, BigNumber, string, string, string, BigNumber];
      return { type: "single", target, value, data, predecessor, salt, delay };
    } catch {
      return null;
    }
  };

  return decodeBatch() ?? decodeSingle();
}

/**
 * Compute salt for L2 timelock stage
 *
 * Priority:
 * 1. Security Council: use on-chain generateSalt(members, nonce)
 * 2. Governor: use keccak256(description)
 * 3. Fallback: HashZero
 */
export async function computeL2TimelockSalt(
  stageData: {
    isSecurityCouncilOperation?: boolean;
    securityCouncilMembers?: string[];
    securityCouncilNonce?: string | number | BigNumber;
  },
  allStages?: TrackedStage[],
  provider?: ethers.providers.Provider
): Promise<string> {
  // Priority 1: Security Council operation
  if (
    stageData.isSecurityCouncilOperation &&
    stageData.securityCouncilMembers &&
    stageData.securityCouncilNonce !== undefined &&
    provider
  ) {
    const members = stageData.securityCouncilMembers;
    const nonce = BigNumber.isBigNumber(stageData.securityCouncilNonce)
      ? stageData.securityCouncilNonce
      : BigNumber.from(stageData.securityCouncilNonce);

    // Use on-chain generation for maximum accuracy
    return await generateSecurityCouncilSalt(members, nonce, provider);
  }

  // Priority 2: Governor proposal with description
  if (allStages) {
    const proposalStage = allStages.find((s) => s.type === "PROPOSAL_CREATED");
    if (proposalStage?.data.description) {
      return saltFromDescription(proposalStage.data.description);
    }
  }

  // Priority 3: HashZero fallback
  return ethers.constants.HashZero;
}

/**
 * Compute salt for L1 timelock stage
 *
 * Priority:
 * 1. Decoded from L2→L1 message event (100% accurate - this is the actual salt sent)
 * 2. Fallback: HashZero
 */
export function computeL1TimelockSalt(allStages?: TrackedStage[]): {
  salt: string;
  predecessor?: string;
} {
  if (allStages) {
    const l2ToL1Stage = allStages.find((s) => s.type === "L2_TO_L1_MESSAGE");
    if (l2ToL1Stage?.data.l2ToL1TxEvent) {
      // Decode salt and predecessor from the L2ToL1Tx event data
      const decoded = decodeL1TimelockSchedule(l2ToL1Stage.data.l2ToL1TxEvent.data);
      if (decoded) {
        return {
          salt: decoded.salt,
          predecessor: decoded.predecessor,
        };
      }
    }
  }

  // Fallback
  return { salt: ethers.constants.HashZero };
}
