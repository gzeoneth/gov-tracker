/**
 * Cache loading hook for TUI
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { TrackingCheckpoint, TrackerStats, TrackedStage } from "../../../types/index.js";
import { readCacheStatus, getBundledCachePath } from "../../../tracker/cache.js";
import type { CacheData } from "../types.js";

type CategoryStats = { total: number; complete: number; active: number; errored: number };

function isFailed(checkpoint: TrackingCheckpoint): boolean {
  if ((checkpoint.metadata?.errorCount ?? 0) >= 5) return true;
  const stages = checkpoint.cachedData.completedStages ?? [];
  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  const state = (votingStage?.data as { proposalState?: string } | undefined)?.proposalState;
  return state === "Defeated" || state === "Canceled";
}

function isComplete(stages: TrackedStage[]): boolean {
  const lastStage = stages[stages.length - 1];
  return (
    stages.length === 7 && (lastStage?.status === "COMPLETED" || lastStage?.status === "SKIPPED")
  );
}

function isElection(stages: TrackedStage[]): boolean {
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");
  const proposalType = (createdStage?.data as { proposalType?: string } | undefined)?.proposalType;
  return proposalType === "ELECTION_NOMINEE" || proposalType === "ELECTION_MEMBER";
}

function updateCategoryStats(stats: CategoryStats, complete: boolean, failed: boolean): void {
  stats.total++;
  if (complete) stats.complete++;
  else if (failed) stats.errored++;
  else stats.active++;
}

function computeStats(checkpoints: Map<string, TrackingCheckpoint>): TrackerStats {
  const stats: TrackerStats = {
    total: 0,
    proposals: { total: 0, complete: 0, active: 0, errored: 0 },
    timelocks: { total: 0, complete: 0, active: 0, errored: 0 },
    elections: { total: 0, complete: 0 },
  };

  for (const checkpoint of checkpoints.values()) {
    if (checkpoint.input.type === "discovery") continue;
    stats.total++;

    const stages = checkpoint.cachedData.completedStages ?? [];
    const complete = isComplete(stages);
    const failed = isFailed(checkpoint);

    if (checkpoint.input.type === "governor") {
      if (isElection(stages)) {
        stats.elections.total++;
        if (complete) stats.elections.complete++;
      } else {
        updateCategoryStats(stats.proposals, complete, failed);
      }
    } else if (checkpoint.input.type === "timelock") {
      updateCategoryStats(stats.timelocks, complete, failed);
    }
  }

  return stats;
}

export interface UseCacheResult {
  data: CacheData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useCache(cachePath?: string): UseCacheResult {
  const [data, setData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const mountedRef = useRef(true);

  const loadCache = useCallback(async () => {
    const version = ++versionRef.current;

    setLoading(true);
    setError(null);

    try {
      const path = cachePath ?? getBundledCachePath();
      if (!path) {
        throw new Error("No cache path available. Use --cache or ensure bundled cache exists.");
      }

      const { checkpoints } = await readCacheStatus(path);

      // Skip if superseded by newer request or unmounted
      if (version !== versionRef.current || !mountedRef.current) return;

      const stats = computeStats(checkpoints);
      setData({ checkpoints, stats });
    } catch (err) {
      if (version !== versionRef.current || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (version === versionRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [cachePath]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCache();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCache]);

  return { data, loading, error, reload: loadCache };
}
