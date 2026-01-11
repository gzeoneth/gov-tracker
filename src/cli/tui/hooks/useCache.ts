/**
 * Cache loading hook for TUI
 */

import { useState, useEffect } from "react";
import type { TrackingCheckpoint, TrackerStats } from "../../../types/index.js";
import { readCacheStatus, getBundledCachePath } from "../../../tracker/cache.js";
import type { CacheData } from "../types.js";

interface VotingData {
  proposalState?: string;
}

function isDefeatedOrCanceled(checkpoint: TrackingCheckpoint): boolean {
  const stages = checkpoint.cachedData.completedStages ?? [];
  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  if (!votingStage?.data) return false;
  const votingData = votingStage.data as VotingData;
  return votingData.proposalState === "Defeated" || votingData.proposalState === "Canceled";
}

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
    const lastStage = stages[stages.length - 1];
    const isComplete =
      stages.length === 7 && (lastStage?.status === "COMPLETED" || lastStage?.status === "SKIPPED");
    const hasError = (checkpoint.metadata?.errorCount ?? 0) >= 5;
    const isFailed = hasError || isDefeatedOrCanceled(checkpoint);

    const isElection = stages.some((s) => {
      if (s.type === "PROPOSAL_CREATED" && s.data) {
        const data = s.data as { proposalType?: string };
        return data.proposalType === "ELECTION_NOMINEE" || data.proposalType === "ELECTION_MEMBER";
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
        else if (isFailed) stats.proposals.errored++;
        else stats.proposals.active++;
      }
    } else if (checkpoint.input.type === "timelock") {
      stats.timelocks.total++;
      if (isComplete) stats.timelocks.complete++;
      else if (isFailed) stats.timelocks.errored++;
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

  const loadCache = async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);

    try {
      const path = cachePath ?? getBundledCachePath();
      if (!path) {
        throw new Error("No cache path available. Use --cache or ensure bundled cache exists.");
      }

      const { checkpoints } = await readCacheStatus(path);

      if (signal?.cancelled) return;

      const stats = computeStats(checkpoints);
      setData({ checkpoints, stats });
    } catch (err) {
      if (signal?.cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.cancelled) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const signal = { cancelled: false };
    loadCache(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [cachePath]);

  const reload = async () => loadCache();

  return { data, loading, error, reload };
}
