/**
 * Unified Timelock Stage Tracking and Preparation
 *
 * Handles both L1 and L2 timelock operations with chain-specific configurations.
 * L2-specific: Security Council detection and enrichment
 * L1-specific: Operation ID discovery from OutBox execution
 */

import { ethers, BigNumber } from "ethers";
import {
  Chain,
  chainToChainId,
  TrackedStage,
  TimelockStageData,
  TimelockState,
  CallScheduledData,
  OperationState,
  PrepareResult,
  PrepareOptions,
  TimelockParams,
  TimelockBatchParams,
} from "../types";
import {
  getTimelockState,
  getTimelockOperationState,
  parseCallScheduledEvent,
} from "../discovery/timelock-discovery";
import {
  isSecurityCouncilOperation,
  extractSecurityCouncilParamsForOperation,
} from "../discovery/security-council";
import { validateSalt, validateSaltBatch } from "../utils/operation-id";
import { computeL2TimelockSalt, computeL1TimelockSalt } from "../utils/salt-computation";
import { INBOX_ABI, timelockInterface } from "../abis";
import { ADDRESSES, BLOCK_TIMES, EVENT_TOPICS } from "../constants";
import { getChain, addressEquals, compareBigNumbers } from "../utils/chain";
import {
  getBlockTimestamp,
  checkOperationReady,
  failPrepare,
  collectAllScheduledData,
  calculateTimelockEta,
  buildExecutionPayloadData,
  searchAndCompleteTimelockExecution,
  createTimelockStageData,
  validateStageForPrepare,
  serializeCallScheduledDataArray,
} from "./utils";
import { StageBuilder } from "./builder";
import { getCurrentBlockInfo, blockAfterDelay } from "../utils/timing";
import { queryWithRetry } from "../utils/rpc-utils";
import { loggers } from "../utils/logger";

const log = loggers.stage.timelock;
const logExecution = loggers.execution;

// ============================================================================
// Configuration Types and Constants
// ============================================================================

/**
 * Configuration for timelock tracking that differs between L1 and L2.
 */
type TimelockStageType = "L2_TIMELOCK" | "L1_TIMELOCK";

interface TimelockTrackingConfig {
  chain: Chain;
  stageType: TimelockStageType;
  blockTimeSeconds: number;
  logPrefix: string;
}

const L2_TIMELOCK_CONFIG: TimelockTrackingConfig = {
  chain: "arb1",
  stageType: "L2_TIMELOCK",
  blockTimeSeconds: BLOCK_TIMES.L2,
  logPrefix: "arb1",
};

const L1_TIMELOCK_CONFIG: TimelockTrackingConfig = {
  chain: "ethereum",
  stageType: "L1_TIMELOCK",
  blockTimeSeconds: BLOCK_TIMES.L1,
  logPrefix: "ethereum",
};

/**
 * Options for timelock stage tracking.
 */
interface TrackTimelockOptions {
  callScheduledData?: CallScheduledData;
  cachedExecutionTxHash?: string;
  /** Whether to check for Security Council enrichment (L2 only) */
  checkSecurityCouncil?: boolean;
  additionalPayload?: Record<string, unknown>;
  /** All tracked stages (used for salt computation from PROPOSAL_CREATED description or L2_TO_L1_MESSAGE event) */
  allStages?: TrackedStage[];
  /** Proposal type from PROPOSAL_CREATED stage - used to skip SC check for governor proposals */
  proposalType?: string;
  /** Override chunk size for log searches */
  chunkSize?: number;
}

/**
 * Result from timelock stage tracking.
 */
export interface TimelockStageResult {
  stage: TrackedStage;
  timelockState: TimelockState | null;
  operationState: OperationState | null;
  executionTxHash: string | null;
  executionBlock: number | null;
}

/**
 * Result from L1 timelock tracking (extends base result with L1-specific fields).
 */
export interface L1TimelockResult extends TimelockStageResult {
  l1OperationId: string | null;
  l1ScheduleTxHash: string | null;
  l1ScheduleBlock: number | null;
}

// ============================================================================
// L2-Specific: Security Council Handling
// ============================================================================

// Proposal types from governor contracts (not Security Council operations)
const GOVERNOR_PROPOSAL_TYPES = new Set(["CONSTITUTIONAL", "NON_CONSTITUTIONAL"]);

/**
 * Get Security Council enrichment data if applicable.
 * Returns data to merge into stage, or null if not a SC operation.
 *
 * Skips the check for known governor proposals to avoid unnecessary RPC call.
 */
