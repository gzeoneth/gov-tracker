/**
 * Cache loading hook for TUI
 */

import { useState, useEffect } from "react";
import type { TrackingCheckpoint, TrackerStats } from "../../../types";
import { readCacheStatus, getBundledCachePath } from "../../../tracker/cache";
import type { CacheData } from "../types";

function computeStats(checkpoints: Map<string, TrackingCheckpoint>): TrackerStats {
  const stats: TrackerStats = {
    total: 0,
    proposals: { total: 0, complete: 0, active: 0, errored: 0 },
    timelocks: { total: 0, complete: 0, active: 0, errored: 0 },
    elections: { total: 0, complete: 0 },
  };

  for (const [, checkpoint] of checkpoints) {
    if (checkpoint.input.type === "discovery") continue;

    stats.total++;
    const stages = checkpoint.cachedData.completedStages ?? [];
    const isComplete = stages.length === 7 && stages.every((s) => s.status === "COMPLETED");
    const hasError = (checkpoint.metadata?.errorCount ?? 0) >= 5;

    const isElection = stages.some((s) => {
      if (s.type === "PROPOSAL_CREATED" && s.data) {
        const data = s.data as { isElection?: boolean };
        return data.isElection === true;
      }
      return false;
    });

    if (checkpoint.input.type === "governor") {
      if (isElection) {
        stats.elections.total++;
        if (isComplete) stats.elections.complete++;
      } else {
        stats.proposals.total++;
        if (isComplete) stats.proposals.complete++;
        else if (hasError) stats.proposals.errored++;
        else stats.proposals.active++;
      }
    } else if (checkpoint.input.type === "timelock") {
      stats.timelocks.total++;
      if (isComplete) stats.timelocks.complete++;
      else if (hasError) stats.timelocks.errored++;
      else stats.timelocks.active++;
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

  const loadCache = async () => {
    setLoading(true);
    setError(null);

    try {
      const path = cachePath ?? getBundledCachePath();
      if (!path) {
        throw new Error("No cache path available. Use --cache or ensure bundled cache exists.");
      }

      const { checkpoints } = await readCacheStatus(path);
      const stats = computeStats(checkpoints);

      setData({ checkpoints, stats });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCache();
  }, [cachePath]);

  return { data, loading, error, reload: loadCache };
}
