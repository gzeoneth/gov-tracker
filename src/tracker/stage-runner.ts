/**
 * Generic Stage Runner
 *
 * Provides a declarative pipeline runner that:
 * - Handles cache checks automatically
 * - Runs stages in sequence
 * - Stops on incomplete stages
 * - Supports pipeline composition (governor → timelock, election → timelock)
 */

import { loggers } from "../utils/logger";
import { StageType, TrackedStage, chainToChainId } from "../types";
import { TrackingState, addStage, getCompletedStage, getCachedStage } from "./state";
import { getChainForStage } from "../stages/utils";

const { pipeline: log } = loggers;

/**
 * Result from a stage tracker.
 */
export interface StageResult {
  /** Updated state with new stage */
  state: TrackingState;
  /** Whether to continue to next stage */
  continue: boolean;
}

/**
 * A stage tracker function.
 * Returns updated state and whether to continue pipeline.
 */
export type StageTracker = (state: TrackingState) => Promise<StageResult>;

/**
 * Stage configuration for declarative pipeline.
 */
export interface StageConfig {
  /** Stage type for cache lookup */
  type: StageType;
  /** The tracking function */
  track: StageTracker;
  /**
   * Optional: custom cache check.
   * By default, uses getCompletedStage.
   * Return undefined to fall through to track().
   */
  checkCache?: (state: TrackingState) => Promise<StageResult | undefined>;
}

/**
 * Run a single stage with automatic cache check.
 */
export async function runStage(state: TrackingState, config: StageConfig): Promise<StageResult> {
  // Custom cache check
  if (config.checkCache) {
    const cached = await config.checkCache(state);
    if (cached) return cached;
  } else {
    // Default cache check
    const cached = getCompletedStage(state, config.type);
    if (cached) {
      log("%s: cached", config.type);
      return { state: await addStage(state, cached), continue: true };
    }
  }

  // Run tracker
  return config.track(state);
}

/**
 * Run a pipeline of stages.
 * Stops when a stage returns continue=false.
 */
export async function runPipeline(
  state: TrackingState,
  stages: StageConfig[]
): Promise<TrackingState> {
  for (const config of stages) {
    const result = await runStage(state, config);
    state = result.state;
    if (!result.continue) break;
  }
  return state;
}

/**
 * Helper: create placeholder stage for skipped/not-started stages.
 */
export function placeholder(
  type: StageType,
  status: "NOT_STARTED" | "SKIPPED",
  reason: string
): TrackedStage {
  const chain = getChainForStage(type);
  return {
    type,
    status,
    chain,
    chainId: chainToChainId(chain) ?? 0,
    transactions: [],
    data: { reason },
  } as TrackedStage;
}

/**
 * Helper: add placeholder stages for remaining pipeline stages.
 */
export async function addPlaceholders(
  state: TrackingState,
  types: StageType[],
  status: "NOT_STARTED" | "SKIPPED",
  reason: string
): Promise<TrackingState> {
  for (const type of types) {
    state = await addStage(state, placeholder(type, status, reason));
  }
  return state;
}

/**
 * Helper: get cached stage with any status (for fast-path checks).
 */
export { getCachedStage };
