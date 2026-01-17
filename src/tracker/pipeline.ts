/**
 * Pipeline Stage Tracking
 *
 * Declarative pipelines for tracking governance proposals and elections.
 * Each stage is a config object with type and track function.
 * The stage runner handles caching automatically.
 *
 * Three tracking paths:
 * - Governor: PROPOSAL_CREATED → VOTING_ACTIVE → PROPOSAL_QUEUED → timelock
 * - Timelock: L2_TIMELOCK → L2_TO_L1_MESSAGE → L1_TIMELOCK → RETRYABLE_EXECUTED
 * - Election: CREATE_ELECTION → NOMINEE_ELECTION → NOMINEE_VETTING → MEMBER_ELECTION → timelock
 */

import { ethers, BigNumber } from "ethers";
import { loggers } from "../utils/logger";
import { StageType, TrackedStage, CohortType, MemberElectionData } from "../types";
import {
  TrackingState,
  addStage,
  getGovernorAddress,
  getProposalId,
  getProposalData,
  getProposalType,
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
  getElectionIndex,
  getNomineeProposalId,
  getMemberProposalId,
} from "./state";
import {
  StageConfig,
  StageResult,
  runPipeline,
  addPlaceholders,
  getCachedStage,
} from "./stage-runner";
import { isConstitutional } from "../stages/utils";
import { trackProposalCreated } from "../stages/proposal-created";
import { trackVotingStage } from "../stages/voting";
import { trackProposalQueued } from "../stages/proposal-queued";
import { getFirstL2BlockForL1Block, getL1BlockNumberFromL2 } from "../utils/timing";
import { trackL2Timelock, trackL1Timelock } from "../stages/timelock";
import { trackL2ToL1Message } from "../stages/l2-to-l1-message";
import { trackRetryables } from "../stages/retryables";
import { BLOCK_TIMES, ADDRESSES, TIMING, proposalStateToString } from "../constants";
import { getCurrentBlockInfo } from "../utils/timing";
import { StageBuilder } from "../stages/builder";
import { queryWithRetry } from "../utils/rpc-utils";
import { multicall, buildCallInput } from "../utils/multicall";
import { nomineeElectionGovernorInterface, proposalExecutedInterface } from "../abis";
import { getNomineeGovernor, getMemberGovernor } from "../election/contracts";
import { computeElectionProposalId, getElectionProposalId } from "../election/proposal-ids";
import { findCallScheduledByTxHash } from "../discovery/timelock-discovery";
import { findProposalCreatedEvent } from "../discovery/governor-discovery";
import { findLog } from "../utils/log-search";

const { pipeline: log, tracker: logTracker } = loggers;

/** Guard for election stages - returns election index and nominee proposal ID if available */
function getElectionContext(
  state: TrackingState
): { electionIndex: number; nomineeProposalId: string } | null {
  const electionIndex = getElectionIndex(state);
  const nomineeProposalId = getNomineeProposalId(state);
  return electionIndex !== undefined && nomineeProposalId
    ? { electionIndex, nomineeProposalId }
    : null;
}

/** Map proposal state string to stage status */
function proposalStateToStageStatus(proposalState: string): {
  status: "PENDING" | "COMPLETED" | "FAILED";
  complete: boolean;
} {
  if (proposalState === "Active" || proposalState === "Pending") {
    return { status: "PENDING", complete: false };
  }
  if (proposalState === "Defeated" || proposalState === "Canceled") {
    return { status: "FAILED", complete: false };
  }
  return { status: "COMPLETED", complete: true };
}

// ============================================================================
// Governor Stage Trackers
// ============================================================================

async function trackProposalCreatedStage(state: TrackingState): Promise<StageResult> {
  const governorAddress = getGovernorAddress(state);
  const proposalId = getProposalId(state);

  if (!governorAddress || !proposalId) return { state, continue: false };
  if (getIsElection(state)) return { state, continue: false };

  log("PROPOSAL_CREATED: tracking");
  const creationTxHash = state.input.type === "governor" ? state.input.creationTxHash : undefined;

  const result = await trackProposalCreated(governorAddress, proposalId, state.providers.l2, {
    creationTxHash,
    chunkSize: state.chunkingConfig.l2ChunkSize,
  });

  return {
    state: await addStage(state, result.stage),
    continue: result.proposalData !== null,
  };
}

