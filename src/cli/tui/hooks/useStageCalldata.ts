/**
 * Hook for loading and decoding calldata from proposal stages
 */

import { useState, useEffect } from "react";
import type { TrackedStage, Chain } from "../../../types";
import { decodeCalldata, extractCalldataFromStage } from "../../../calldata";
import type { DecodedCalldata } from "../../../types/calldata";

export interface DecodedAction {
  target: string;
  value: string;
  decoded: DecodedCalldata;
}

export interface UseStageCalldataResult {
  actions: DecodedAction[];
  loading: boolean;
  error: string | null;
}

export function useStageCalldata(firstStage: TrackedStage | undefined): UseStageCalldataResult {
  const [actions, setActions] = useState<DecodedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCalldata(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        if (!firstStage) {
          setError("No stage data available");
          return;
        }

        const { calldatas, targets, values } = extractCalldataFromStage(firstStage);

        if (calldatas.length === 0) {
          setError("No calldata found in proposal");
          return;
        }

        const chainContext: Chain = "arb1";
        const decoded: DecodedAction[] = [];

        for (let i = 0; i < calldatas.length; i++) {
          const result = await decodeCalldata(calldatas[i], targets[i], 0, chainContext);
          decoded.push({
            target: targets[i],
            value: values[i],
            decoded: result,
          });
        }

        setActions(decoded);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    loadCalldata();
  }, [firstStage]);

  return { actions, loading, error };
}
