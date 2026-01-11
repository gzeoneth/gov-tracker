/**
 * Hook for loading Security Council election data
 */

import { useState, useEffect } from "react";
import type { ProviderBundle } from "../../lib/cli.js";
import type { ElectionStatus, ElectionProposalStatus } from "../../../types/index.js";
import { checkElectionStatus, trackElectionProposal } from "../../../election.js";

export interface ElectionData {
  status: ElectionStatus | null;
  proposals: ElectionProposalStatus[];
  loading: boolean;
  error: string | null;
  warning: string | null;
}

const INITIAL_STATE: ElectionData = {
  status: null,
  proposals: [],
  loading: true,
  error: null,
  warning: null,
};

const NO_PROVIDERS_STATE: ElectionData = {
  status: null,
  proposals: [],
  loading: false,
  error: "RPC providers required. Use --l2-rpc and --l1-rpc options.",
  warning: null,
};

export function useElectionData(providers: ProviderBundle | undefined): ElectionData {
  const [data, setData] = useState<ElectionData>(INITIAL_STATE);

  useEffect(() => {
    if (!providers) {
      setData(NO_PROVIDERS_STATE);
      return;
    }

    let cancelled = false;

    async function loadElectionData(): Promise<void> {
      setData((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const status = await checkElectionStatus(providers!.l2Provider, providers!.l1Provider);
        if (cancelled) return;

        const proposals: ElectionProposalStatus[] = [];
        let failedCount = 0;

        if (status.electionCount > 0) {
          const startIndex = Math.max(1, status.electionCount - 2);
          for (let i = status.electionCount; i >= startIndex; i--) {
            if (cancelled) return;
            try {
              const proposal = await trackElectionProposal(
                i,
                providers!.l2Provider,
                providers!.l1Provider
              );
              proposals.push(proposal);
            } catch {
              failedCount++;
            }
          }
        }

        if (cancelled) return;

        setData({
          status,
          proposals,
          loading: false,
          error:
            failedCount > 0 && proposals.length === 0
              ? `Failed to load ${failedCount} election(s)`
              : null,
          warning:
            failedCount > 0 && proposals.length > 0
              ? `Loaded ${proposals.length} election(s), ${failedCount} failed`
              : null,
        });
      } catch (err) {
        if (cancelled) return;
        setData({
          status: null,
          proposals: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          warning: null,
        });
      }
    }

    loadElectionData();

    return () => {
      cancelled = true;
    };
  }, [providers]);

  return data;
}