async function trackVotingStage_(state: TrackingState): Promise<StageResult> {
  const governorAddress = getGovernorAddress(state);
  const proposalId = getProposalId(state);
  const proposalData = getProposalData(state);

  if (!governorAddress || !proposalId || !proposalData) return { state, continue: false };

  log("VOTING_ACTIVE: tracking");
  const result = await trackVotingStage(
    governorAddress,
    proposalId,
    proposalData,
    state.providers.l2
  );

  return {
    state: await addStage(state, result.stage),
    continue: result.stage.status === "COMPLETED",
  };
}

async function trackProposalQueuedStage(state: TrackingState): Promise<StageResult> {
  const governorAddress = getGovernorAddress(state);
  const proposalId = getProposalId(state);
  const proposalData = getProposalData(state);

  if (!governorAddress || !proposalId) return { state, continue: false };

  log("PROPOSAL_QUEUED: tracking");

  // Convert L1 voting deadline to L2 block for searching
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

  const result = await trackProposalQueued(
    governorAddress,
    proposalId,
    state.providers.l2,
    proposalData?.creationBlock ?? 0,
    { votingEndBlock, chunkSize: state.chunkingConfig.l2ChunkSize }
  );

  let stage: TrackedStage = result.stage;

  // Enrich stage data with proposal info for READY state
  if (stage.type === "PROPOSAL_QUEUED" && stage.status === "READY" && proposalData) {
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

  return {
    state: await addStage(state, stage),
    continue: result.operationId !== null && result.timelockAddress !== null,
  };
}

// ============================================================================
// Timelock Stage Trackers
// ============================================================================

async function trackL2TimelockStage(state: TrackingState): Promise<StageResult> {
  const timelockAddress = getTimelockAddress(state);
  const operationId = getOperationId(state);
  const firstCallScheduledData = getFirstCallScheduledData(state);

  if (!timelockAddress || !operationId) return { state, continue: false };

  // Fresh tracking requires callScheduledData
  if (!firstCallScheduledData) {
    log("L2_TIMELOCK: missing callScheduledData for fresh tracking");
    return { state, continue: false };
  }

  log("L2_TIMELOCK: tracking");
  const result = await trackL2Timelock(
    timelockAddress,
    operationId,
    state.providers.l2,
    getQueueBlockNumber(state) ?? 0,
    firstCallScheduledData,
    {
      cachedExecutionTxHash: getL2ExecutionTxHash(state),
      allStages: state.stages,
      proposalType: getProposalType(state),
      chunkSize: state.chunkingConfig.l2ChunkSize,
    }
  );

  return {
    state: await addStage(state, result.stage),
    continue: result.executionTxHash !== null,
  };
}

const L1_ROUNDTRIP_STAGES: StageType[] = ["L2_TO_L1_MESSAGE", "L1_TIMELOCK", "RETRYABLE_EXECUTED"];

async function trackL2ToL1MessageStage(state: TrackingState): Promise<StageResult> {
  const l2ExecutionTxHash = getL2ExecutionTxHash(state);
  const addressForPath = getGovernorAddress(state) ?? getTimelockAddress(state);
  const needsL1 = addressForPath ? isConstitutional(addressForPath) : true;

  // L2-only path: skip all L1 stages
  if (!needsL1) {
    log("L2_TO_L1_MESSAGE: L2-only path, skipping L1 stages");
    const newState = await addPlaceholders(state, L1_ROUNDTRIP_STAGES, "SKIPPED", "L2-only path");
    return { state: newState, continue: false };
  }

  if (!l2ExecutionTxHash) return { state, continue: false };

  // Fast-path for pending (still in challenge period)
  const pending = getCachedStage(state, "L2_TO_L1_MESSAGE");
  if (pending?.type === "L2_TO_L1_MESSAGE" && pending.status === "PENDING") {
    const firstExec = pending.data.firstExecutableBlock;
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
        return { state: await addStage(state, updated), continue: false };
      }
    }
  }

  // Full tracking
  log("L2_TO_L1_MESSAGE: tracking");
  const result = await trackL2ToL1Message(
    l2ExecutionTxHash,
    state.providers.l2,
    state.providers.l1,
    { chunkSize: state.chunkingConfig.l1ChunkSize }
  );

  return {
    state: await addStage(state, result.stage),
    continue: result.isExecuted,
  };
}

