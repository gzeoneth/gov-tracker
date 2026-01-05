/**
 * Stage Helpers
 *
 * Utility functions for timelock stage operations and validation.
 */

import { ethers } from "ethers";
import {
  TrackedStage,
  PrepareResult,
  getStageData,
  StageType,
  ChainType,
  L2TimelockData,
  L1TimelockData,
  CallScheduledData,
  TimelockState,
  OperationState,
} from "../types";
import {
  calculateEtaFromScheduledData,
  failPrepare,
  getBlockTimestamp,
  TIMELOCK_STAGE_TYPES,
  serializeCallScheduledDataArray,
  deserializeCallScheduledDataArray,
} from "../stages/base";
import { StageBuilder } from "../stages/stage-builder";
import { findCallExecutedEvent } from "../discovery/timelock-discovery";

// Re-export serialization from base for backwards compatibility
export {
  serialize,
  deserialize,
  serializeCallScheduledData,
  deserializeCallScheduledData,
  serializeCallScheduledDataArray,
  deserializeCallScheduledDataArray,
} from "../stages/base";

// ============================================================================
// Timelock Execution Payload
// ============================================================================

/** Execution payload data for timelock operations. */
export interface TimelockExecutionPayload {
  timelockAddress: string;
  operationId: string;
  callScheduledData: CallScheduledData[];
  isSecurityCouncilOperation?: boolean;
  securityCouncilMembers?: string[];
  securityCouncilNonce?: string;
}

/** Extract timelock execution payload from a stage. */
export function createTimelockStageData(stage: TrackedStage): TimelockExecutionPayload | null {
  let stageData: L2TimelockData | L1TimelockData | null = null;
  for (const stageType of TIMELOCK_STAGE_TYPES) {
    stageData = getStageData(stage, stageType);
    if (stageData) break;
  }

  if (
    !stageData?.timelockAddress ||
    !stageData?.operationId ||
    !stageData?.callScheduledData?.length
  ) {
    return null;
  }

  const payload: TimelockExecutionPayload = {
    timelockAddress: stageData.timelockAddress,
    operationId: stageData.operationId,
    callScheduledData: deserializeCallScheduledDataArray(stageData.callScheduledData),
  };

  if (stageData.isSecurityCouncilOperation) {
    payload.isSecurityCouncilOperation = true;
    payload.securityCouncilMembers = stageData.securityCouncilMembers;
    payload.securityCouncilNonce = stageData.securityCouncilNonce;
  }

  return payload;
}

// ============================================================================
// Timelock State Helpers
// ============================================================================

/** Collect all CallScheduledData from a timelock state. */
export function collectAllScheduledData(timelockState: TimelockState): CallScheduledData[] {
  return (
    timelockState.allScheduledData ??
    (timelockState.scheduledData ? [timelockState.scheduledData] : [])
  );
}

/** Calculate ETA for a timelock operation. */
export async function calculateTimelockEta(
  timelockState: TimelockState,
  operationState: OperationState,
  provider: ethers.providers.Provider
): Promise<number | undefined> {
  if (timelockState.scheduledData) {
    return calculateEtaFromScheduledData(
      timelockState.scheduledData.blockNumber,
      timelockState.scheduledData.delay.toNumber(),
      provider
    );
  }
  const contractTimestamp = operationState.timestamp.toNumber();
  return !operationState.isDone && contractTimestamp > 1 ? contractTimestamp : undefined;
}

/** Build serialized execution payload data for stage storage. */
export function buildExecutionPayloadData(
  timelockAddress: string,
  operationId: string,
  allScheduledData: CallScheduledData[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = { timelockAddress, operationId };
  if (allScheduledData.length > 0) {
    payload.callScheduledData = serializeCallScheduledDataArray(allScheduledData);
  }
  return payload;
}

// ============================================================================
// Validation Helpers
// ============================================================================

export interface PrepareValidationOptions {
  force?: boolean;
  expectedTypes?: StageType[];
}

/** Validate stage for preparation. Returns error or null if valid. */
export function validateStageForPrepare(
  stage: TrackedStage,
  options: PrepareValidationOptions = {}
): PrepareResult | null {
  if (!options.force && stage.status !== "READY") {
    return failPrepare(`Stage is not ready. Current status: ${stage.status}`);
  }
  if (options.expectedTypes?.length && !options.expectedTypes.includes(stage.type)) {
    return failPrepare(
      `Unexpected stage type: ${stage.type}. Expected: ${options.expectedTypes.join(", ")}`
    );
  }
  return null;
}

export interface BulkPrepareResult<T extends ChainType = ChainType> {
  total: number;
  results: PrepareResult[];
  targetChain: T;
}

export interface SimpleBulkResult {
  total: number;
  results: PrepareResult[];
}

export function bulkPrepareError<T extends ChainType>(
  error: string,
  targetChain: T
): BulkPrepareResult<T> {
  return { total: 0, results: [{ success: false, error }], targetChain };
}

export function simpleBulkError(error: string): SimpleBulkResult {
  return { total: 0, results: [{ success: false, error }] };
}

export function validateStageForBulkPrepare<T extends ChainType>(
  stage: TrackedStage,
  targetChain: T,
  options: PrepareValidationOptions = {}
): BulkPrepareResult<T> | null {
  const error = validateStageForPrepare(stage, options);
  return error ? { total: 0, results: [error], targetChain } : null;
}

export function validateStageForSimpleBulk(
  stage: TrackedStage,
  options: PrepareValidationOptions = {}
): SimpleBulkResult | null {
  const error = validateStageForPrepare(stage, options);
  return error ? { total: 0, results: [error] } : null;
}

// ============================================================================
// Execution Search Helper
// ============================================================================

/** Search for timelock execution event and complete stage. */
export async function searchAndCompleteTimelockExecution(
  stage: TrackedStage,
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider,
  chain: ChainType,
  fromBlock: number,
  toBlock?: number,
  queueTimestamp?: number
): Promise<{ stage: TrackedStage; executionTxHash: string | null; executionBlock: number | null }> {
  const event = await findCallExecutedEvent(timelockAddress, operationId, provider, {
    startBlock: fromBlock,
    endBlock: toBlock,
  });

  const builder = new StageBuilder(stage.type, stage.chain)
    .data(stage.data)
    .transactions(stage.transactions);

  if (stage.timing) builder.timing(stage.timing);

  if (event) {
    const execTimestamp = await getBlockTimestamp(event.blockNumber, provider);
    builder
      .status("COMPLETED")
      .tx(event.txHash, event.blockNumber, chain, {
        timestamp: execTimestamp,
        description: "executed",
      })
      .timing({ startedAt: queueTimestamp ?? execTimestamp })
      .data({ operationId });
    return {
      stage: builder.build(),
      executionTxHash: event.txHash,
      executionBlock: event.blockNumber,
    };
  }

  return {
    stage: builder
      .status("COMPLETED")
      .data({ operationId, note: "Execution confirmed by state, event not found" })
      .build(),
    executionTxHash: null,
    executionBlock: null,
  };
}
