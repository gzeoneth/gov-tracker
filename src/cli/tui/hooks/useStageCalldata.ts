/**
 * Hook for loading and decoding calldata from proposal stages
 */

import { useState, useEffect } from "react";
import type { TrackedStage, Chain } from "../../../types/index.js";
import { decodeCalldata, extractCalldataFromStage } from "../../../calldata/index.js";
import type { DecodedCalldata } from "../../../types/calldata.js";

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

function findStageWithCalldata(stages: TrackedStage[]): TrackedStage | undefined {
  for (const stage of stages) {
    const { calldatas } = extractCalldataFromStage(stage);
    if (calldatas.length > 0) {
      return stage;
    }
  }
  return undefined;
}

export function useStageCalldata(
  firstStage: TrackedStage | undefined,
  allStages?: TrackedStage[]
): UseStageCalldataResult {
  const [actions, setActions] = useState<DecodedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCalldata(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const stagesToSearch = allStages ?? (firstStage ? [firstStage] : []);
        const stageWithCalldata = findStageWithCalldata(stagesToSearch);

        if (!stageWithCalldata) {
          if (!cancelled) setError("No calldata found in proposal");
          return;
        }

        const { calldatas, targets, values } = extractCalldataFromStage(stageWithCalldata);

        const chainContext: Chain = "arb1";
        const decoded: DecodedAction[] = [];

        let decodeErrors = 0;
        for (let i = 0; i < calldatas.length; i++) {
          if (cancelled) return;
          try {
            const result = await decodeCalldata(calldatas[i], targets[i], 0, chainContext);
            decoded.push({
              target: targets[i],
              value: values[i],
              decoded: result,
            });
          } catch {
            decodeErrors++;
          }
        }

        if (!cancelled) {
          setActions(decoded);
          if (decodeErrors > 0 && decoded.length === 0) {
            setError(`Failed to decode ${decodeErrors} action(s)`);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCalldata();

    return () => {
      cancelled = true;
    };
  }, [firstStage, allStages]);

  return { actions, loading, error };
}
