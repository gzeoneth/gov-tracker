/**
 * Hook for loading Security Council election data from cache
 *
 * Reads election checkpoints from cache without RPC calls.
 * Run `yarn cli run --track-elections` to populate the cache first.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ElectionStatus,
  ElectionProposalStatus,
  TrackingCheckpoint,
} from "../../../types/index.js";
import { readCacheStatus, getBundledCachePath } from "../../../tracker/cache.js";
import { getErrorMessage } from "../../../utils/rpc-utils.js";
import { formatDurationSec } from "../utils/index.js";

export interface ElectionData {
  status: ElectionStatus | null;
  proposals: ElectionProposalStatus[];
  loading: boolean;
  error: string | null;
  warning: string | null;
}

export interface UseElectionDataOptions {
  cachePath?: string;
}

const INITIAL_STATE: ElectionData = {
  status: null,
  proposals: [],
  loading: true,
  error: null,
  warning: null,
};

function extractElectionStatus(checkpoint: TrackingCheckpoint): ElectionProposalStatus | null {
  return checkpoint.cachedData?.electionStatus ?? null;
}

export interface UseElectionDataResult extends ElectionData {
  reload: () => Promise<void>;
}

export function useElectionData(options?: UseElectionDataOptions): UseElectionDataResult {
  const [data, setData] = useState<ElectionData>(INITIAL_STATE);
  const mountedRef = useRef(true);

  const { cachePath } = options ?? {};

  const loadFromCache = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const path = cachePath ?? getBundledCachePath();
      if (!path) {
        setData({
          status: null,
          proposals: [],
          loading: false,
          error: "No cache path available. Run `yarn cli run --track-elections` first.",
          warning: null,
        });
        return;
      }

      const { elections } = await readCacheStatus(path);

      if (!mountedRef.current) return;

      if (elections.size === 0) {
        setData({
          status: null,
          proposals: [],
          loading: false,
          error: null,
          warning: null,
        });
        return;
      }

      // Extract ElectionProposalStatus from checkpoints, sorted by index descending
      const sortedIndices = Array.from(elections.keys()).sort((a, b) => b - a);
      const proposals: ElectionProposalStatus[] = [];
      let nextElectionCheckpoint: { createdAt: number; secondsUntilElection: number } | null = null;

      for (const index of sortedIndices) {
        const checkpoint = elections.get(index);
        if (checkpoint) {
          const status = extractElectionStatus(checkpoint);
          if (status) {
            proposals.push(status);
            // Check if this is the "next" election with timing info
            if (status.secondsUntilElection && status.secondsUntilElection > 0) {
              nextElectionCheckpoint = {
                createdAt: checkpoint.createdAt,
                secondsUntilElection: status.secondsUntilElection,
              };
            }
          }
        }
      }

      // Derive minimal ElectionStatus from cached data
      const electionCount = sortedIndices.length > 0 ? Math.max(...sortedIndices) + 1 : 0;
      const latestElection = proposals.at(0);

      // Calculate nextElectionTimestamp from cached data if available
      let nextElectionTimestamp = 0;
      let timeUntilElection = "unknown";
      let canCreateElection = latestElection?.canCreateElection ?? false;

      if (nextElectionCheckpoint) {
        // Calculate based on when the cache was created + seconds until election at that time
        const cacheTimeSec = Math.floor(nextElectionCheckpoint.createdAt / 1000);
        nextElectionTimestamp = cacheTimeSec + nextElectionCheckpoint.secondsUntilElection;
        const nowSec = Math.floor(Date.now() / 1000);
        const remainingSec = Math.max(0, nextElectionTimestamp - nowSec);

        if (remainingSec <= 0) {
          canCreateElection = true;
          timeUntilElection = "ready";
        } else {
          timeUntilElection = formatDurationSec(remainingSec);
        }
      }

      const derivedStatus: ElectionStatus = {
        electionCount,
        cohort: latestElection?.cohort ?? 0,
        nextElectionTimestamp,
        currentL1Timestamp: Math.floor(Date.now() / 1000),
        canCreateElection,
        timeUntilElection,
        secondsUntilElection: Math.max(0, nextElectionTimestamp - Math.floor(Date.now() / 1000)),
      };

      setData({
        status: derivedStatus,
        proposals,
        loading: false,
        error: null,
        warning: null,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setData({
        status: null,
        proposals: [],
        loading: false,
        error: getErrorMessage(err),
        warning: null,
      });
    }
  }, [cachePath]);

  useEffect(() => {
    mountedRef.current = true;
    void loadFromCache();
    return () => {
      mountedRef.current = false;
    };
  }, [loadFromCache]);

  return { ...data, reload: loadFromCache };
}