async function getSecurityCouncilData(
  timelockState: TimelockState,
  operationId: string,
  provider: ethers.providers.Provider,
  proposalType?: string
): Promise<Record<string, unknown> | null> {
  // Skip for known governor proposals - they are never SC operations
  if (proposalType && GOVERNOR_PROPOSAL_TYPES.has(proposalType)) {
    return null;
  }

  const queueTxHash = timelockState.scheduledData?.txHash;
  if (!queueTxHash) return null;

  const receipt = await queryWithRetry(() => provider.getTransactionReceipt(queueTxHash));
  if (!isSecurityCouncilOperation(receipt)) return null;

  const scParams = extractSecurityCouncilParamsForOperation(receipt, operationId);
  if (!scParams) return null;

  return {
    isSecurityCouncilOperation: true,
    securityCouncilMembers: scParams.members,
    securityCouncilNonce: scParams.nonce.toString(),
  };
}

// ============================================================================
// L1-Specific: Operation ID Discovery
// ============================================================================

/**
 * Find L1 operation ID from a known OutBox execution transaction.
 */
export async function findL1OperationIdFromTx(
  outboxTxHash: string,
  outboxTxBlock: number,
  l1Provider: ethers.providers.Provider
): Promise<{
  l1OperationId: string | null;
  l1ScheduleTxHash: string;
  l1ScheduleBlock: number;
}> {
  const result = {
    l1OperationId: null as string | null,
    l1ScheduleTxHash: outboxTxHash,
    l1ScheduleBlock: outboxTxBlock,
  };
  const receipt = await queryWithRetry(() => l1Provider.getTransactionReceipt(outboxTxHash));
  if (!receipt) return result;

  const callScheduledLog = receipt.logs.find(
    (log) =>
      addressEquals(log.address, ADDRESSES.L1_TIMELOCK) &&
      log.topics[0] === EVENT_TOPICS.CALL_SCHEDULED
  );
  if (callScheduledLog) {
    const parsed = parseCallScheduledEvent(callScheduledLog);
    if (parsed) result.l1OperationId = parsed.operationId;
  }
  return result;
}

// ============================================================================
// Generic Tracking Function
// ============================================================================

/**
 * Unified timelock stage tracking.
 * Works for both L1 and L2 timelocks with configuration-driven differences.
 */
