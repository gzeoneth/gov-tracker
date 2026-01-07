/**
 * Operation ID utilities
 *
 * Computes operation IDs locally using ethers.js to avoid unnecessary RPC calls.
 * This ensures consistency with the contract's pure functions:
 * keccak256(abi.encode(target, value, data, predecessor, salt))
 */

import { ethers } from "ethers";
import { TimelockBatchParams, TimelockParams } from "../types";
import { addressEquals } from "./chain";

/**
 * Compute operation ID locally
 */
export function hashOperation(params: TimelockParams): string {
  const { target, value, data, predecessor, salt } = params;

  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256", "bytes", "bytes32", "bytes32"],
      [target, value, data, predecessor, salt]
    )
  );
}

/**
 * Compute batch operation ID locally
 */
export function hashOperationBatch(params: TimelockBatchParams): string {
  const { targets, values, payloads, predecessor, salt } = params;

  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
      [targets, values, payloads, predecessor, salt]
    )
  );
}

/**
 * Validate that a salt produces the expected operation ID
 */
export function validateSalt(expectedOperationId: string, params: TimelockParams): boolean {
  const computed = hashOperation(params);
  return addressEquals(computed, expectedOperationId);
}

/**
 * Validate that a salt produces the expected operation ID for a batch
 */
export function validateSaltBatch(
  expectedOperationId: string,
  params: TimelockBatchParams
): boolean {
  const computed = hashOperationBatch(params);
  return addressEquals(computed, expectedOperationId);
}

/**
 * Try salt candidates to find matching salt for an operation
 */
export function tryFindSalt(
  expectedOperationId: string,
  baseParams: Omit<TimelockParams, "salt"> | Omit<TimelockBatchParams, "salt">,
  candidates: string[]
): string | null {
  const isBatch = "targets" in baseParams;

  for (const salt of candidates) {
    const fullParams = { ...baseParams, salt };
    const isValid = isBatch
      ? validateSaltBatch(expectedOperationId, fullParams as TimelockBatchParams)
      : validateSalt(expectedOperationId, fullParams as TimelockParams);

    if (isValid) {
      return salt;
    }
  }
  return null;
}

/**
 * Validate operation parameters and return computed hash with validation status.
 */
export function computeAndValidateOperationHash(
  expectedOperationId: string,
  params: TimelockParams | TimelockBatchParams
): { computedHash: string; isValid: boolean; error?: string } {
  const isBatch = "targets" in params;
  const computed = isBatch
    ? hashOperationBatch(params as TimelockBatchParams)
    : hashOperation(params as TimelockParams);

  const isValid = addressEquals(computed, expectedOperationId);

  return {
    computedHash: computed,
    isValid,
    error: isValid
      ? undefined
      : `Operation hash mismatch: computed ${computed} but expected ${expectedOperationId}. This may indicate incorrect salt or operation parameters.`,
  };
}
