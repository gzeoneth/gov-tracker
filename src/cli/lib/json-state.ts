/**
 * JSON State Writer for Dashboard Integration
 *
 * NOTE: This is CLI application code that demonstrates SDK usage, not library code.
 * Developers should treat this as part of the CLI application, not as part of the SDK API.
 *
 * Writes structured tracking state to a JSON file for external dashboards.
 * This is monitor-specific code, not part of the SDK.
 */

import * as fs from "fs";
import {
  TrackedStage,
  StageStatus,
  getCurrentStage,
  getTrackingStatusSummary,
  getStageTransactionUrl,
  Chain,
  TrackingCheckpoint,
  isCheckpointComplete,
  isCheckpointErrored,
} from "../../index";

// ============================================================================
// Types
// ============================================================================

/**
 * Stage status for JSON output
 */
export interface JsonStageStatus {
  type: string;
  status: StageStatus;
  chain: Chain;
  txHash?: string;
  blockNumber?: number;
  timestamp?: number;
  explorerUrl?: string;
  eta?: number;
  executable?: boolean;
  data?: Record<string, unknown>;
}

/**
 * Tracking entry for JSON output
 */
export interface JsonTrackingEntry {
  id: string;
  type: "governor" | "timelock";
  governorAddress?: string;
  proposalId?: string;
  timelockAddress?: string;
  operationId?: string;
  isComplete: boolean;
  currentStage?: string;
  currentStatus?: StageStatus;
  stages: JsonStageStatus[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    ready: number;
    failed: number;
  };
  updatedAt: string;
  error?: string;
}

/**
 * Election entry for JSON output
 */
export interface JsonElectionEntry {
  id: string;
  electionIndex: number;
  phase: string;
  cohort: number;
  isComplete: boolean;
  stages: JsonStageStatus[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    ready: number;
    failed: number;
  };
  nomineeProposalId?: string;
  memberProposalId?: string;
  updatedAt: string;
  error?: string;
}

/**
 * Full JSON state for dashboard
 */
