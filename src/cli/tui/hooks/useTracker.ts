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
  ChunkingConfig,
} from "../../../types/index.js";
import { createTracker, ProposalStageTracker, CHUNK_SIZES } from "../../../index.js";
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

    const tuiConfig = loadConfig();
    const chunkingConfig: ChunkingConfig = {
      l2ChunkSize: tuiConfig.discovery.chunkSize || CHUNK_SIZES.L2,
      l1ChunkSize: CHUNK_SIZES.L1,
      novaChunkSize: tuiConfig.discovery.chunkSize || CHUNK_SIZES.NOVA,
      delayBetweenChunks: CHUNK_SIZES.DELAY_MS,
    };

    return createTracker({
      l1Provider: options.providers.l1Provider,
      l2Provider: options.providers.l2Provider,
      novaProvider: options.providers.novaProvider,
      cachePath: options.cachePath,
      chunkingConfig,
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

      // Load cached watermarks and merge with 60-day default for missing keys
      const cachedWatermarks = await tracker.loadWatermarks();
      const tuiConfig = loadConfig();
      // Clamp defaultDays to valid range: 1-365 (falsy values default to 60)
      const rawDefaultDays = tuiConfig.discovery.defaultDays || 60;
      const defaultDays = Math.max(1, Math.min(365, rawDefaultDays));
      const defaultFromBlock = Math.max(0, toBlock - Math.floor(BLOCKS_PER_DAY_L2 * defaultDays));

      // All required watermark keys
      const requiredKeys = [
        "constitutionalGovernor",
        "nonConstitutionalGovernor",
        "electionNomineeGovernor",
        "electionMemberGovernor",
        "l2ConstitutionalTimelock",
        "l2NonConstitutionalTimelock",
      ] as const;

      // Check if all watermarks are present
      const hasAllWatermarks = requiredKeys.every((key) => cachedWatermarks[key] !== undefined);

      let fromWatermarks: DiscoveryWatermarks | undefined;
      if (!hasAllWatermarks) {
        // Missing watermarks - fill with 60-day default, preserve existing
        setProgress(`Discovering proposals from last ${defaultDays} days...`);
        fromWatermarks = {
          constitutionalGovernor: cachedWatermarks.constitutionalGovernor ?? defaultFromBlock,
          nonConstitutionalGovernor: cachedWatermarks.nonConstitutionalGovernor ?? defaultFromBlock,
          electionNomineeGovernor: cachedWatermarks.electionNomineeGovernor ?? defaultFromBlock,
          electionMemberGovernor: cachedWatermarks.electionMemberGovernor ?? defaultFromBlock,
          l2ConstitutionalTimelock: cachedWatermarks.l2ConstitutionalTimelock ?? defaultFromBlock,
          l2NonConstitutionalTimelock:
            cachedWatermarks.l2NonConstitutionalTimelock ?? defaultFromBlock,
        };
      }

      const { proposals, timelockOps } = await tracker.discoverAll(
        targets,
        toBlock,
        fromWatermarks
      );

      const discoveredCount = proposals.length + timelockOps.length;
      if (discoveredCount === 0) {
        return { proposals: 0, timelocks: 0 };
      }

      setProgress(`Found ${discoveredCount} new items. Tracking...`);
      let tracked = 0;

      for (const proposal of proposals) {
        tracked++;
        setProgress(
          `Tracking ${tracked}/${discoveredCount}: proposal ${proposal.proposalId.slice(0, 8)}...`
        );
        try {
          await tracker.trackByTxHash(proposal.creationTxHash);
        } catch {
          // Continue tracking others even if one fails
        }
      }

      for (const op of timelockOps) {
        tracked++;
        setProgress(
          `Tracking ${tracked}/${discoveredCount}: timelock ${op.operationId.slice(0, 10)}...`
        );
        try {
          await tracker.trackByTxHash(op.scheduledTxHash);
        } catch {
          // Continue tracking others even if one fails
        }
      }

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
