/**
 * Pipeline Stage Functions
 *
 * Pure functions that track stages and return updated state.
 * Each function reads from state, performs tracking, and returns new state.
 */

import { loggers } from "../utils/logger";
import { StageType, TrackedStage } from "../types";
import {
  TrackingContext,
  addStage,
  getCompletedStage,
  getCachedStage,
  getGovernorAddress,
  getProposalId,
  getProposalData,
  getIsElection,
  getTimelockAddress,
  getOperationId,
  getFirstCallScheduledData,
  getQueueBlockNumber,
  getL2ExecutionTxHash,
  getFirstExecutableBlock,
  getOutboxExecutionTx,
  getL1ExecutionTxHash,
  getVotingEndBlock,
} from "./context";
import { isConstitutional } from "../stages/base";
import { trackProposalCreated } from "../stages/proposal-created";
import { trackVotingStage } from "../stages/voting";
import { trackProposalQueued } from "../stages/proposal-queued";
import { getFirstL2BlockForL1Block } from "../utils/timing";
import { trackL2Timelock, trackL1Timelock } from "../stages/timelock";
import { trackL2ToL1Message } from "../stages/l2-to-l1-message";
import { trackRetryables } from "../stages/retryables";
import { BLOCK_TIMES } from "../constants";
import { getCurrentBlockInfo } from "../utils/timing";

// Logging
const { pipeline: log, tracker: logTracker } = loggers;

// Stage chain mapping for L1 stages
// L1_TIMELOCK is the only L1 stage; RETRYABLE_EXECUTED runs on L2 (Arb1/Nova)
const L1_STAGES = new Set(["L1_TIMELOCK"]);

// Helper: create placeholder stage
const placeholder = (
  type: StageType,
  status: "NOT_STARTED" | "SKIPPED",
  reason: string
): TrackedStage => ({
  type,
  status,
  chain: L1_STAGES.has(type) ? "L1" : "arb1",
  transactions: [],
  data: { reason },
});

// Helper: track with cache check
async function withCache<K extends string, T>(
  state: TrackingContext,
  stageType: StageType,
  key: K,
  onCached: (cached: TrackedStage) => T,
  onTrack: () => Promise<{ state: TrackingContext } & Record<K, T>>
): Promise<{ state: TrackingContext } & Record<K, T>> {
  const cached = getCompletedStage(state, stageType);
  if (cached) {
    log("%s: using cached stage", stageType);
    return { state: await addStage(state, cached), [key]: onCached(cached) } as {
      state: TrackingContext;
    } & Record<K, T>;
  }
  return onTrack();
}

