/**
 * Operation ID utilities
 *
 * Uses on-chain timelock contract calls for operation ID computation
 * to ensure consistency with the actual contract behavior.
 */

import { ethers } from "ethers";
import { TimelockBatchParams, TimelockParams } from "../types";
import { queryWithRetry } from "./rpc-utils";
import { TIMELOCK_ABI } from "../abis";
import { addressEquals } from "./chain";

/**
 * Compute operation ID using on-chain timelock contract
 */
export async function hashOperation(
  timelockAddress: string,
  params: TimelockParams,
  provider: ethers.providers.Provider
): Promise<string> {
  const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
  const { target, value, data, predecessor, salt } = params;

  return queryWithRetry(() => timelock.hashOperation(target, value, data, predecessor, salt));
}

/**
 * Compute batch operation ID using on-chain timelock contract
 */
export async function hashOperationBatch(
  timelockAddress: string,
  params: TimelockBatchParams,
  provider: ethers.providers.Provider
): Promise<string> {
  const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
  const { targets, values, payloads, predecessor, salt } = params;

  return queryWithRetry(() =>
    timelock.hashOperationBatch(targets, values, payloads, predecessor, salt)
  );
}

/**
 * Validate that a salt produces the expected operation ID
 */
export async function validateSalt(
  timelockAddress: string,
  expectedOperationId: string,
  params: TimelockParams,
  provider: ethers.providers.Provider
): Promise<boolean> {
  const computed = await hashOperation(timelockAddress, params, provider);
  return addressEquals(computed, expectedOperationId);
}

/**
 * Validate that a salt produces the expected operation ID for a batch
 */
export async function validateSaltBatch(
  timelockAddress: string,
  expectedOperationId: string,
  params: TimelockBatchParams,
  provider: ethers.providers.Provider
): Promise<boolean> {
  const computed = await hashOperationBatch(timelockAddress, params, provider);
  return addressEquals(computed, expectedOperationId);
}

/**
 * Try salt candidates to find matching salt for an operation
 *
 * Supports both single and batch operations.
 */
export async function tryFindSalt(
  timelockAddress: string,
  expectedOperationId: string,
  baseParams: Omit<TimelockParams, "salt"> | Omit<TimelockBatchParams, "salt">,
  candidates: string[],
  provider: ethers.providers.Provider
): Promise<string | null> {
  const isBatch = "targets" in baseParams;

  for (const salt of candidates) {
    const fullParams = { ...baseParams, salt };
    const isValid = isBatch
      ? await validateSaltBatch(
          timelockAddress,
          expectedOperationId,
          fullParams as TimelockBatchParams,
          provider
        )
      : await validateSalt(
          timelockAddress,
          expectedOperationId,
          fullParams as TimelockParams,
          provider
        );
    if (isValid) {
      return salt;
    }
  }
  return null;
}

/**
 * Validate operation parameters and return computed hash with validation status.
 *
 * This is useful for debugging when you want to see the computed hash
 * and whether it matches the expected operation ID.
 *
 * @param timelockAddress - Address of the timelock contract
 * @param expectedOperationId - Expected operation ID to validate against
 * @param params - Operation parameters (single or batch)
 * @param provider - Provider for RPC calls
 * @returns Computed hash and whether it matches expected
 */
export async function computeAndValidateOperationHash(
  timelockAddress: string,
  expectedOperationId: string,
  params: TimelockParams | TimelockBatchParams,
  provider: ethers.providers.Provider
): Promise<{ computedHash: string; isValid: boolean; error?: string }> {
  try {
    const isBatch = "targets" in params;
    const computed = isBatch
      ? await hashOperationBatch(timelockAddress, params as TimelockBatchParams, provider)
      : await hashOperation(timelockAddress, params as TimelockParams, provider);

    const isValid = addressEquals(computed, expectedOperationId);

    return {
      computedHash: computed,
      isValid,
      error: isValid
        ? undefined
        : `Operation hash mismatch: computed ${computed} but expected ${expectedOperationId}. This may indicate incorrect salt or operation parameters.`,
    };
  } catch (err) {
    return {
      computedHash: "",
      isValid: false,
      error: `Failed to compute operation hash: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