async function trackL1TimelockStage(state: TrackingState): Promise<StageResult> {
  log("L1_TIMELOCK: tracking");
  const result = await trackL1Timelock(state.providers.l1, {
    outboxExecutionTx: getOutboxExecutionTx(state),
    fromBlock: getFirstExecutableBlock(state),
    allStages: state.stages,
    chunkSize: state.chunkingConfig.l1ChunkSize,
  });

  return {
    state: await addStage(state, result.stage),
    continue: result.executionTxHash !== null,
  };
}

async function trackRetryablesStage(state: TrackingState): Promise<StageResult> {
  const l1ExecutionTxHash = getL1ExecutionTxHash(state);
  if (!l1ExecutionTxHash) return { state, continue: false };

  log("RETRYABLE_EXECUTED: tracking");
  const result = await trackRetryables(l1ExecutionTxHash, state.providers.l1, {
    l2Provider: state.providers.l2,
    novaProvider: state.providers.nova,
  });

  return {
    state: await addStage(state, result.stage),
    continue: result.stage.status === "COMPLETED",
  };
}

// ============================================================================
// Election Stage Trackers
// ============================================================================

async function findElectionExecuteTxHash(
  proposalId: string,
  governorAddress: string,
  provider: ethers.providers.Provider,
  l2ChunkSize: number = 100000
): Promise<{ txHash: string; blockNumber: number } | null> {
  const governor = getNomineeGovernor(governorAddress, provider);
  const topic = proposalExecutedInterface.getEventTopic("ProposalExecuted");

  const snapshotL1 = await queryWithRetry<BigNumber>(() => governor.proposalSnapshot(proposalId));
  const snapshotL2 = await getFirstL2BlockForL1Block(provider, snapshotL1.toNumber());
  if (!snapshotL2) return null;

  const currentBlock = await queryWithRetry(() => provider.getBlockNumber());

  const matchingLog = await findLog(
    provider,
    { address: governorAddress, topics: [topic], fromBlock: snapshotL2, toBlock: currentBlock },
    (eventLog) => {
      try {
        const parsed = proposalExecutedInterface.parseLog(eventLog);
        return parsed.args.proposalId.toString() === proposalId;
      } catch {
        return false;
      }
    },
    { chunkSize: l2ChunkSize }
  );

  return matchingLog
    ? { txHash: matchingLog.transactionHash, blockNumber: matchingLog.blockNumber }
    : null;
}

async function trackCreateElectionStage(state: TrackingState): Promise<StageResult> {
  const electionIndex = getElectionIndex(state);
  if (electionIndex === undefined) return { state, continue: false };

  log("CREATE_ELECTION: tracking election %d", electionIndex);

  const nomineeGovernorAddress = ADDRESSES.ELECTION_NOMINEE_GOVERNOR;
  const nomineeGovernor = getNomineeGovernor(nomineeGovernorAddress, state.providers.l2);

  const cohort = (await queryWithRetry<number>(() =>
    nomineeGovernor.electionIndexToCohort(electionIndex)
  )) as CohortType;

  const nomineeProposalId = await getElectionProposalId(
    electionIndex,
    state.providers.l2,
    nomineeGovernorAddress
  );

  if (!nomineeProposalId) {
    const notStartedStage = new StageBuilder("CREATE_ELECTION", "arb1")
      .status("NOT_STARTED")
      .data({ electionIndex, cohort, startTimestamp: 0, reason: "Election not yet created" })
      .build();
    return { state: await addStage(state, notStartedStage), continue: false };
  }

  const stageBuilder = new StageBuilder("CREATE_ELECTION", "arb1")
    .status("COMPLETED")
    .data({ electionIndex, cohort, startTimestamp: 0, nomineeProposalId });

  // Find creation tx hash for the election proposal
  try {
    const creationEvent = await findProposalCreatedEvent(
      nomineeGovernorAddress,
      nomineeProposalId,
      state.providers.l2
    );
    if (creationEvent) {
      stageBuilder.tx(creationEvent.creationTxHash, creationEvent.creationBlock, "arb1", 42161);
    }
  } catch {
    // Creation tx discovery failed silently - stage still valid
  }

  return { state: await addStage(state, stageBuilder.build()), continue: true };
}

