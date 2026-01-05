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
export class RpcError extends Error {
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
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limiting errors
    if (
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("429")
    ) {
      return true;
    }

    // Server errors
    if (
      message.includes("server error") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    ) {
      return true;
    }

    // Connection errors
    if (
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("network error") ||
      message.includes("timeout")
    ) {
      return true;
    }

    // Provider-specific errors
    if (message.includes("missing response") || message.includes("request failed")) {
      return true;
    }
  }

  return false;
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