async function trackTimelock(
  config: TimelockTrackingConfig,
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider,
  fromBlock: number,
  options: TrackTimelockOptions = {}
): Promise<TimelockStageResult> {
  const builder = new StageBuilder(config.stageType, config.chain);

  if (!operationId) {
    return {
      stage: builder.status("NOT_STARTED").build(),
      timelockState: null,
      operationState: null,
      executionTxHash: null,
      executionBlock: null,
    };
  }

  const operationState = await getTimelockOperationState(timelockAddress, operationId, provider);

  if (!operationState.isOperation) {
    return {
      stage: builder
        .status("NOT_STARTED")
        .data({ operationId, reason: `${config.chain} operation not scheduled yet` })
        .build(),
      timelockState: null,
      operationState: null,
      executionTxHash: null,
      executionBlock: null,
    };
  }

  const timelockState = await getTimelockState(timelockAddress, operationId, provider, {
    fromBlock,
    scheduledData: options.callScheduledData,
    skipLogSearch: false,
    // Skip CallExecuted search here - we do an optimized search below starting after the delay
    skipExecutedSearch: true,
    chunkSize: options.chunkSize,
    contractState: operationState,
  });

  const { timestamp: currentTimestamp } = await getCurrentBlockInfo(provider);
  const eta = await calculateTimelockEta(timelockState, operationState, provider);

  // Add base data
  builder.data({ operationId, timelockAddress, state: operationState.state, eta });

  // Collect scheduled data - used for predecessor caching, batch detection, and calldata display
  const allData = collectAllScheduledData(timelockState);
  if (allData.length > 0) {
    builder.data({ callScheduledData: serializeCallScheduledDataArray(allData) });
  }

  // Check for Security Council enrichment (L2 only)
  // Skip for known governor proposals to avoid unnecessary RPC call
  if (options.checkSecurityCouncil) {
    const scData = await getSecurityCouncilData(
      timelockState,
      operationId,
      provider,
      options.proposalType
    );
    if (scData) {
      builder.data(scData);
    }
  }

  // Compute salt and predecessor, then validate operation type
  let salt = ethers.constants.HashZero;
  let predecessor = ethers.constants.HashZero;

  if (config.stageType === "L2_TIMELOCK") {
    const currentData = builder.build().data;
    salt = await computeL2TimelockSalt(currentData, options.allStages, provider);
    predecessor = allData[0]?.predecessor ?? ethers.constants.HashZero;
    builder.data({ salt, predecessor });
    log("%s: Computed salt: %s", config.logPrefix, salt.slice(0, 10) + "...");
  } else if (config.stageType === "L1_TIMELOCK") {
    const computed = computeL1TimelockSalt(options.allStages);
    salt = computed.salt;
    predecessor = computed.predecessor ?? ethers.constants.HashZero;
    builder.data({ salt, predecessor });
    log("%s: Computed salt: %s", config.logPrefix, salt.slice(0, 10) + "...");
  }

  // Determine if operation uses scheduleBatch or schedule by trying both validations
  if (allData.length > 0) {
    // Try batch validation first (common for L2 timelock)
    const targets = allData.map((d) => d.target);
    const values = allData.map((d) => d.value);
    const payloads = allData.map((d) => d.data);

    const isBatch = validateSaltBatch(operationId, {
      targets,
      values,
      payloads,
      predecessor,
      salt,
    });

    if (isBatch) {
      builder.data({ isBatchOperation: true });
      log("%s: Operation uses scheduleBatch", config.logPrefix);
    } else {
      // Try single validation
      const first = allData[0];
      const isSingle = validateSalt(operationId, {
        target: first.target,
        value: first.value,
        data: first.data,
        predecessor,
        salt,
      });

      if (isSingle) {
        builder.data({ isBatchOperation: false });
        log("%s: Operation uses schedule", config.logPrefix);
      } else {
        log(
          "%s: Warning - neither schedule nor scheduleBatch validation succeeded",
          config.logPrefix
        );
      }
    }
  }

  if (options.additionalPayload) {
    builder.data(options.additionalPayload);
  }

  // Add queue transaction if available (for all statuses where scheduled)
  let queueTimestamp: number | undefined;
  const scheduled = timelockState.scheduledData;
  if (scheduled?.txHash && scheduled.blockNumber !== undefined) {
    queueTimestamp = await getBlockTimestamp(scheduled.blockNumber, provider);
    const chainId = chainToChainId(config.chain);
    builder.tx(scheduled.txHash, scheduled.blockNumber, config.chain, chainId, {
      timestamp: queueTimestamp,
      description: "queued",
    });
  }

  // Determine status based on operation state
  // Priority: COMPLETED (isDone) > READY (isReady) > PENDING (isPending) > NOT_STARTED
  if (operationState.isDone) {
    let executionSearchStart = scheduled?.blockNumber ?? fromBlock;

    if (scheduled) {
      const delaySeconds = scheduled.delay.toNumber();
      if (delaySeconds > 0) {
        executionSearchStart = await blockAfterDelay(
          provider,
          scheduled.blockNumber,
          delaySeconds,
          config.blockTimeSeconds
        );
        log("%s execution search optimized: start=%d", config.logPrefix, executionSearchStart);
      }
    }

    if (options.cachedExecutionTxHash) {
      const cachedTxHash = options.cachedExecutionTxHash;
      const receipt = await queryWithRetry(() => provider.getTransactionReceipt(cachedTxHash));
      if (receipt) {
        const execTimestamp = await getBlockTimestamp(receipt.blockNumber, provider);
        const chainId = chainToChainId(config.chain);
        builder
          .status("COMPLETED")
          .tx(options.cachedExecutionTxHash, receipt.blockNumber, config.chain, chainId, {
            timestamp: execTimestamp,
            description: "executed",
          })
          .timing({ startedAt: queueTimestamp ?? execTimestamp })
          .data({ operationId });
        return {
          stage: builder.build(),
          timelockState,
          operationState,
          executionTxHash: options.cachedExecutionTxHash,
          executionBlock: receipt.blockNumber,
        };
      }
    }

    // searchAndCompleteTimelockExecution expects a stage, so build and pass
    const executionResult = await searchAndCompleteTimelockExecution(
      builder.build(),
      timelockAddress,
      operationId,
      provider,
      config.chain,
      executionSearchStart,
      undefined,
      queueTimestamp
    );

    return {
      stage: executionResult.stage,
      timelockState,
      operationState,
      executionTxHash: executionResult.executionTxHash,
      executionBlock: executionResult.executionBlock,
    };
  } else if (operationState.isReady) {
    builder.status("READY");

    if (queueTimestamp) {
      builder.timing({ startedAt: queueTimestamp });
    }

    // Build execution payload
    const executionPayload = buildExecutionPayloadData(timelockAddress, operationId, allData);
    builder.data(executionPayload);

    return {
      stage: builder.build(),
      timelockState,
      operationState,
      executionTxHash: null,
      executionBlock: null,
    };
  } else if (operationState.isPending) {
    builder.status("PENDING");

    if (queueTimestamp && eta) {
      const delayRemaining = eta - currentTimestamp;
      builder.timing({
        startedAt: queueTimestamp,
        eta,
        delaySeconds: delayRemaining > 0 ? delayRemaining : 0,
      });
    }

    builder.data({ waitingForDelay: true });
    return {
      stage: builder.build(),
      timelockState,
      operationState,
      executionTxHash: null,
      executionBlock: null,
    };
  }

  return {
    stage: builder.status("NOT_STARTED").build(),
    timelockState,
    operationState,
    executionTxHash: null,
    executionBlock: null,
  };
}

