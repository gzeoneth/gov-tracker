/**
 * Live tracking hook for TUI
 *
 * Provides tracking functionality when RPC providers are available.
 */

import { useState, useCallback } from "react";
import type {
  TrackingResult,
  TrackingProgress,
  PreparedTransaction,
  DiscoveryWatermarks,
} from "../../../types/index.js";
import { createTracker, ProposalStageTracker } from "../../../tracker.js";
import type { ProposalListItem } from "../types.js";
import type { ProviderBundle } from "../../lib/cli.js";
import { loadConfig } from "../config.js";

const BLOCKS_PER_DAY_L2 = (24 * 60 * 60) / 0.25; // ~345,600 blocks/day on Arbitrum

export interface UseTrackerResult {
  isTracking: boolean;
  progress: string | null;
  lastResult: TrackingResult | null;
  preparedTxs: PreparedTransaction[];
  error: string | null;
  canTrack: boolean;
  track: (item: ProposalListItem) => Promise<TrackingResult | null>;
  discover: () => Promise<{ proposals: number; timelocks: number }>;
  clearError: () => void;
}

export interface UseTrackerOptions {
  providers?: ProviderBundle;
  cachePath: string;
}

export function useTracker(options: UseTrackerOptions): UseTrackerResult {
  const [isTracking, setIsTracking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TrackingResult | null>(null);
  const [preparedTxs, setPreparedTxs] = useState<PreparedTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canTrack = !!options.providers;

  const createTrackerInstance = useCallback((): ProposalStageTracker | null => {
    if (!options.providers) return null;

    return createTracker({
      l1Provider: options.providers.l1Provider,
      l2Provider: options.providers.l2Provider,
      novaProvider: options.providers.novaProvider,
      cachePath: options.cachePath,
      onProgress: (prog: TrackingProgress) => {
        const { stage, currentIndex, totalStages } = prog;
        setProgress(`[${currentIndex + 1}/${totalStages}] ${stage.type}: ${stage.status}`);
      },
    });
  }, [options.providers, options.cachePath]);

  const track = useCallback(
    async (item: ProposalListItem): Promise<TrackingResult | null> => {
      if (!canTrack) {
        setError("No RPC providers configured. Use --l2-rpc and --l1-rpc options.");
        return null;
      }

      const tracker = createTrackerInstance();
      if (!tracker) return null;

      setIsTracking(true);
      setProgress("Starting...");
      setError(null);
      setPreparedTxs([]);

      try {
        let txHash: string;
        if (item.checkpoint.input.type === "governor") {
          txHash = item.checkpoint.input.creationTxHash;
        } else if (item.checkpoint.input.type === "timelock") {
          txHash = item.checkpoint.input.scheduledTxHash;
        } else {
          throw new Error("Cannot track discovery checkpoint");
        }

        const results = await tracker.trackByTxHash(txHash);
        const result = results[0] ?? null;
        setLastResult(result);

        if (result) {
          const prepared: PreparedTransaction[] = [];
          for (const stage of result.stages) {
            if (stage.status === "READY" || stage.executable) {
              try {
                const prep = await tracker.prepareTransaction(stage, {
                  stages: result.stages,
                });
                if (prep.success) {
                  prepared.push(prep.prepared);
                }
              } catch {
                // Skip stages that can't be prepared
              }
            }
          }
          setPreparedTxs(prepared);
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        setIsTracking(false);
        setProgress(null);
      }
    },
    [canTrack, createTrackerInstance]
  );

  const discover = useCallback(async (): Promise<{ proposals: number; timelocks: number }> => {
    if (!canTrack || !options.providers) {
      setError("No RPC providers configured. Use --l2-rpc and --l1-rpc options.");
      return { proposals: 0, timelocks: 0 };
    }

    const tracker = createTrackerInstance();
    if (!tracker) return { proposals: 0, timelocks: 0 };

    setIsTracking(true);
    setProgress("Discovering new proposals...");
    setError(null);

    try {
      const toBlock = await options.providers.l2Provider.getBlockNumber();
      const { buildDefaultTargets } = await import("../../../constants");
      const targets = buildDefaultTargets();

      // Check if we have cached watermarks, otherwise use 60-day default
      const cachedWatermarks = await tracker.loadWatermarks();
      const hasWatermarks = Object.keys(cachedWatermarks).length > 0;

      let fromWatermarks: DiscoveryWatermarks | undefined;
      if (!hasWatermarks) {
        // No cache - use configured default days (default: 60)
        const tuiConfig = loadConfig();
        const defaultDays = tuiConfig.discovery.defaultDays || 60;
        const defaultFromBlock = Math.max(0, toBlock - Math.floor(BLOCKS_PER_DAY_L2 * defaultDays));
        setProgress(`Discovering proposals from last ${defaultDays} days...`);
        fromWatermarks = {
          constitutionalGovernor: defaultFromBlock,
          nonConstitutionalGovernor: defaultFromBlock,
          electionNomineeGovernor: defaultFromBlock,
          electionMemberGovernor: defaultFromBlock,
          l2ConstitutionalTimelock: defaultFromBlock,
          l2NonConstitutionalTimelock: defaultFromBlock,
        };
      }

      const { proposals, timelockOps } = await tracker.discoverAll(
        targets,
        toBlock,
        fromWatermarks
      );
      return { proposals: proposals.length, timelocks: timelockOps.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return { proposals: 0, timelocks: 0 };
    } finally {
      setIsTracking(false);
      setProgress(null);
    }
  }, [canTrack, createTrackerInstance, options.providers]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isTracking,
    progress,
    lastResult,
    preparedTxs,
    error,
    canTrack,
    track,
    discover,
    clearError,
  };
}