export interface JsonDashboardState {
  version: "1.0";
  generatedAt: string;
  monitorStats: {
    totalTracked: number;
    complete: number;
    inProgress: number;
    failed: number;
  };
  proposals: JsonTrackingEntry[];
  timelockOps: JsonTrackingEntry[];
  elections: JsonElectionEntry[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function stageToJson(stage: TrackedStage): JsonStageStatus {
  const tx = stage.transactions?.[0];
  const json: JsonStageStatus = {
    type: stage.type,
    status: stage.status,
    chain: stage.chain,
  };

  if (tx) {
    json.txHash = tx.hash;
    json.blockNumber = tx.blockNumber;
    json.timestamp = tx.timestamp;
    json.explorerUrl = getStageTransactionUrl(tx);
  }

  if (stage.timing?.eta) {
    json.eta = stage.timing.eta;
  }

  if (stage.executable) {
    json.executable = true;
  }

  // Include relevant data fields (cast to loose type for field extraction)
  const data = stage.data as Record<string, unknown>;
  const relevantData: Record<string, unknown> = {};
  if (data.operationId) relevantData.operationId = data.operationId;
  if (data.isSecurityCouncilOperation)
    relevantData.isSecurityCouncil = data.isSecurityCouncilOperation;
  if (data.ticketCount) relevantData.ticketCount = data.ticketCount;
  if (data.redeemedCount !== undefined) relevantData.redeemedCount = data.redeemedCount;
  if (data.pendingCount !== undefined) relevantData.pendingCount = data.pendingCount;

  if (Object.keys(relevantData).length > 0) {
    json.data = relevantData;
  }

  return json;
}

/**
 * Convert election checkpoint to JSON entry for dashboard
 */
function electionCheckpointToJson(key: string, checkpoint: TrackingCheckpoint): JsonElectionEntry {
  const electionStatus = checkpoint.cachedData?.electionStatus as
    | {
        electionIndex: number;
        phase?: string;
        cohort?: number;
        stages?: TrackedStage[];
        nomineeProposalId?: string;
        memberProposalId?: string;
      }
    | undefined;

  const stages = electionStatus?.stages ?? [];
  const summary =
    stages.length > 0
      ? getTrackingStatusSummary(stages)
      : { total: 0, completed: 0, pending: 0, ready: 0, failed: 0, skipped: 0 };

  const complete = isCheckpointComplete(checkpoint);
  const errorCount = checkpoint.metadata?.errorCount ?? 0;
  const inputIndex = checkpoint.input.type === "election" ? checkpoint.input.electionIndex : -1;

  return {
    id: key,
    electionIndex: electionStatus?.electionIndex ?? inputIndex,
    phase: electionStatus?.phase ?? "UNKNOWN",
    cohort: electionStatus?.cohort ?? 0,
    isComplete: complete,
    stages: stages.map(stageToJson),
    summary: {
      total: summary.total,
      completed: summary.completed,
      pending: summary.pending,
      ready: summary.ready,
      failed: summary.failed,
    },
    nomineeProposalId: electionStatus?.nomineeProposalId,
    memberProposalId: electionStatus?.memberProposalId,
    updatedAt: new Date().toISOString(),
    error: errorCount > 0 ? `${errorCount} consecutive errors` : undefined,
  };
}

/**
 * Convert TrackingCheckpoint to JSON entry for dashboard
 */
function checkpointToJsonEntry(key: string, checkpoint: TrackingCheckpoint): JsonTrackingEntry {
  const input = checkpoint.input;
  const stages = checkpoint.cachedData?.completedStages ?? [];
  const errorCount = checkpoint.metadata?.errorCount ?? 0;
  const currentStage = stages.length > 0 ? getCurrentStage(stages) : null;
  const summary =
    stages.length > 0
      ? getTrackingStatusSummary(stages)
      : { total: 0, completed: 0, pending: 0, ready: 0, failed: 0, skipped: 0 };

  const entry: JsonTrackingEntry = {
    id: key,
    type: input.type === "governor" ? "governor" : "timelock",
    isComplete: isCheckpointComplete(checkpoint),
    currentStage: currentStage?.type,
    currentStatus: currentStage?.status,
    stages: stages.map(stageToJson),
    summary: {
      total: summary.total,
      completed: summary.completed,
      pending: summary.pending,
      ready: summary.ready,
      failed: summary.failed,
    },
    updatedAt: new Date().toISOString(),
    error: errorCount > 0 ? `${errorCount} consecutive errors` : undefined,
  };

  if (input.type === "governor") {
    entry.governorAddress = input.governorAddress;
    entry.proposalId = input.proposalId;
  } else if (input.type === "timelock") {
    entry.timelockAddress = input.timelockAddress;
    entry.operationId = input.operationId;
  }

  return entry;
}

// ============================================================================
// Main Export Functions
// ============================================================================

/**
 * Build JSON dashboard state from TrackingCheckpoint map
 */
export function buildDashboardState(
  checkpoints: Map<string, TrackingCheckpoint>
): JsonDashboardState {
  const proposals: JsonTrackingEntry[] = [];
  const timelockOps: JsonTrackingEntry[] = [];
  const elections: JsonElectionEntry[] = [];

  let complete = 0;
  let inProgress = 0;
  let failed = 0;

  for (const [key, checkpoint] of checkpoints) {
    const inputType = checkpoint.input.type;

    if (inputType === "election") {
      const electionEntry = electionCheckpointToJson(key, checkpoint);

      if (electionEntry.isComplete) {
        complete++;
      } else if (electionEntry.summary.failed > 0 || isCheckpointErrored(checkpoint)) {
        failed++;
      } else {
        inProgress++;
      }

      elections.push(electionEntry);
      continue;
    }

    if (inputType !== "governor" && inputType !== "timelock") {
      continue;
    }

    const jsonEntry = checkpointToJsonEntry(key, checkpoint);

    if (jsonEntry.isComplete) {
      complete++;
    } else if (jsonEntry.summary.failed > 0 || isCheckpointErrored(checkpoint)) {
      failed++;
    } else {
      inProgress++;
    }

    if (inputType === "governor") {
      proposals.push(jsonEntry);
    } else {
      timelockOps.push(jsonEntry);
    }
  }

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    monitorStats: {
      totalTracked: proposals.length + timelockOps.length + elections.length,
      complete,
      inProgress,
      failed,
    },
    proposals,
    timelockOps,
    elections,
  };
}

/**
 * Write JSON dashboard state to file
 */
export function writeDashboardState(state: JsonDashboardState, path: string): void {
  fs.writeFileSync(path, JSON.stringify(state, null, 2));
}