// ============================================================================
// Public Tracking Functions
// ============================================================================

/**
 * Track L2 timelock stage (Stage 4)
 */
export async function trackL2Timelock(
  timelockAddress: string,
  operationId: string,
  provider: ethers.providers.Provider,
  fromBlock: number,
  callScheduledData: CallScheduledData,
  options: {
    cachedExecutionTxHash?: string;
    allStages?: TrackedStage[];
    proposalType?: string;
    chunkSize?: number;
  } = {}
): Promise<TimelockStageResult> {
  return trackTimelock(L2_TIMELOCK_CONFIG, timelockAddress, operationId, provider, fromBlock, {
    callScheduledData,
    cachedExecutionTxHash: options.cachedExecutionTxHash,
    checkSecurityCouncil: true,
    allStages: options.allStages,
    proposalType: options.proposalType,
    chunkSize: options.chunkSize,
  });
}

/**
 * Track L1 timelock stage (Stage 6)
 */
export async function trackL1Timelock(
  l1Provider: ethers.providers.Provider,
  options: {
    outboxExecutionTx?: { hash: string; blockNumber: number } | null;
    fromBlock?: number;
    knownL1OperationId?: string;
    allStages?: TrackedStage[];
    chunkSize?: number;
  } = {}
): Promise<L1TimelockResult> {
  let l1OperationId = options.knownL1OperationId ?? null;
  let l1ScheduleBlock: number | null = null;
  let l1ScheduleTxHash: string | null = null;

  if (!l1OperationId && options.outboxExecutionTx) {
    log(
      "using OutBox tx from previous stage: %s block=%d",
      options.outboxExecutionTx.hash,
      options.outboxExecutionTx.blockNumber
    );
    const discovery = await findL1OperationIdFromTx(
      options.outboxExecutionTx.hash,
      options.outboxExecutionTx.blockNumber,
      l1Provider
    );
    l1OperationId = discovery.l1OperationId;
    l1ScheduleBlock = discovery.l1ScheduleBlock;
    l1ScheduleTxHash = discovery.l1ScheduleTxHash;
  }

  if (!l1OperationId) {
    const stage = new StageBuilder("L1_TIMELOCK", "ethereum")
      .status("NOT_STARTED")
      .data({
        reason: "L1 operation ID not yet discovered (challenge period may not be complete)",
      })
      .build();
    return {
      stage,
      timelockState: null,
      operationState: null,
      executionTxHash: null,
      executionBlock: null,
      l1OperationId: null,
      l1ScheduleTxHash: null,
      l1ScheduleBlock: null,
    };
  }

  const fromBlock = l1ScheduleBlock ?? options.fromBlock;
  if (fromBlock === undefined) {
    throw new Error("fromBlock is required for L1 timelock tracking");
  }

  const result = await trackTimelock(
    L1_TIMELOCK_CONFIG,
    ADDRESSES.L1_TIMELOCK,
    l1OperationId,
    l1Provider,
    fromBlock,
    { allStages: options.allStages, chunkSize: options.chunkSize }
  );

  return { ...result, l1OperationId, l1ScheduleTxHash, l1ScheduleBlock };
}

// ============================================================================
// Preparation Functions
// ============================================================================

/**
 * Calculate retryable execution value for L1 timelock operations.
 * @param gasPrice - Optional pre-fetched gas price to avoid redundant RPC calls in batch
 */