// Helper: track stage with error handling
async function track<K extends string, T>(
  state: TrackingContext,
  stageType: StageType,
  key: K,
  tracker: () => Promise<{ stage: TrackedStage; result: T }>
): Promise<{ state: TrackingContext } & Record<K, T>> {
  try {
    const { stage, result } = await tracker();
    return { state: await addStage(state, stage), [key]: result } as {
      state: TrackingContext;
    } & Record<K, T>;
  } catch (error) {
    throw new Error(
      `Failed to track ${stageType}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Governor Stages (1-3)

export async function pipelineTrackProposalCreated(
  state: TrackingContext
): Promise<{ state: TrackingContext; found: boolean }> {
  const governorAddress = getGovernorAddress(state);
  const proposalId = getProposalId(state);

  if (!governorAddress || !proposalId) return { state, found: false };
  if (getIsElection(state)) return { state, found: false };

  return withCache(
    state,
    "PROPOSAL_CREATED",
    "found",
    () => true,
    async () => {
      log("PROPOSAL_CREATED: tracking");
      const creationTxHash =
        state.input.type === "governor" ? state.input.creationTxHash : undefined;
      return track(state, "PROPOSAL_CREATED", "found", async () => {
        const r = await trackProposalCreated(governorAddress, proposalId, state.providers.l2, {
          creationTxHash,
        });
        return { stage: r.stage, result: r.proposalData !== null };
      });
    }
  );
}

export async function pipelineTrackVoting(
  state: TrackingContext
): Promise<{ state: TrackingContext; complete: boolean }> {
  const governorAddress = getGovernorAddress(state);
  const proposalId = getProposalId(state);
  const proposalData = getProposalData(state);

  if (!governorAddress || !proposalId || !proposalData) return { state, complete: false };

  return withCache(
    state,
    "VOTING_ACTIVE",
    "complete",
    (c) => c.status === "COMPLETED",
    async () => {
      log("VOTING_ACTIVE: tracking");
      return track(state, "VOTING_ACTIVE", "complete", async () => {
        const r = await trackVotingStage(
          governorAddress,
          proposalId,
          proposalData,
          state.providers.l2
        );
        return { stage: r.stage, result: r.stage.status === "COMPLETED" };
      });
    }
  );
}

export async function pipelineTrackProposalQueued(
  state: TrackingContext
): Promise<{ state: TrackingContext; queued: boolean }> {
  const governorAddress = getGovernorAddress(state);
  const proposalId = getProposalId(state);
  const proposalData = getProposalData(state);

  if (!governorAddress || !proposalId) return { state, queued: false };

  return withCache(
    state,
    "PROPOSAL_QUEUED",
    "queued",
    () => true,
    async () => {
      log("PROPOSAL_QUEUED: tracking");
      return track(state, "PROPOSAL_QUEUED", "queued", async () => {
        // Voting deadline is L1 block number - convert to L2 for searching
        // Use bounds to speed up binary search: min=creation block, max=creation+7M (~20 days)
        const votingDeadlineL1 = getVotingEndBlock(state);
        let votingEndBlock: number | undefined;
        if (votingDeadlineL1) {
          const creationBlock = proposalData?.creationBlock ?? 0;
          const { blockNumber: currentL2Block } = await getCurrentBlockInfo(state.providers.l2);
          const maxL2Block = Math.min(creationBlock + 7_000_000, currentL2Block);
          votingEndBlock = await getFirstL2BlockForL1Block(state.providers.l2, votingDeadlineL1, {
            minL2Block: creationBlock,
            maxL2Block,
          });
        }
        const r = await trackProposalQueued(
          governorAddress,
          proposalId,
          state.providers.l2,
          proposalData?.creationBlock ?? 0,
          { votingEndBlock }
        );
        let stage = r.stage;
        if (stage.status === "READY" && proposalData) {
          stage = {
            ...stage,
            data: {
              ...stage.data,
              targets: proposalData.targets,
              values: Array.from(proposalData.values).map((v) => v.toString()),
              calldatas: proposalData.calldatas,
              description: proposalData.description,
            },
          };
        }
        return { stage, result: r.operationId !== null && r.timelockAddress !== null };
      });
    }
  );
}

// Timelock Stage (4)

export async function pipelineTrackL2Timelock(
  state: TrackingContext
): Promise<{ state: TrackingContext; executed: boolean }> {
  const timelockAddress = getTimelockAddress(state);
  const operationId = getOperationId(state);
  const firstCallScheduledData = getFirstCallScheduledData(state);

  if (!timelockAddress || !operationId || !firstCallScheduledData)
    return { state, executed: false };

  return withCache(
    state,
    "L2_TIMELOCK",
    "executed",
    (c) => c.status === "COMPLETED",
    async () => {
      log("L2_TIMELOCK: tracking");
      return track(state, "L2_TIMELOCK", "executed", async () => {
        const r = await trackL2Timelock(
          timelockAddress,
          operationId,
          state.providers.l2,
          getQueueBlockNumber(state) ?? 0,
          firstCallScheduledData,
          {
            cachedExecutionTxHash: getL2ExecutionTxHash(state),
            allStages: state.stages,
          }
        );
        return { stage: r.stage, result: r.executionTxHash !== null };
      });
    }
  );
}

// L2→L1 Message Stage (5) - Unified

const L1_ROUNDTRIP_STAGES: StageType[] = ["L2_TO_L1_MESSAGE", "L1_TIMELOCK", "RETRYABLE_EXECUTED"];

async function addSkippedL1Stages(state: TrackingContext): Promise<TrackingContext> {
  let s = state;
  for (const type of L1_ROUNDTRIP_STAGES)
    s = await addStage(s, placeholder(type, "SKIPPED", "L2-only path"));
  return s;
}

export async function pipelineTrackL2ToL1Message(
  state: TrackingContext
): Promise<{ state: TrackingContext; executed: boolean; needsL1: boolean }> {
  const l2ExecutionTxHash = getL2ExecutionTxHash(state);
  const addressForPath = getGovernorAddress(state) ?? getTimelockAddress(state);
  const needsL1 = addressForPath ? isConstitutional(addressForPath) : true;

  if (!needsL1) {
    log("L2_TO_L1_MESSAGE: L2-only path, skipping L1 stages");
    return { state: await addSkippedL1Stages(state), executed: false, needsL1: false };
  }

  if (!l2ExecutionTxHash) return { state, executed: false, needsL1: true };

  // Check completed cache
  const cached = getCompletedStage(state, "L2_TO_L1_MESSAGE");
  if (cached) {
    log("L2_TO_L1_MESSAGE: using cached stage");
    return { state: await addStage(state, cached), executed: true, needsL1: true };
  }

  // Fast-path for pending (still in challenge period)
  const pending = getCachedStage(state, "L2_TO_L1_MESSAGE");
  if (pending?.status === "PENDING") {
    const firstExec = (pending.data as { firstExecutableBlock?: number }).firstExecutableBlock;
    if (firstExec) {
      const { blockNumber: currentL1Block, timestamp } = await getCurrentBlockInfo(
        state.providers.l1
      );
      if (currentL1Block < firstExec) {
        const remainingSeconds = (firstExec - currentL1Block) * BLOCK_TIMES.L1;
        const updated: TrackedStage = {
          ...pending,
          data: { ...pending.data, currentL1Block, fastPath: true },
          timing: {
            ...pending.timing,
            eta: timestamp + remainingSeconds,
            delaySeconds: remainingSeconds,
          },
        };
        return { state: await addStage(state, updated), executed: false, needsL1: true };
      }
    }
  }

  // Full tracking
  log("L2_TO_L1_MESSAGE: tracking");
  const { state: newState, executed } = await track(
    state,
    "L2_TO_L1_MESSAGE",
    "executed",
    async () => {
      const r = await trackL2ToL1Message(l2ExecutionTxHash, state.providers.l2, state.providers.l1);
      return { stage: r.stage, result: r.isExecuted };
    }
  );
  return { state: newState, executed, needsL1: true };
}

// L1 Timelock Stage (6)

export async function pipelineTrackL1Timelock(
  state: TrackingContext
): Promise<{ state: TrackingContext; executed: boolean }> {
  return withCache(
    state,
    "L1_TIMELOCK",
    "executed",
    (c) => c.status === "COMPLETED",
    async () => {
      log("L1_TIMELOCK: tracking");
      return track(state, "L1_TIMELOCK", "executed", async () => {
        const r = await trackL1Timelock(state.providers.l1, {
          outboxExecutionTx: getOutboxExecutionTx(state),
          fromBlock: getFirstExecutableBlock(state),
          allStages: state.stages,
        });
        return { stage: r.stage, result: r.executionTxHash !== null };
      });
    }
  );
}

// Retryable Stage (7)

export async function pipelineTrackRetryables(
  state: TrackingContext
): Promise<{ state: TrackingContext; redeemed: boolean }> {
  const l1ExecutionTxHash = getL1ExecutionTxHash(state);
  if (!l1ExecutionTxHash) return { state, redeemed: false };

  return withCache(
    state,
    "RETRYABLE_EXECUTED",
    "redeemed",
    (c) => c.status === "COMPLETED",
    async () => {
      log("RETRYABLE_EXECUTED: tracking");
      return track(state, "RETRYABLE_EXECUTED", "redeemed", async () => {
        const r = await trackRetryables(l1ExecutionTxHash, state.providers.l1, {
          l2Provider: state.providers.l2,
          novaProvider: state.providers.nova,
        });
        return { stage: r.stage, result: r.stage.status === "COMPLETED" };
      });
    }
  );
}

// Full Pipelines

async function addPlaceholders(
  state: TrackingContext,
  types: StageType[],
  reason: string
): Promise<TrackingContext> {
  let s = state;
  for (const type of types) s = await addStage(s, placeholder(type, "NOT_STARTED", reason));
  return s;
}

const RETRYABLE_STAGES: StageType[] = ["RETRYABLE_EXECUTED"];

/**
 * Track full governor proposal pipeline.
 * Returns final state after tracking all stages.
 */
export async function trackGovernorPipeline(state: TrackingContext): Promise<TrackingContext> {
  // Stage 1: Proposal Created
  const { state: state1, found } = await pipelineTrackProposalCreated(state);
  if (!found) {
    logTracker("proposal not found, stopping");
    return state1;
  }

  // Stage 2: Voting
  const { state: state2, complete: votingComplete } = await pipelineTrackVoting(state1);
  if (!votingComplete) {
    logTracker("voting not complete, stopping");
    return state2;
  }

  // Stage 3: Proposal Queued
  const { state: state3, queued } = await pipelineTrackProposalQueued(state2);
  if (!queued) {
    logTracker("proposal not queued, stopping");
    return state3;
  }

  // Continue with timelock pipeline
  return trackTimelockPipeline(state3);
}

/**
 * Track timelock pipeline (stages 4-7).
 * Used by governor pipeline and direct timelock tracking.
 */
export async function trackTimelockPipeline(state: TrackingContext): Promise<TrackingContext> {
  // Stage 4: L2 Timelock (unified)
  const { state: state1, executed: l2Executed } = await pipelineTrackL2Timelock(state);
  if (!l2Executed) {
    logTracker("L2 timelock not executed, stopping");
    return addPlaceholders(state1, L1_ROUNDTRIP_STAGES, "L2 timelock not executed");
  }

  // Stage 5: L2→L1 Message (unified)
  const {
    state: state2,
    executed: msgExecuted,
    needsL1,
  } = await pipelineTrackL2ToL1Message(state1);
  if (!needsL1) return state2; // L2-only path, already added SKIPPED stages
  if (!msgExecuted) {
    logTracker("L2→L1 message not executed, stopping");
    return addPlaceholders(state2, L1_ROUNDTRIP_STAGES.slice(1), "Waiting for L2→L1 message");
  }

  // Stage 6: L1 Timelock (unified)
  const { state: state3, executed: l1Executed } = await pipelineTrackL1Timelock(state2);
  if (!l1Executed) {
    logTracker("L1 timelock not executed, stopping");
    return addPlaceholders(state3, RETRYABLE_STAGES, "L1 timelock not executed");
  }

  // Stage 7: Retryables
  const { state: finalState } = await pipelineTrackRetryables(state3);
  return finalState;
}