async function trackNomineeElectionStage(state: TrackingState): Promise<StageResult> {
  const ctx = getElectionContext(state);
  if (!ctx) return { state, continue: false };

  log("NOMINEE_ELECTION: tracking");

  const nomineeGovernorAddress = ADDRESSES.ELECTION_NOMINEE_GOVERNOR;
  const nomineeResults = await multicall(state.providers.l2, [
    buildCallInput<number>(nomineeGovernorAddress, nomineeElectionGovernorInterface, "state", [
      ctx.nomineeProposalId,
    ]),
    buildCallInput<BigNumber>(
      nomineeGovernorAddress,
      nomineeElectionGovernorInterface,
      "compliantNomineeCount",
      [ctx.nomineeProposalId]
    ),
  ]);

  const nomineeState = nomineeResults[0] as number;
  const nomineeProposalState = proposalStateToString(nomineeState);
  const compliantNomineeCount = ((nomineeResults[1] as BigNumber) ?? BigNumber.from(0)).toNumber();

  const { status, complete } = proposalStateToStageStatus(nomineeProposalState);
  const stageBuilder = new StageBuilder("NOMINEE_ELECTION", "arb1").status(status).data({
    nomineeProposalId: ctx.nomineeProposalId,
    proposalState: nomineeProposalState,
    contenderCount: 0,
    compliantNomineeCount,
    targetNomineeCount: TIMING.SECURITY_COUNCIL_TARGET_NOMINEES,
  });

  return { state: await addStage(state, stageBuilder.build()), continue: complete };
}