export async function calculateRetryableExecutionValue(
  target: string,
  data: string,
  provider: ethers.providers.Provider,
  gasPrice?: BigNumber
): Promise<BigNumber | null> {
  if (!addressEquals(target, ADDRESSES.RETRYABLE_TICKET_MAGIC)) {
    return null;
  }

  let decoded: ethers.utils.Result;
  try {
    decoded = ethers.utils.defaultAbiCoder.decode(
      ["address", "address", "uint256", "uint256", "uint256", "bytes"],
      data
    );
  } catch {
    return null;
  }

  const inboxAddress = decoded[0] as string;
  const innerValue = decoded[2] as BigNumber;
  const innerGasLimit = decoded[3] as BigNumber;
  const innerMaxFeePerGas = decoded[4] as BigNumber;
  const innerData = decoded[5] as string;

  const inbox = new ethers.Contract(inboxAddress, INBOX_ABI, provider);
  const resolvedGasPrice = gasPrice ?? (await queryWithRetry(() => provider.getGasPrice()));
  const dataLength = ethers.utils.hexDataLength(innerData);

  const submissionFee = await queryWithRetry<BigNumber>(() =>
    inbox.callStatic.calculateRetryableSubmissionFee(dataLength, resolvedGasPrice)
  );

  return submissionFee.mul(2).add(innerGasLimit.mul(innerMaxFeePerGas)).add(innerValue);
}

/**
 * Calculate batch retryable values for L1 timelock.
 * Fetches gas price once and reuses for all retryable calculations.
 */
export async function calculateBatchRetryableValues(
  targets: string[],
  values: BigNumber[],
  payloads: string[],
  provider: ethers.providers.Provider
): Promise<BigNumber[]> {
  // Fetch gas price once for the entire batch
  const gasPrice = await queryWithRetry(() => provider.getGasPrice());

  const results = await Promise.all(
    targets.map((target, i) =>
      calculateRetryableExecutionValue(target, payloads[i], provider, gasPrice)
    )
  );
  return results.map((retryableValue, i) => retryableValue ?? values[i]);
}

/**
 * Shared pre-checks for timelock prepare functions.
 * Returns salt, predecessor, and any early error result.
 */
async function timelockPreparePreChecks(
  timelockAddress: string,
  operationId: string,
  stageData: TimelockStageData,
  provider: ethers.providers.Provider,
  options: PrepareOptions
): Promise<{ salt: string; predecessor: string; error?: PrepareResult }> {
  const salt = options.salt ?? stageData.salt ?? ethers.constants.HashZero;
  const predecessor = options.predecessor ?? stageData.predecessor ?? ethers.constants.HashZero;

  if (!options.prepareCompleted) {
    const stateError = await checkOperationReady(timelockAddress, operationId, provider);
    if (stateError) return { salt, predecessor, error: stateError };
  }

  return { salt, predecessor };
}

function saltValidationError(
  operationId: string,
  salt: string,
  label = "operation"
): PrepareResult {
  return failPrepare(
    `Salt validation failed for ${label} ${operationId}. ` +
      `Cached salt ${salt} does not produce the expected operation ID. ` +
      `This may indicate incorrect salt computation during tracking. ` +
      `Override with options.salt if needed.`
  );
}

/**
 * Prepare a single timelock operation for execution.
 */
export async function prepareTimelockOperation(
  timelockAddress: string,
  params: TimelockParams,
  operationId: string,
  stageData: TimelockStageData,
  provider: ethers.providers.Provider,
  options: PrepareOptions = {}
): Promise<PrepareResult> {
  logExecution("Preparing timelock operation %s", operationId);

  const { salt, predecessor, error } = await timelockPreparePreChecks(
    timelockAddress,
    operationId,
    stageData,
    provider,
    options
  );
  if (error) return error;

  if (!options.skipSaltValidation) {
    const isValid = validateSalt(operationId, {
      target: params.target,
      value: params.value,
      data: params.data,
      predecessor,
      salt,
    });
    if (!isValid) return saltValidationError(operationId, salt);
  }

  const retryableValue = !options.skipRetryableValueCalculation
    ? await calculateRetryableExecutionValue(params.target, params.data, provider)
    : null;
  const executionValue = retryableValue ?? params.value;

  const chain = await getChain(provider);
  const calldata = timelockInterface.encodeFunctionData("execute", [
    params.target,
    params.value,
    params.data,
    predecessor,
    salt,
  ]);

  return {
    success: true,
    prepared: {
      to: timelockAddress,
      data: calldata,
      value: executionValue.toString(),
      chain,
      chainId: chainToChainId(chain),
      description: `execute() on ${chain} timelock`,
      operationId,
    },
  };
}

