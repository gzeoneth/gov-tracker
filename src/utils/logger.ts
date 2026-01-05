/**
 * Centralized debug loggers for the SDK
 *
 * Two types of loggers:
 * 1. Regular loggers - for code that runs sequentially
 * 2. Scoped loggers - for code that runs concurrently (auto-prefix with scope)
 *
 * Usage:
 *   import { loggers } from "../utils/logger";
 *   import { withScope } from "../utils/scoped-logger";
 *
 *   // Regular logging
 *   loggers.tracker("message %s", value);
 *
 *   // Scoped logging (for concurrent operations)
 *   await withScope("core-gov", async () => {
 *     loggers.discovery("discovering..."); // [core-gov] discovering...
 *   });
 */

import { scopedLog } from "./scoped-logger";

// Re-export scoped logging utilities
export { withScope, getCurrentScope, scopedLog } from "./scoped-logger";

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
