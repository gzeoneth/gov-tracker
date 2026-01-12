/**
 * Hook for loading detailed election data (contenders, nominees, members)
 */

import { useState, useEffect, useCallback } from "react";
import type { ProviderBundle } from "../../lib/cli.js";
import type { NomineeElectionDetails, MemberElectionDetails } from "../../../types/index.js";
import { getNomineeElectionDetails, getMemberElectionDetails } from "../../../election.js";

export interface ElectionDetails {
  nomineeDetails: NomineeElectionDetails | null;
  memberDetails: MemberElectionDetails | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: ElectionDetails = {
  nomineeDetails: null,
  memberDetails: null,
  loading: false,
  error: null,
};

export interface UseElectionDetailsResult {
  details: ElectionDetails;
  loadDetails: (electionIndex: number) => void;
  clearDetails: () => void;
}

export function useElectionDetails(
  providers: ProviderBundle | undefined
): UseElectionDetailsResult {
  const [details, setDetails] = useState<ElectionDetails>(INITIAL_STATE);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  const loadDetails = useCallback((electionIndex: number) => {
    setCurrentIndex(electionIndex);
    setDetails((prev) => ({ ...prev, loading: true, error: null }));
  }, []);

  const clearDetails = useCallback(() => {
    setCurrentIndex(null);
    setDetails(INITIAL_STATE);
  }, []);

  useEffect(() => {
    if (currentIndex === null || !providers) {
      return;
    }

    let cancelled = false;
    const { l2Provider } = providers;
    const index = currentIndex;

    Promise.all([
      getNomineeElectionDetails(index, l2Provider).catch(() => null),
      getMemberElectionDetails(index, l2Provider).catch(() => null),
    ]).then(([nomineeDetails, memberDetails]) => {
      if (cancelled) return;
      setDetails({ nomineeDetails, memberDetails, loading: false, error: null });
    });

    return () => {
      cancelled = true;
    };
  }, [currentIndex, providers]);

  return { details, loadDetails, clearDetails };
}