/**
 * Prepare a batch timelock operation for execution.
 */
export async function prepareTimelockBatch(
  timelockAddress: string,
  params: TimelockBatchParams,
  operationId: string,
  stageData: TimelockStageData,
  provider: ethers.providers.Provider,
  options: PrepareOptions = {}
): Promise<PrepareResult> {
  logExecution("Preparing timelock batch %s", operationId);

  if (!params.targets?.length) {
    return failPrepare("Batch must have at least one target");
  }
  if (
    params.targets.length !== params.values.length ||
    params.targets.length !== params.payloads.length
  ) {
    return failPrepare("Array length mismatch in batch params");
  }

  const { salt, predecessor, error } = await timelockPreparePreChecks(
    timelockAddress,
    operationId,
    stageData,
    provider,
    options
  );
  if (error) return error;

  if (!options.skipSaltValidation) {
    const isValid = validateSaltBatch(operationId, {
      targets: params.targets,
      values: params.values,
      payloads: params.payloads,
      predecessor,
      salt,
    });
    if (!isValid) return saltValidationError(operationId, salt, "batch operation");
  }

  let executionValues = params.values;
  if (!options.skipRetryableValueCalculation) {
    executionValues = await calculateBatchRetryableValues(
      params.targets,
      params.values,
      params.payloads,
      provider
    );
  }
  const totalValue = executionValues.reduce((acc, v) => acc.add(v), BigNumber.from(0));

  const chain = await getChain(provider);
  const calldata = timelockInterface.encodeFunctionData("executeBatch", [
    params.targets,
    params.values,
    params.payloads,
    predecessor,
    salt,
  ]);

  return {
    success: true,
    prepared: {
      to: timelockAddress,
      data: calldata,
      value: totalValue.toString(),
      chain,
      chainId: chainToChainId(chain),
      description: `executeBatch() on ${chain} timelock`,
      operationId,
    },
  };
}

/**
 * Prepare a timelock stage for execution (auto-detects single vs batch).
 *
 * @param stage - The timelock stage to prepare (salt should be pre-computed in stage.data)
 * @param provider - Provider for the chain where timelock is deployed
 * @param options - Preparation options (can override salt with options.salt)
 */
export async function prepareTimelockStage(
  stage: TrackedStage,
  provider: ethers.providers.Provider,
  options: PrepareOptions = {}
): Promise<PrepareResult> {
  const validationError = validateStageForPrepare(stage, {
    prepareCompleted: options.prepareCompleted,
  });
  if (validationError) return validationError;

  // Get execution payload (for targets, values, payloads)
  const execPayload = createTimelockStageData(stage);
  if (!execPayload) {
    return failPrepare("Stage is not a timelock stage");
  }

  const { timelockAddress, operationId } = execPayload;
  if (!timelockAddress || !operationId) {
    return failPrepare("Missing timelock address or operation ID");
  }

  const { callScheduledData } = execPayload;
  if (!callScheduledData?.length) {
    return failPrepare("Missing callScheduledData for preparation");
  }

  // Get full stage data for salt/predecessor (cast - we verified it's a timelock stage)
  const timelockStageData = stage.data as TimelockStageData;

  const sortedData = [...callScheduledData].sort((a, b) => compareBigNumbers(a.index, b.index));
  const targets = sortedData.map((d) => d.target);
  const values = sortedData.map((d) => d.value.toString());
  const payloads = sortedData.map((d) => d.data);
  const predecessor = sortedData[0].predecessor;

  const resolvedPredecessor = options.predecessor ?? predecessor ?? ethers.constants.HashZero;

  // Use cached isBatchOperation to determine which method to use
  // Fallback to count-based logic if not cached
  const useBatch = timelockStageData.isBatchOperation ?? targets.length > 1;

  if (useBatch) {
    return prepareTimelockBatch(
      timelockAddress,
      {
        targets,
        values: values.map((v) => BigNumber.from(v)),
        payloads,
        predecessor: resolvedPredecessor,
        salt: "",
      },
      operationId,
      timelockStageData,
      provider,
      options
    );
  }

  return prepareTimelockOperation(
    timelockAddress,
    {
      target: targets[0],
      value: BigNumber.from(values[0]),
      data: payloads[0],
      predecessor: resolvedPredecessor,
      salt: "",
    },
    operationId,
    timelockStageData,
    provider,
    options
  );
}