async function trackNomineeVettingStage(state: TrackingState): Promise<StageResult> {
  const ctx = getElectionContext(state);
  if (!ctx) return { state, continue: false };

  log("NOMINEE_VETTING: tracking");

  const nomineeGovernorAddress = ADDRESSES.ELECTION_NOMINEE_GOVERNOR;
  const memberGovernorAddress = ADDRESSES.ELECTION_MEMBER_GOVERNOR;
  const memberGovernor = getMemberGovernor(memberGovernorAddress, state.providers.l2);

  const [vettingResults, currentL1Block] = await Promise.all([
    multicall(state.providers.l2, [
      buildCallInput<BigNumber>(
        nomineeGovernorAddress,
        nomineeElectionGovernorInterface,
        "proposalVettingDeadline",
        [ctx.nomineeProposalId]
      ),
      buildCallInput<BigNumber>(
        nomineeGovernorAddress,
        nomineeElectionGovernorInterface,
        "compliantNomineeCount",
        [ctx.nomineeProposalId]
      ),
      buildCallInput<number>(nomineeGovernorAddress, nomineeElectionGovernorInterface, "state", [
        ctx.nomineeProposalId,
      ]),
    ]),
    getL1BlockNumberFromL2(state.providers.l2),
  ]);

  const vettingDeadlineBN = (vettingResults[0] as BigNumber) ?? BigNumber.from(0);
  const vettingDeadline = vettingDeadlineBN.toNumber();
  const compliantNomineeCount = ((vettingResults[1] as BigNumber) ?? BigNumber.from(0)).toNumber();
  const nomineeState = vettingResults[2] as number;
  const nomineeProposalState = proposalStateToString(nomineeState);

  const isInVettingPeriod =
    nomineeProposalState === "Succeeded" && currentL1Block.lte(vettingDeadlineBN);

  // Check if member proposal exists
  let memberProposalId: string | null = null;
  const computedMemberProposalId = await computeElectionProposalId(
    ctx.electionIndex,
    memberGovernor
  );

  try {
    await queryWithRetry(() => memberGovernor.state(computedMemberProposalId));
    memberProposalId = computedMemberProposalId;
  } catch {
    // Member election not yet created
  }

  const stageBuilder = new StageBuilder("NOMINEE_VETTING", "arb1").data({
    nomineeProposalId: ctx.nomineeProposalId,
    vettingDeadline,
    currentL1Block: currentL1Block.toNumber(),
    compliantNomineeCount,
    memberProposalId: memberProposalId ?? undefined,
  });

  const canProceedToMemberPhase =
    nomineeProposalState === "Succeeded" &&
    !isInVettingPeriod &&
    compliantNomineeCount >= TIMING.SECURITY_COUNCIL_TARGET_NOMINEES &&
    !memberProposalId;

  let complete = false;

  if (nomineeProposalState === "Executed" || memberProposalId) {
    stageBuilder.status("COMPLETED");
    complete = true;

    try {
      const executeEvent = await findElectionExecuteTxHash(
        ctx.nomineeProposalId,
        nomineeGovernorAddress,
        state.providers.l2,
        state.chunkingConfig.l2ChunkSize
      );
      if (executeEvent) {
        stageBuilder.tx(executeEvent.txHash, executeEvent.blockNumber, "arb1", 42161);
      }
    } catch {
      // TX hash discovery failed
    }
  } else if (canProceedToMemberPhase) {
    stageBuilder.status("READY").executable(true);
  } else if (isInVettingPeriod) {
    stageBuilder.status("PENDING");
  } else if (compliantNomineeCount < TIMING.SECURITY_COUNCIL_TARGET_NOMINEES) {
    stageBuilder.status("FAILED");
  }

  return {
    state: await addStage(state, stageBuilder.build()),
    continue: complete && memberProposalId !== null,
  };
}

async function trackMemberElectionStage(state: TrackingState): Promise<StageResult> {
  const electionIndex = getElectionIndex(state);
  const memberProposalId = getMemberProposalId(state);

  if (electionIndex === undefined || !memberProposalId) return { state, continue: false };

  log("MEMBER_ELECTION: tracking");

  const memberGovernorAddress = ADDRESSES.ELECTION_MEMBER_GOVERNOR;
  const memberGovernor = getMemberGovernor(memberGovernorAddress, state.providers.l2);

  const memberState: number = await queryWithRetry(() => memberGovernor.state(memberProposalId));
  const memberProposalState = proposalStateToString(memberState);

  const stageBuilder = new StageBuilder("MEMBER_ELECTION", "arb1").data({
    memberProposalId,
    proposalState: memberProposalState,
    winnersCount: 0,
  });

  let executed = false;
  let newState = state;

  if (memberProposalState === "Active" || memberProposalState === "Pending") {
    stageBuilder.status("PENDING");
  } else if (memberProposalState === "Succeeded") {
    stageBuilder.status("READY").executable(true);
  } else if (memberProposalState === "Executed") {
    stageBuilder.status("COMPLETED");
    executed = true;

    try {
      const executeEvent = await findElectionExecuteTxHash(
        memberProposalId,
        memberGovernorAddress,
        state.providers.l2,
        state.chunkingConfig.l2ChunkSize
      );
      if (executeEvent) {
        stageBuilder.tx(executeEvent.txHash, executeEvent.blockNumber, "arb1", 42161, {
          description: "executed",
        });

        // Find CallScheduled events and inject into state for timelock pipeline
        const callScheduledEvents = await findCallScheduledByTxHash(
          executeEvent.txHash,
          state.providers.l2
        );
        if (callScheduledEvents?.length) {
          const firstEvent = callScheduledEvents[0];
          stageBuilder.data({
            memberProposalId,
            proposalState: memberProposalState,
            winnersCount: 0,
            operationId: firstEvent.operationId,
            timelockAddress: firstEvent.timelockAddress,
          } as MemberElectionData);

          // Inject callScheduledData for timelock pipeline
          newState = { ...state, callScheduledData: callScheduledEvents };
        }
      }
    } catch {
      // TX hash discovery failed
    }
  } else if (memberProposalState === "Defeated" || memberProposalState === "Canceled") {
    stageBuilder.status("FAILED");
  }

  return {
    state: await addStage(newState, stageBuilder.build()),
    continue: executed,
  };
}

