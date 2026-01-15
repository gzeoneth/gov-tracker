/**
 * Live tracking hook for TUI
 *
 * Discovery is delegated to CLI subprocess for simplicity.
 * Individual proposal tracking is done directly for better UX.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type {
  TrackingResult,
  TrackingProgress,
  PreparedTransaction,
  ChunkingConfig,
  TrackingCheckpoint,
} from "../../../types/index.js";
import { createTracker, ProposalStageTracker, CHUNK_SIZES } from "../../../index.js";
import type { ProposalListItem } from "../types.js";
import type { ProviderBundle } from "../../lib/cli.js";
import { loadConfig, type TuiConfig } from "../config.js";
import { useCliProcess } from "./useCliProcess.js";
import { getTxHash } from "../utils/proposal-detail-helpers.js";

function getTxHashFromCheckpoint(checkpoint: TrackingCheckpoint): string {
  const txHash = getTxHash(checkpoint.input);
  if (!txHash) {
    throw new Error(`Cannot track ${checkpoint.input.type} checkpoint`);
  }
  return txHash;
}

interface PrepareResult {
  prepared: PreparedTransaction[];
  errorCount: number;
}

async function prepareExecutableTransactions(
  tracker: ProposalStageTracker,
  result: TrackingResult
): Promise<PrepareResult> {
  const executableStages = result.stages.filter((s) => s.status === "READY" || s.executable);
  const prepared: PreparedTransaction[] = [];
  let errorCount = 0;

  for (const stage of executableStages) {
    try {
      const prep = await tracker.prepareTransaction(stage, { stages: result.stages });
      if (prep.success) {
        prepared.push(prep.prepared);
      }
    } catch {
      errorCount++;
    }
  }

  return { prepared, errorCount };
}

export interface UseTrackerResult {
  isTracking: boolean;
  progress: string | null;
  lastResult: TrackingResult | null;
  preparedTxs: PreparedTransaction[];
  error: string | null;
  canTrack: boolean;
  track: (item: ProposalListItem) => Promise<TrackingResult | null>;
  discover: () => Promise<boolean>;
  discoverElections: () => Promise<boolean>;
  clearError: () => void;
}

export interface UseTrackerOptions {
  providers?: ProviderBundle;
  cachePath: string;
  onDiscoveryComplete?: () => void;
}

function buildCliArgs(config: TuiConfig, cachePath: string): string[] {
  const { rpc, discovery } = config;

  const optionalArgs: [boolean, string, string][] = [
    [!!rpc.l1Url, "--l1-rpc", rpc.l1Url ?? ""],
    [!!rpc.l2Url, "--l2-rpc", rpc.l2Url ?? ""],
    [!!rpc.novaUrl, "--nova-rpc", rpc.novaUrl ?? ""],
    [!!discovery.defaultDays, "--max-age-days", String(discovery.defaultDays ?? "")],
    [!!discovery.startBlock, "--start-block", String(discovery.startBlock ?? "")],
    [!!discovery.chunkSize, "--l2-chunk-size", String(discovery.chunkSize ?? "")],
    [discovery.concurrency > 1, "--concurrency", String(discovery.concurrency)],
  ];

  return [
    "run",
    "--cache",
    cachePath,
    ...optionalArgs.filter(([cond]) => cond).flatMap(([, flag, val]) => [flag, val]),
  ];
}

export function useTracker(options: UseTrackerOptions): UseTrackerResult {
  const [isTracking, setIsTracking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TrackingResult | null>(null);
  const [preparedTxs, setPreparedTxs] = useState<PreparedTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isTrackingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        const txHash = getTxHashFromCheckpoint(item.checkpoint);
        const results = await tracker.trackByTxHash(txHash);
        const result = results[0] ?? null;

        if (!mountedRef.current) return null;
        setLastResult(result);

        if (result) {
          const { prepared, errorCount } = await prepareExecutableTransactions(tracker, result);
          setPreparedTxs(prepared);
          if (errorCount > 0 && prepared.length === 0) {
            setError(`Failed to prepare ${errorCount} transaction(s)`);
          }
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setError(message);
        }
        return null;
      } finally {
        isTrackingRef.current = false;
        if (mountedRef.current) {
          setIsTracking(false);
          setProgress(null);
        }
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
    if (mountedRef.current) {
      setIsTracking(false);
      if (!result.success) {
        setError(result.error ?? "Discovery failed");
      }
    }

    if (result.success) {
      options.onDiscoveryComplete?.();
      return true;
    }
    return false;
  }, [cliProcess, options]);

  // Discover elections via CLI subprocess (always from governance start block)
  const discoverElections = useCallback(async (): Promise<boolean> => {
    if (cliProcess.isRunning || isTrackingRef.current) {
      return false;
    }

    const config = loadConfig();

    const hasRpcConfig = config.rpc.l1Url || config.rpc.l2Url || options.providers;
    if (!hasRpcConfig) {
      setError("No RPC URLs configured. Use Settings (S) to configure or pass --l2-rpc.");
      return false;
    }

    isTrackingRef.current = true;
    setIsTracking(true);
    setError(null);

    // Build args for election-only discovery from governance start block
    const { rpc } = config;
    const optionalArgs: [boolean, string, string][] = [
      [!!rpc.l1Url, "--l1-rpc", rpc.l1Url ?? ""],
      [!!rpc.l2Url, "--l2-rpc", rpc.l2Url ?? ""],
      [!!rpc.novaUrl, "--nova-rpc", rpc.novaUrl ?? ""],
    ];

    // Don't pass --start-block to use cached watermarks for faster incremental discovery
    // Elections are tracked via trackAllElections which doesn't use watermarks directly,
    // but this avoids re-discovering all proposals from scratch
    const args = [
      "run",
      "--cache",
      options.cachePath,
      "--track-elections",
      ...optionalArgs.filter(([cond]) => cond).flatMap(([, flag, val]) => [flag, val]),
    ];

    const result = await cliProcess.run(args);

    isTrackingRef.current = false;
    if (mountedRef.current) {
      setIsTracking(false);
      if (!result.success) {
        setError(result.error ?? "Election discovery failed");
      }
    }

    if (result.success) {
      options.onDiscoveryComplete?.();
      return true;
    }
    return false;
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
    discoverElections,
    clearError,
  };
}
