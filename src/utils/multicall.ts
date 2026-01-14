/**
 * Multicall utilities for batching L2 RPC calls
 *
 * Wraps @arbitrum/sdk's MultiCaller to batch multiple contract calls into a single RPC request.
 * Only use for L2 calls - L1 RPCs are typically rate-limited and don't benefit as much.
 */

import { ethers } from "ethers";
import { MultiCaller, CallInput } from "@arbitrum/sdk";
import { loggers } from "./logger";

const log = loggers.rpc;

/**
 * Create a MultiCaller instance for the given provider
 *
 * Uses the SDK's address resolution to find the correct Multicall2 contract.
 */
export async function getMultiCaller(provider: ethers.providers.Provider): Promise<MultiCaller> {
  return MultiCaller.fromProvider(provider);
}

/**
 * Build a CallInput for a contract method call
 *
 * @example
 * ```typescript
 * const input = buildCallInput(
 *   timelockAddress,
 *   timelockInterface,
 *   "isOperationReady",
 *   [operationId]
 * );
 * ```
 */
export function buildCallInput<T>(
  targetAddr: string,
  iface: ethers.utils.Interface,
  method: string,
  args: unknown[] = []
): CallInput<T> {
  return {
    targetAddr,
    encoder: () => iface.encodeFunctionData(method, args),
    decoder: (returnData: string): T => {
      const result = iface.decodeFunctionResult(method, returnData);
      return result[0] as T;
    },
  };
}

/**
 * Execute multiple calls in a single RPC request
 *
 * @param provider - L2 provider (Arbitrum One/Nova)
 * @param calls - Array of CallInput objects
 * @param requireSuccess - If true, reverts if any call fails. If false, failed calls return undefined.
 * @returns Array of results in the same order as inputs
 *
 * @example
 * ```typescript
 * const timelockIface = new ethers.utils.Interface(TIMELOCK_ABI);
 *
 * const [isReady, isDone, timestamp] = await multicall(provider, [
 *   buildCallInput(timelockAddr, timelockIface, "isOperationReady", [opId]),
 *   buildCallInput(timelockAddr, timelockIface, "isOperationDone", [opId]),
 *   buildCallInput(timelockAddr, timelockIface, "getTimestamp", [opId]),
 * ]);
 * ```
 */
export async function multicall<T extends CallInput<unknown>[]>(
  provider: ethers.providers.Provider,
  calls: [...T],
  requireSuccess: boolean = false
): Promise<{ [K in keyof T]: T[K] extends CallInput<infer U> ? U | undefined : never }> {
  if (calls.length === 0) {
    return [] as { [K in keyof T]: T[K] extends CallInput<infer U> ? U | undefined : never };
  }

  log("multicall: batching %d calls", calls.length);

  const multiCaller = await getMultiCaller(provider);
  const results = await multiCaller.multiCall(calls, requireSuccess);

  log("multicall: completed %d calls", calls.length);

  return results as { [K in keyof T]: T[K] extends CallInput<infer U> ? U | undefined : never };
}

/**
 * Cached MultiCaller instance per provider to avoid repeated address lookups
 */
const multiCallerCache = new WeakMap<ethers.providers.Provider, MultiCaller>();

/**
 * Get or create a cached MultiCaller instance
 *
 * Use this when making multiple multicall batches with the same provider
 * to avoid repeated address resolution.
 */
export async function getCachedMultiCaller(
  provider: ethers.providers.Provider
): Promise<MultiCaller> {
  let cached = multiCallerCache.get(provider);
  if (!cached) {
    cached = await MultiCaller.fromProvider(provider);
    multiCallerCache.set(provider, cached);
  }
  return cached;
}

/**
 * Execute multiple calls using a cached MultiCaller instance
 *
 * More efficient when making multiple batches with the same provider.
 */
export async function multicallCached<T extends CallInput<unknown>[]>(
  provider: ethers.providers.Provider,
  calls: [...T],
  requireSuccess: boolean = false
): Promise<{ [K in keyof T]: T[K] extends CallInput<infer U> ? U | undefined : never }> {
  if (calls.length === 0) {
    return [] as { [K in keyof T]: T[K] extends CallInput<infer U> ? U | undefined : never };
  }

  log("multicall: batching %d calls (cached)", calls.length);

  const multiCaller = await getCachedMultiCaller(provider);
  const results = await multiCaller.multiCall(calls, requireSuccess);

  log("multicall: completed %d calls", calls.length);

  return results as { [K in keyof T]: T[K] extends CallInput<infer U> ? U | undefined : never };
}

export { CallInput } from "@arbitrum/sdk";
