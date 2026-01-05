/**
 * Error Classification Utilities
 *
 * Classifies errors for better error handling and tracking.
 */

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
