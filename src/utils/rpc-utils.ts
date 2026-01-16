/**
 * RPC utilities with retry logic and rate limiting
 */

import { RetryConfig } from "../types";
import { DEFAULT_RETRY_CONFIG } from "../constants";
import { loggers } from "./logger";

const log = loggers.rpc;

/**
 * Delay for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Error type for RPC failures
 */
class RpcError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "RpcError";
  }
}

/**
 * Check if an error is a permanent failure that should NOT be retried.
 * These are errors where retrying will never succeed.
 */
export function isPermanentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Contract execution failures - will always fail
  if (
    message.includes("execution reverted") ||
    message.includes("call revert exception") ||
    message.includes("transaction reverted")
  ) {
    return true;
  }

  // Invalid request parameters - retrying won't help
  if (
    message.includes("invalid argument") ||
    message.includes("invalid params") ||
    message.includes("invalid method") ||
    message.includes("method not found") ||
    message.includes("invalid address") ||
    message.includes("invalid block") ||
    message.includes("ens name not configured")
  ) {
    return true;
  }

  // Data decoding errors - the response won't change
  if (
    message.includes("could not decode") ||
    message.includes("data out-of-bounds") ||
    message.includes("invalid data for function")
  ) {
    return true;
  }

  // Resource doesn't exist
  if (
    message.includes("no contract code") ||
    message.includes("contract not deployed") ||
    message.includes("function selector was not recognized")
  ) {
    return true;
  }

  return false;
}

/**
 * Check if an error is retryable (transient failure).
 * Uses inverted logic: retry everything except known permanent failures.
 */
export function isRetryableError(error: unknown): boolean {
  return !isPermanentError(error);
}

/**
 * Check if an error is a gas estimation error.
 * Gas estimation errors should not count against consecutive error tracking
 * because they are often temporary (insufficient funds, contract state changes, etc.)
 * and should be retried in the next run.
 */
export function isGasEstimationError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("gas required exceeds") ||
    message.includes("execution reverted") ||
    message.includes("out of gas") ||
    message.includes("intrinsic gas too low") ||
    message.includes("insufficient funds for gas") ||
    message.includes("cannot estimate gas") ||
    message.includes("gas estimation") ||
    message.includes("transaction may fail") ||
    message.includes("gas limit") ||
    message.includes("revert")
  );
}

/**
 * Query with retry and exponential backoff
 *
 * @example
 * ```typescript
 * const result = await queryWithRetry(() => provider.getBlockNumber());
 * ```
 */
export async function queryWithRetry<T>(
  queryFn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let retryDelay = config.initialDelay;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        const code = (error as { code?: string | number })?.code?.toString();
        log("query failed (non-retryable): %s", lastError.message);
        throw new RpcError(`RPC query failed: ${lastError.message}`, code, lastError);
      }

      // Don't retry on last attempt
      if (attempt < config.maxRetries) {
        log(
          "retry attempt %d/%d after %dms: %s",
          attempt + 1,
          config.maxRetries,
          retryDelay,
          lastError.message
        );
        await delay(retryDelay);
        retryDelay = Math.min(retryDelay * config.backoffMultiplier, config.maxDelay);
      }
    }
  }

  log("all %d retries exhausted: %s", config.maxRetries + 1, lastError?.message);
  throw new RpcError(
    `All ${config.maxRetries + 1} retry attempts failed: ${lastError?.message ?? "Unknown error"}`,
    undefined,
    lastError
  );
}
