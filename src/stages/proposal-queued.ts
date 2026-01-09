/**
 * Proposal Queued Stage Tracking and Preparation
 *
 * Stage 3: Track when proposal is queued to timelock.
 * Includes preparation functions for queueing and executing proposals.
 */

import { BigNumber, ethers } from "ethers";
import { TypedTrackedStage, CallScheduledData, PrepareResult } from "../types";
import { PROPOSAL_STATE_MAP, PROPOSAL_STATE } from "../constants";
import { GOVERNOR_ABI, governorInterface } from "../abis";
import { checkVettingPeriod } from "../discovery/security-council";
import { loggers } from "../utils/logger";
import {
  getProposalState,
  findProposalQueuedEvent,
  getTimelockAddress,
} from "../discovery/governor-discovery";
import {
  findCallScheduledByTxHash,
  getL2TimelockForGovernor,
} from "../discovery/timelock-discovery";
import { serializeCallScheduledDataArray, getBlockTimestamp, failPrepare } from "./utils";
import { StageBuilder } from "./builder";

const logStage = loggers.stage.proposalQueued;
const logExecution = loggers.execution;

/**
 * Track proposal queued stage
 *
 * This stage links the Governor proposal to the Timelock operation
 */
export async function trackProposalQueued(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider,
  /** Block where proposal was created (from Stage 1) */
  fromBlock: number,
  options: {
    toBlock?: number;
    /** Voting end block - enables forward search optimization (queuing happens right after voting ends) */
    votingEndBlock?: number;
  } = {}
): Promise<{
  stage: TypedTrackedStage<"PROPOSAL_QUEUED">;
  timelockAddress?: string;
  operationId?: string;
  callScheduledData?: CallScheduledData[];
}> {
  const builder = new StageBuilder("PROPOSAL_QUEUED", "arb1");

  // Check proposal state
  const proposalState = await getProposalState(governorAddress, proposalId, provider);

  // If not yet queued, check state
  if (proposalState === "Pending" || proposalState === "Active") {
    return { stage: builder.status("NOT_STARTED").data({ proposalState }).build() };
  }

  if (proposalState === "Defeated" || proposalState === "Canceled") {
    return { stage: builder.data({ proposalState }).skip("Proposal did not pass").build() };
  }

  // Proposal is queued, executed, or succeeded - find the queue event
  const useForwardSearch = options.votingEndBlock !== undefined;
  const searchStart = options.votingEndBlock ?? fromBlock;

  logStage(
    "searching for ProposalQueued: startBlock=%d direction=%s",
    searchStart,
    useForwardSearch ? "forward" : "backward"
  );

  const queueEvent = await findProposalQueuedEvent(governorAddress, proposalId, provider, {
    startBlock: searchStart,
    endBlock: options.toBlock,
    direction: useForwardSearch ? "forward" : "backward",
  });

  if (!queueEvent) {
    // Succeeded but not yet queued - ready for execution
    if (proposalState === "Succeeded") {
      builder.status("READY").data({ proposalState, canQueue: true, governorAddress, proposalId });
    } else {
      builder.status("PENDING");
    }
    return { stage: builder.build() };
  }

  // Get timelock address
  let timelockAddress = getL2TimelockForGovernor(governorAddress);
  if (!timelockAddress) {
    timelockAddress = await getTimelockAddress(governorAddress, provider);
  }

  // Find the CallScheduled events from the queue transaction
  const callScheduledData = await findCallScheduledByTxHash(queueEvent.txHash, provider);
  const operationId = callScheduledData?.[0]?.operationId;
  const eta = queueEvent.eta.toNumber();
  const timestamp = await getBlockTimestamp(queueEvent.blockNumber, provider);

  // Stage is complete - proposal is queued
  builder
    .status("COMPLETED")
    .tx(queueEvent.txHash, queueEvent.blockNumber, "arb1", 42161, { timestamp })
    .timing({ startedAt: timestamp, eta })
    .data({
      proposalState,
      timelockAddress,
      operationId,
      eta,
      callCount: callScheduledData?.length ?? 0,
      callScheduledData: callScheduledData
        ? serializeCallScheduledDataArray(callScheduledData)
        : undefined,
    });

  return { stage: builder.build(), timelockAddress, operationId, callScheduledData };
}

// Governor Preparation Functions

export interface GovernorProposalParams {
  targets: string[];
  values: BigNumber[];
  calldatas: string[];
  descriptionHash: string;
}

/**
 * Prepare a queue transaction for a governor proposal.
 *
 * This is stage 3 preparation - queuing a succeeded proposal to the timelock.
 * The proposal must be in the "Succeeded" state (voting passed).
 */
export async function prepareGovernorQueue(
  governorAddress: string,
  proposalId: string,
  params: GovernorProposalParams,
  provider: ethers.providers.Provider
): Promise<PrepareResult> {
  logExecution("Preparing governor queue for proposal %s", proposalId);

  const governor = new ethers.Contract(governorAddress, GOVERNOR_ABI, provider);
  const state = await governor.state(proposalId);
  const stateName = PROPOSAL_STATE_MAP[state] ?? `Unknown(${state})`;
  logExecution("Proposal state: %s", stateName);

  // Already queued
  if (state === PROPOSAL_STATE.QUEUED) {
    return failPrepare("Proposal already queued");
  }

  // Must be in Succeeded state
  if (state !== PROPOSAL_STATE.SUCCEEDED) {
    return failPrepare(`Cannot queue: proposal not in Succeeded state (current: ${stateName})`);
  }

  // Check vetting period for governors that have it
  const vettingInfo = await checkVettingPeriod(governorAddress, proposalId, provider);
  if (vettingInfo.hasVettingPeriod && vettingInfo.isVettingActive) {
    return failPrepare(
      `Cannot queue: proposal is still in vetting period (deadline: block ${vettingInfo.vettingDeadline?.toString()})`
    );
  }

  // Build calldata
  const calldata = governorInterface.encodeFunctionData("queue", [
    params.targets,
    params.values,
    params.calldatas,
    params.descriptionHash,
  ]);

  return {
    success: true,
    prepared: {
      to: governorAddress,
      data: calldata,
      value: "0",
      chain: "arb1",
      chainId: 42161,
      description: `queue() on Governor (proposal ${proposalId})`,
      operationId: proposalId,
    },
  };
}