// ============================================================================
// Stage Configurations
// ============================================================================

const GOVERNOR_STAGES: StageConfig[] = [
  { type: "PROPOSAL_CREATED", track: trackProposalCreatedStage },
  { type: "VOTING_ACTIVE", track: trackVotingStage_ },
  { type: "PROPOSAL_QUEUED", track: trackProposalQueuedStage },
];

const TIMELOCK_STAGES: StageConfig[] = [
  {
    type: "L2_TIMELOCK",
    track: trackL2TimelockStage,
    // Custom cache: also check if we have callScheduledData
    checkCache: async (state) => {
      const timelockAddress = getTimelockAddress(state);
      const operationId = getOperationId(state);
      if (!timelockAddress || !operationId) return { state, continue: false };

      const cached = getCachedStage(state, "L2_TIMELOCK");
      if (cached?.status === "COMPLETED" || cached?.status === "SKIPPED") {
        log("L2_TIMELOCK: cached");
        return { state: await addStage(state, cached), continue: true };
      }
      return undefined; // Fall through to track
    },
  },
  {
    type: "L2_TO_L1_MESSAGE",
    track: trackL2ToL1MessageStage,
    // Custom cache: handle pending fast-path in track function
    checkCache: async (state) => {
      const cached = getCachedStage(state, "L2_TO_L1_MESSAGE");
      if (cached?.status === "COMPLETED" || cached?.status === "SKIPPED") {
        log("L2_TO_L1_MESSAGE: cached");
        return { state: await addStage(state, cached), continue: true };
      }
      return undefined;
    },
  },
  { type: "L1_TIMELOCK", track: trackL1TimelockStage },
  { type: "RETRYABLE_EXECUTED", track: trackRetryablesStage },
];

const ELECTION_STAGES: StageConfig[] = [
  { type: "CREATE_ELECTION", track: trackCreateElectionStage },
  { type: "NOMINEE_ELECTION", track: trackNomineeElectionStage },
  { type: "NOMINEE_VETTING", track: trackNomineeVettingStage },
  { type: "MEMBER_ELECTION", track: trackMemberElectionStage },
];

// ============================================================================
// Pipeline Exports
// ============================================================================

/**
 * Track governor proposal pipeline (stages 1-7).
 */
export async function trackGovernorPipeline(state: TrackingState): Promise<TrackingState> {
  logTracker("running governor pipeline");
  state = await runPipeline(state, GOVERNOR_STAGES);

  // Continue with timelock if proposal was queued
  const queued = state.stages.find((s) => s.type === "PROPOSAL_QUEUED");
  if (queued?.status === "COMPLETED") {
    return runPipeline(state, TIMELOCK_STAGES);
  }

  return state;
}

/**
 * Track timelock pipeline (stages 4-7).
 * Used by governor pipeline, election pipeline, and direct timelock tracking.
 */
export async function trackTimelockPipeline(state: TrackingState): Promise<TrackingState> {
  logTracker("running timelock pipeline");
  return runPipeline(state, TIMELOCK_STAGES);
}

/**
 * Track election pipeline (stages 1-8).
 */
export async function trackElectionPipeline(state: TrackingState): Promise<TrackingState> {
  logTracker("running election pipeline");
  state = await runPipeline(state, ELECTION_STAGES);

  // Continue with timelock if member election was executed
  const memberStage = state.stages.find((s) => s.type === "MEMBER_ELECTION");
  if (memberStage?.status === "COMPLETED") {
    return runPipeline(state, TIMELOCK_STAGES);
  }

  return state;
}
