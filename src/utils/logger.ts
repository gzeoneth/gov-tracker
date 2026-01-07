/**
 * Centralized debug loggers for the SDK
 *
 * Two types of loggers:
 * 1. Regular loggers - for code that runs sequentially
 * 2. Scoped loggers - for code that runs concurrently (auto-prefix with scope)
 *
 * Usage:
 *   import { loggers, withScope } from "../utils/logger";
 *
 *   // Regular logging
 *   loggers.tracker("message %s", value);
 *
 *   // Scoped logging (for concurrent operations)
 *   await withScope("core-gov", async () => {
 *     loggers.discovery("discovering..."); // [core-gov] discovering...
 *   });
 */

import { AsyncLocalStorage } from "async_hooks";
import createDebug from "debug";

// ============================================================================
// Scoped Logging Infrastructure
// ============================================================================

interface LogScope {
  prefix: string;
}

const scopeStorage = new AsyncLocalStorage<LogScope>();

/**
 * Get current scope prefix, or empty string if not in a scope.
 */
export function getCurrentScope(): string {
  return scopeStorage.getStore()?.prefix ?? "";
}

/**
 * Run a function within a logging scope.
 * All scopedLog calls within this function (and nested calls) will
 * automatically include the scope prefix.
 *
 * Scopes can be nested - inner scopes override outer scopes.
 */
export function withScope<T>(prefix: string, fn: () => T): T {
  return scopeStorage.run({ prefix }, fn);
}

/**
 * Create a scoped debug logger.
 * Returns a function that automatically prepends the current scope.
 *
 * Unlike regular debug loggers, the scope is dynamically determined
 * at call time using AsyncLocalStorage.
 */
export function scopedLog(namespace: string): (fmt: string, ...args: unknown[]) => void {
  const baseLog = createDebug(namespace);

  return (fmt: string, ...args: unknown[]) => {
    const scope = getCurrentScope();
    const prefix = scope ? `[${scope}] ` : "";
    baseLog(prefix + fmt, ...args);
  };
}

// ============================================================================
// Pre-configured Loggers
// ============================================================================

/**
 * Pre-configured debug loggers for common namespaces.
 *
 * Scoped loggers (discovery, pipeline, stage.*) automatically include
 * the current scope prefix when used within withScope().
 */
export const loggers = {
  // Scoped loggers - auto-prefix with current scope (tracker ID, governor name, etc.)
  tracker: scopedLog("gov-tracker:tracker"),
  execution: scopedLog("gov-tracker:execution"),
  election: scopedLog("gov-tracker:election"),
  rpc: scopedLog("gov-tracker:rpc"),
  retryables: scopedLog("gov-tracker:retryables"),
  discovery: scopedLog("gov-tracker:discovery"),
  pipeline: scopedLog("gov-tracker:pipeline"),
  stage: {
    timelock: scopedLog("gov-tracker:stage:timelock"),
    l2ToL1: scopedLog("gov-tracker:stage:l2-to-l1-message"),
    proposalQueued: scopedLog("gov-tracker:stage:proposal-queued"),
  },
} as const;
