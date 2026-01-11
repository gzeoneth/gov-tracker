/**
 * Live tracking hook for TUI
 *
 * Discovery is delegated to CLI subprocess for simplicity.
 * Individual proposal tracking is done directly for better UX.
 */

import { useState, useCallback, useRef, useMemo } from "react";
import type {
  TrackingResult,
  TrackingProgress,
  PreparedTransaction,
  ChunkingConfig,
} from "../../../types/index.js";
import { createTracker, ProposalStageTracker, CHUNK_SIZES } from "../../../index.js";
import type { ProposalListItem } from "../types.js";
import type { ProviderBundle } from "../../lib/cli.js";
import { loadConfig, type TuiConfig } from "../config.js";
import { useCliProcess } from "./useCliProcess.js";

export interface UseTrackerResult {
  isTracking: boolean;
  progress: string | null;
  lastResult: TrackingResult | null;
  preparedTxs: PreparedTransaction[];
  error: string | null;
  canTrack: boolean;
  track: (item: ProposalListItem) => Promise<TrackingResult | null>;
  discover: () => Promise<boolean>;
  clearError: () => void;
}

export interface UseTrackerOptions {
  providers?: ProviderBundle;
  cachePath: string;
  onDiscoveryComplete?: () => void;
}

function buildCliArgs(config: TuiConfig, cachePath: string): string[] {
  const args = ["run", "--cache", cachePath];

  // RPC URLs from config
  if (config.rpc.l1Url) args.push("--l1-rpc", config.rpc.l1Url);
  if (config.rpc.l2Url) args.push("--l2-rpc", config.rpc.l2Url);
  if (config.rpc.novaUrl) args.push("--nova-rpc", config.rpc.novaUrl);

  // Discovery settings
  if (config.discovery.defaultDays) {
    args.push("--max-age-days", config.discovery.defaultDays.toString());
  }
  if (config.discovery.startBlock) {
    args.push("--start-block", config.discovery.startBlock.toString());
  }
  if (config.discovery.chunkSize) {
    args.push("--l2-chunk-size", config.discovery.chunkSize.toString());
  }
  if (config.discovery.concurrency > 1) {
    args.push("--concurrency", config.discovery.concurrency.toString());
  }

  return args;
}

export function useTracker(options: UseTrackerOptions): UseTrackerResult {
  const [isTracking, setIsTracking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TrackingResult | null>(null);
  const [preparedTxs, setPreparedTxs] = useState<PreparedTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isTrackingRef = useRef(false);

  const cliProcess = useCliProcess();

  // Check if RPC is configured (either via providers or config)
  // Memoized to avoid re-reading config file on every render
  const canTrack = useMemo(() => {
    if (options.providers) return true;
    const config = loadConfig();
    return !!(config.rpc.l1Url || config.rpc.l2Url);
  }, [options.providers]);

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

  // Track a single proposal (used in ProposalDetail view)
  const track = useCallback(
    async (item: ProposalListItem): Promise<TrackingResult | null> => {
      if (isTrackingRef.current) {
        return null;
      }

      if (!options.providers) {
        setError("No RPC providers configured. Use --l2-rpc and --l1-rpc options.");
        return null;
      }

      const tracker = createTrackerInstance();
      if (!tracker) return null;

      isTrackingRef.current = true;
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
          let prepErrors = 0;
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
                prepErrors++;
              }
            }
          }
          setPreparedTxs(prepared);
          if (prepErrors > 0 && prepared.length === 0) {
            setError(`Failed to prepare ${prepErrors} transaction(s)`);
          }
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        isTrackingRef.current = false;
        setIsTracking(false);
        setProgress(null);
      }
    },
    [options.providers, createTrackerInstance]
  );

  // Discover new proposals via CLI subprocess
  const discover = useCallback(async (): Promise<boolean> => {
    if (cliProcess.isRunning || isTrackingRef.current) {
      return false;
    }

    const config = loadConfig();

    // Check if we have RPC URLs configured
    const hasRpcConfig = config.rpc.l1Url || config.rpc.l2Url || options.providers;
    if (!hasRpcConfig) {
      setError("No RPC URLs configured. Use Settings (S) to configure or pass --l2-rpc.");
      return false;
    }

    isTrackingRef.current = true;
    setIsTracking(true);
    setError(null);

    const args = buildCliArgs(config, options.cachePath);
    const result = await cliProcess.run(args);

    isTrackingRef.current = false;
    setIsTracking(false);

    if (result.success) {
      options.onDiscoveryComplete?.();
      return true;
    } else {
      setError(result.error ?? "Discovery failed");
      return false;
    }
  }, [cliProcess, options]);

  // Sync progress from CLI process
  const combinedProgress = cliProcess.progress ?? progress;
  const combinedError = cliProcess.error ?? error;
  const combinedIsTracking = cliProcess.isRunning || isTracking;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isTracking: combinedIsTracking,
    progress: combinedProgress,
    lastResult,
    preparedTxs,
    error: combinedError,
    canTrack,
    track,
    discover,
    clearError,
  };
}
