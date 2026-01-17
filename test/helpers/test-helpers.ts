/**
 * Shared test helpers for creating mock checkpoints and stages
 */

import type { TrackingCheckpoint, TrackedStage, StageType, StageStatus } from "../../src/types";
import { ADDRESSES } from "../../src/constants";

/**
 * Create a minimal checkpoint for testing
 */
export function createTestCheckpoint(
  overrides: Partial<TrackingCheckpoint> & {
    stages?: TrackedStage[];
    inputType?: "governor" | "timelock" | "election";
    governorAddress?: string;
    electionStatus?: { phase: string };
  } = {}
): TrackingCheckpoint {
  const stages = overrides.stages ?? [];
  const inputType = overrides.inputType ?? "governor";

  let input: TrackingCheckpoint["input"];
  if (inputType === "election") {
    input = {
      type: "election" as const,
      electionIndex: 0,
    };
  } else if (inputType === "timelock") {
    input = {
      type: "timelock" as const,
      operationId: "0x" + "a".repeat(64),
      timelockAddress: "0x" + "b".repeat(40),
      scheduledTxHash: "0x" + "c".repeat(64),
    };
  } else {
    input = {
      type: "governor" as const,
      governorAddress: overrides.governorAddress ?? ADDRESSES.CONSTITUTIONAL_GOVERNOR,
      proposalId: "12345",
      creationTxHash: "0x" + "a".repeat(64),
    };
  }

  return {
    input,
    cachedData: {
      completedStages: stages,
      electionStatus: overrides.electionStatus,
    },
    metadata: overrides.metadata ?? { errorCount: 0, lastTrackedAt: Date.now() },
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  } as TrackingCheckpoint;
}

/**
 * Create a stage with minimal required fields
 */
export function createTestStage(type: StageType, status: StageStatus): TrackedStage {
  return {
    type,
    status,
    chain: "arb1",
    chainId: 42161,
    transactions: [],
    data: {},
  } as TrackedStage;
}
