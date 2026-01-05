/**
 * Scoped Logger using AsyncLocalStorage
 *
 * Provides automatic context prefixing for concurrent operations.
 * All log calls within a scope automatically include the scope prefix.
 *
 * Usage:
 *   import { withScope, scopedLog } from "./scoped-logger";
 *
 *   // Create scoped logger
 *   const log = scopedLog("gov-tracker:discovery");
 *
 *   // Run with scope - all nested logs get the prefix
 *   await withScope("core-gov", async () => {
 *     log("discovering..."); // outputs: [core-gov] discovering...
 *     await nestedFunction(); // nested calls also get prefix
 *   });
 */

import { AsyncLocalStorage } from "async_hooks";
import createDebug from "debug";

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

/**
 * Create multiple scoped loggers for common namespaces.
 */
export function createScopedLoggers<K extends string>(
  namespaces: Record<K, string>
): Record<K, (fmt: string, ...args: unknown[]) => void> {
  const loggers = {} as Record<K, (fmt: string, ...args: unknown[]) => void>;
  for (const [key, ns] of Object.entries(namespaces) as [K, string][]) {
    loggers[key] = scopedLog(ns);
  }
  return loggers;
}
