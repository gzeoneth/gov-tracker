/**
 * L2 to L1 Message Stage Tracking and Preparation
 *
 * Stage 5: L2_TO_L1_MESSAGE - Unified cross-chain message tracking
 *
 * Status semantics:
 * - NOT_STARTED: No L2→L1 messages found or L2 timelock not executed
 * - PENDING: Message sent, in challenge period
 * - READY: Challenge period complete, ready to execute outbox
 * - COMPLETED: Outbox executed (message confirmed on L1)
 * - SKIPPED: L2-only path (Treasury Governor)
 *
 * Uses @arbitrum/sdk v4 for cross-chain message tracking.
 * Includes preparation functions for outbox execution.
 */

import { BigNumber, ethers } from "ethers";
import {
  ChildToParentMessageStatus,
  ChildToParentMessageReader,
  ChildTransactionReceipt,
  getArbitrumNetwork,
} from "@arbitrum/sdk";
import { ChildToParentMessageReaderNitro } from "@arbitrum/sdk/dist/lib/message/ChildToParentMessageNitro";
import { TrackedStage, TypedTrackedStage, PrepareResult, getStageData } from "../types";
import { ADDRESSES, BLOCK_TIMES, TIMING } from "../constants";
import { loggers } from "../utils/logger";

const logStage = loggers.stage.l2ToL1;
const logExecution = loggers.execution;
import {
  getBlockTimestamp,
  failPrepare,
  validateStageForSimpleBulk,
  simpleBulkError,
  SimpleBulkResult,
} from "./utils";
import { StageBuilder } from "./builder";
import { queryWithRetry } from "../utils/rpc-utils";
import { searchLogsInChunks } from "../utils/log-search";
import { filterLogs, parseLogsSafe } from "../utils/log-filters";
import { getCurrentBlockInfo, getL1BlockForL2Block } from "../utils/timing";
import { arbSysInterface, outboxInterface, outboxExecuteInterface } from "../abis";

const ARB_SYS_ADDRESS = ADDRESSES.ARB_SYS;

/**
 * Determine aggregate status from individual message statuses.
 * Priority: all EXECUTED > any UNCONFIRMED > all CONFIRMED/EXECUTED > first message's status
 */
function determineAggregateStatus(
  statuses: ChildToParentMessageStatus[]
): ChildToParentMessageStatus {
  const allExecuted = statuses.every((s) => s === ChildToParentMessageStatus.EXECUTED);
  if (allExecuted) return ChildToParentMessageStatus.EXECUTED;

  const anyUnconfirmed = statuses.some((s) => s === ChildToParentMessageStatus.UNCONFIRMED);
  if (anyUnconfirmed) return ChildToParentMessageStatus.UNCONFIRMED;

  const allConfirmedOrExecuted = statuses.every(
    (s) => s === ChildToParentMessageStatus.CONFIRMED || s === ChildToParentMessageStatus.EXECUTED
  );
  if (allConfirmedOrExecuted) return ChildToParentMessageStatus.CONFIRMED;

  return statuses[0];
}

/**
 * Find the L1 transaction that executed the L2→L1 message (OutBox execution).
 * Uses the message position to match OutBoxTransactionExecuted events.
 *
 * This transaction is important because:
 * 1. It confirms the L2→L1 message was executed
 * 2. It contains the CallScheduled event for the L1 timelock operation
 */
export async function findOutboxExecutionTransaction(
  messagePosition: BigNumber,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  options: {
    fromBlock: number;
    toBlock?: number;
    chunkSize?: number;
  }
): Promise<{ hash: string; blockNumber: number } | undefined> {
  const { blockNumber: currentBlock } = await getCurrentBlockInfo(l1Provider);

  // Get the Outbox address from Arbitrum network config
  let outboxAddress: string;
  try {
    const network = await getArbitrumNetwork(l2Provider);
    outboxAddress = network.ethBridge.outbox;
  } catch {
    outboxAddress = ADDRESSES.ARB1_OUTBOX;
  }

  const executedTopic = outboxInterface.getEventTopic("OutBoxTransactionExecuted");

  // Filter by destination = L1 Timelock (indexed)
  const toTopic = ethers.utils.hexZeroPad(ADDRESSES.L1_TIMELOCK.toLowerCase(), 32);

  const fromBlock = options.fromBlock;
  const toBlock = options.toBlock ?? currentBlock;

  logStage(
    "searching for OutBox execution: position=%s fromBlock=%d toBlock=%d",
    messagePosition.toString(),
    fromBlock,
    toBlock
  );

  const result = await searchLogsInChunks(
    l1Provider,
    {
      address: outboxAddress,
      topics: [executedTopic, toTopic],
      fromBlock,
      toBlock,
    },
    {
      chunkSize: options.chunkSize ?? 1000,
      delayBetweenChunks: 100,
      earlyExitCheck: (chunkLogs: ethers.providers.Log[]) => {
        for (const log of chunkLogs) {
          try {
            const parsed = outboxInterface.parseLog(log);
            if (parsed.args.transactionIndex.eq(messagePosition)) {
              return log;
            }
          } catch {
            // Continue to next log
          }
        }
        return undefined;
      },
    }
  );

  if (result.matchedLog) {
    logStage(
      "found OutBox execution tx=%s block=%d",
      result.matchedLog.transactionHash,
      result.matchedLog.blockNumber
    );
    return {
      hash: result.matchedLog.transactionHash,
      blockNumber: result.matchedLog.blockNumber,
    };
  }

  return undefined;
}

/**
 * Extract all message positions from L2ToL1Tx events in a transaction receipt.
 * The position uniquely identifies each message for matching on L1 OutBox execution.
 */
export function getAllMessagePositionsFromReceipt(
  receipt: ethers.providers.TransactionReceipt
): BigNumber[] {
  const l2ToL1TxTopic = arbSysInterface.getEventTopic("L2ToL1Tx");

  const matchingLogs = filterLogs(receipt.logs, {
    topic: l2ToL1TxTopic,
    address: ARB_SYS_ADDRESS,
  });

  return parseLogsSafe(matchingLogs, (log) => {
    const parsed = arbSysInterface.parseLog(log);
    return parsed.args.position as BigNumber;
  });
}

/**
 * Result from L2→L1 message stage tracking.
 */
export interface L2ToL1MessageResult {
  stage: TypedTrackedStage<"L2_TO_L1_MESSAGE">;
  messages: ChildToParentMessageReader[];
  messagePosition?: BigNumber;
  messagePositions: BigNumber[];
  l2ExecutionBlock?: number;
  isConfirmed: boolean;
  isExecuted: boolean;
  firstExecutableBlock?: number;
  l1SearchFromBlock?: number;
  /** OutBox execution transaction (contains L1 timelock CallScheduled event) */
  outboxExecutionTx?: { hash: string; blockNumber: number };
}

/**
 * Track L2→L1 message stage (Stage 5)
 *
 * Unified tracking of L2→L1 message lifecycle with status:
 * - NOT_STARTED: L2 timelock not executed or no messages found
 * - PENDING: Message sent, in challenge period
 * - READY: Challenge period complete, ready to execute outbox
 * - COMPLETED: Outbox executed (message confirmed on L1)
 * - SKIPPED: L2-only path
 *
 * Returns:
 * - `l1SearchFromBlock` - earliest L1 block where OutBox execution could occur
 * - `outboxExecutionTx` - the OutBox execution transaction (when status is COMPLETED)
 *
 * The OutBox execution transaction is important because it contains both:
 * 1. The confirmation that the L2→L1 message was executed
 * 2. The CallScheduled event for the L1 timelock operation
 */
export async function trackL2ToL1Message(
  executionTxHash: string,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider
): Promise<L2ToL1MessageResult> {
  const builder = new StageBuilder("L2_TO_L1_MESSAGE", "arb1");

  if (!executionTxHash) {
    return {
      stage: builder.status("NOT_STARTED").build(),
      messages: [],
      messagePositions: [],
      isConfirmed: false,
      isExecuted: false,
    };
  }

  // Get transaction receipt
  const receipt = await queryWithRetry(() => l2Provider.getTransactionReceipt(executionTxHash));

  if (!receipt) {
    return {
      stage: builder
        .status("NOT_STARTED")
        .data({ reason: "Transaction receipt not found" })
        .build(),
      messages: [],
      messagePositions: [],
      isConfirmed: false,
      isExecuted: false,
    };
  }

  // Extract all message positions for L1 matching
  const messagePositions = getAllMessagePositionsFromReceipt(receipt);
  const messagePosition = messagePositions[0];
  const l2ExecutionBlock = receipt.blockNumber;

  // Wrap receipt for Arbitrum SDK v4
  const childReceipt = new ChildTransactionReceipt(receipt);

  // Get L2→L1 messages from the receipt
  const messages = await queryWithRetry(() => childReceipt.getChildToParentMessages(l1Provider));

  if (messages.length === 0) {
    // No L2→L1 messages - this path doesn't go through L1
    return {
      stage: builder.skip("No L2→L1 messages in transaction").build(),
      messages: [],
      messagePositions: [],
      isConfirmed: false,
      isExecuted: false,
    };
  }

  // Store the L2ToL1Tx event for downstream salt computation
  const l2ToL1TxEvent = ((messages[0] as any).nitroReader as ChildToParentMessageReaderNitro).event;

  const l2Timestamp = await getBlockTimestamp(receipt.blockNumber, l2Provider);

  // Add data about the messages
  builder.data({
    messageCount: messages.length,
    l2Block: receipt.blockNumber,
    l2TxHash: executionTxHash,
    messagePositions: messagePositions.map((p) => p.toString()),
    hasMultipleMessages: messages.length > 1,
    l2ToL1TxEvent,
  });

  // Warn about multi-message limitation
  if (messages.length > 1) {
    logStage(
      "WARNING: Multiple L2→L1 messages detected (%d messages). " +
        "Only the first message's OutBox execution will be tracked for L1 timelock discovery. " +
        "Downstream stages (L1 timelock, retryables) for messages 2-%d may not be fully tracked. ",
      messages.length,
      messages.length
    );
  }

  // Check status of ALL messages - they may have different states
  const messageStatuses: ChildToParentMessageStatus[] = [];

  // ============================================================================
  // PERFORMANCE OPTIMIZATION: Cache sendProps from tracking for preparation phase
  // ============================================================================
  // The Arbitrum SDK's status() and getOutboxProof() both call getSendProps(),
  // which performs expensive RPC calls (~3-4s each) to find the assertion
  // containing this message. By extracting sendProps after status() and caching
  // them in stage.data, we can inject them during preparation to skip redundant work.
  //
  // This is a HACK that accesses SDK private fields. Assumptions:
  // 1. sendRootSize/sendRootHash are immutable once found - the Arbitrum rollup's
  //    sendCount is monotonically increasing, so once position < sendRootSize,
  //    this invariant holds forever
  // 2. SDK internal field names (sendRootSize, sendRootHash, sendRootConfirmed)
  //    remain stable across SDK versions
  // 3. The SDK's cache check: `if (this.sendRootConfirmed !== undefined)` continues
  //    to skip getSendProps when these fields are pre-populated
  //
  // If SDK internals change, this optimization will silently stop working (not break).
  // ============================================================================
  let cachedSendProps: { sendRootSize: string; sendRootHash: string } | undefined;

  for (const [i, message] of messages.entries()) {
    const status = await queryWithRetry(() => message.status(l2Provider));
    messageStatuses.push(status);

    // Extract sendProps from first message after status() populates the SDK's internal cache
    if (i === 0) {
      // Use nitroReader when available (Nitro-style networks), otherwise the message itself
      const reader = (message as any).nitroReader ?? message;
      const sendRootSize = reader.sendRootSize;
      const sendRootHash = reader.sendRootHash;
      if (sendRootSize && sendRootHash) {
        cachedSendProps = {
          sendRootSize: sendRootSize.toString(),
          sendRootHash: sendRootHash,
        };
      }
    }
  }

  const { blockNumber: currentL1Block, timestamp: currentTimestamp } =
    await getCurrentBlockInfo(l1Provider);

  // Determine aggregate status: EXECUTED only if all executed, UNCONFIRMED if any unconfirmed,
  // CONFIRMED if all confirmed/executed, else use first message's status
  const aggregateStatus = determineAggregateStatus(messageStatuses);

  // Calculate first executable block using simple formula instead of expensive SDK call
  // getFirstExecutableBlock() is very slow (~10s) due to SDK's binary search through assertion events
  // For ETA display purposes, the simple calculation is accurate enough
  const l1BlockAtL2Execution = await getL1BlockForL2Block(l2Provider, l2ExecutionBlock);
  const firstExecutableBlock = l1BlockAtL2Execution + TIMING.CHALLENGE_PERIOD_BLOCKS_L1;

  // Build per-message status details
  const messageDetails = messageStatuses.map((status, i) => ({
    index: i,
    status: ChildToParentMessageStatus[status],
  }));

  builder.data({
    status: ChildToParentMessageStatus[aggregateStatus],
    messageDetails,
    firstExecutableBlock,
    currentL1Block,
    cachedSendProps, // Cached from status() call, reused in preparation to avoid redundant RPC
  });

  // Use firstExecutableBlock as L1 search start (already calculated above)
  const l1SearchFromBlock = firstExecutableBlock;

  let outboxExecutionTx: { hash: string; blockNumber: number } | undefined;

  switch (aggregateStatus) {
    case ChildToParentMessageStatus.CONFIRMED:
      // Challenge period complete, ready to execute
      builder
        .status("READY")
        .tx(executionTxHash, receipt.blockNumber, "arb1", 42161, {
          timestamp: l2Timestamp,
          description: "L2 sent",
        })
        .timing({ startedAt: l2Timestamp });
      break;

    case ChildToParentMessageStatus.EXECUTED:
      // Already executed - find the OutBox execution transaction
      builder.status("COMPLETED").tx(executionTxHash, receipt.blockNumber, "arb1", 42161, {
        timestamp: l2Timestamp,
        description: "L2 sent",
      });

      if (messagePosition) {
        if (messages.length > 1) {
          logStage(
            "WARNING: Finding OutBox execution for first message only (position=%s). " +
              "%d additional messages have separate OutBox executions that will not be tracked.",
            messagePosition.toString(),
            messages.length - 1
          );
        }
        outboxExecutionTx = await findOutboxExecutionTransaction(
          messagePosition,
          l2Provider,
          l1Provider,
          { fromBlock: l1SearchFromBlock }
        );

        if (outboxExecutionTx) {
          const timestamp = await getBlockTimestamp(outboxExecutionTx.blockNumber, l1Provider);
          builder
            .tx(outboxExecutionTx.hash, outboxExecutionTx.blockNumber, "ethereum", 1, {
              timestamp,
              description: "L1 confirmed",
            })
            .timing({ startedAt: l2Timestamp });
        }
      }
      break;

    case ChildToParentMessageStatus.UNCONFIRMED: {
      // Still in challenge period
      builder.status("PENDING").tx(executionTxHash, receipt.blockNumber, "arb1", 42161, {
        timestamp: l2Timestamp,
        description: "L2 sent",
      });

      // Calculate remaining time until executable
      const remainingBlocks = Math.max(0, firstExecutableBlock - currentL1Block);
      const remainingSeconds = remainingBlocks * BLOCK_TIMES.L1;

      builder.timing({
        startedAt: l2Timestamp,
        eta: remainingSeconds > 0 ? currentTimestamp + remainingSeconds : undefined,
        delaySeconds: remainingSeconds,
      });
      break;
    }

    default:
      builder.status("NOT_STARTED");
  }

  return {
    stage: builder.build(),
    messages,
    messagePosition,
    messagePositions,
    l2ExecutionBlock,
    isConfirmed: aggregateStatus === ChildToParentMessageStatus.CONFIRMED,
    isExecuted: aggregateStatus === ChildToParentMessageStatus.EXECUTED,
    firstExecutableBlock,
    l1SearchFromBlock,
    outboxExecutionTx,
  };
}

// Outbox Preparation Functions

/**
 * Options for preparing L2→L1 messages
 */
export interface OutboxPrepareOptions {
  /** Prepare completed stages (for historical validation) */
  prepareCompleted?: boolean;
  /** Outbox contract address (resolved automatically if not provided) */
  outboxAddress?: string;
  /** Cached sendProps from tracking phase to avoid redundant getSendProps calls */
  cachedSendProps?: { sendRootSize: string; sendRootHash: string };
}

/**
 * Prepare an L2→L1 message for execution on L1.
 *
 * This generates the Merkle proof required for Outbox execution.
 * The proof is based on current L2 state and should be used promptly.
 */
export async function prepareL2ToL1Message(
  reader: ChildToParentMessageReaderNitro,
  l2Provider: ethers.providers.Provider,
  options: OutboxPrepareOptions = {}
): Promise<PrepareResult> {
  logExecution("Preparing L2→L1 message execution");

  // ============================================================================
  // PERFORMANCE OPTIMIZATION: Inject cached sendProps to skip redundant RPC calls
  // ============================================================================
  // This is a HACK that injects values into SDK private fields. The SDK's
  // getOutboxProof() calls getSendProps() internally, which checks:
  //   `if (this.sendRootConfirmed !== undefined) return cached`
  //
  // By pre-populating these fields with values cached during tracking phase,
  // we skip ~3-4 seconds of redundant RPC calls. This is safe because:
  // - sendRootSize/sendRootHash are immutable once the message is included
  // - We set sendRootConfirmed=true to trigger the SDK's cache hit path
  //
  // Why this matters for different paths:
  // - READY stage (CONFIRMED message): Nice-to-have. Without hack, status() would
  //   populate the cache and getOutboxProof() would use it. Hack saves ~3-4s by
  //   skipping the status() call entirely.
  // - PENDING stage (UNCONFIRMED message, --prepare-pending): ESSENTIAL. Without
  //   hack, status() sets sendRootConfirmed=undefined, so getOutboxProof() calls
  //   getSendProps() again (~3-4s wasted). Hack saves ~3-4s of duplicate work.
  //
  // See trackL2ToL1Message() for assumptions and risks of this approach.
  // ============================================================================
  if (options.cachedSendProps) {
    const { sendRootSize, sendRootHash } = options.cachedSendProps;
    (reader as any).sendRootSize = BigNumber.from(sendRootSize);
    (reader as any).sendRootHash = sendRootHash;
    (reader as any).sendRootConfirmed = true;
    logExecution("Using cached sendProps: size=%s", sendRootSize);
  }

  // Only check status if we need to validate (not in prepareCompleted mode)
  // This avoids a redundant SDK call since getOutboxProof also calls getSendProps internally
  if (!options.prepareCompleted && !options.cachedSendProps) {
    const status = await queryWithRetry(() => reader.status(l2Provider));
    logExecution("Message status: %s", ChildToParentMessageStatus[status]);

    if (status === ChildToParentMessageStatus.EXECUTED) {
      return failPrepare("Message already executed");
    }

    if (status !== ChildToParentMessageStatus.CONFIRMED) {
      return failPrepare(
        `Message not ready. Status: ${ChildToParentMessageStatus[status]}, expected: CONFIRMED`
      );
    }
  }

  // Get the outbox proof - with cached sendProps, this skips getSendProps and goes straight to proof generation
  logExecution("Generating outbox proof...");
  const proof = await reader.getOutboxProof(l2Provider);

  // Access event data from the Nitro reader
  const event = reader.event;

  // Get outbox address from options or fall back to default
  const outboxAddress = options.outboxAddress ?? ADDRESSES.ARB1_OUTBOX;
  if (!outboxAddress) {
    return failPrepare("Could not determine outbox address");
  }

  // Encode the executeTransaction call
  const calldata = outboxExecuteInterface.encodeFunctionData("executeTransaction", [
    proof,
    event.position,
    event.caller,
    event.destination,
    event.arbBlockNum,
    event.ethBlockNum,
    event.timestamp,
    event.callvalue,
    event.data,
  ]);

  return {
    success: true,
    prepared: {
      to: outboxAddress,
      data: calldata,
      value: "0",
      chain: "ethereum",
      chainId: 1,
      description: `Execute L2→L1 message #${event.position.toString()} via Outbox`,
    },
  };
}

/**
 * Get all L2→L1 messages from a transaction
 */
export async function getL2ToL1Messages(
  l2TxHash: string,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider
): Promise<ChildToParentMessageReader[]> {
  const receipt = await queryWithRetry(() => l2Provider.getTransactionReceipt(l2TxHash));
  if (!receipt) {
    return [];
  }

  const childReceipt = new ChildTransactionReceipt(receipt);
  return queryWithRetry(() => childReceipt.getChildToParentMessages(l1Provider));
}

/**
 * Prepare all L2→L1 messages from a stage for execution.
 *
 * Note: This uses internal SDK types. For simpler usage, consumers can use
 * the SDK's ChildToParentMessageWriter.execute() method directly.
 */
export async function prepareL2ToL1MessageStage(
  stage: TrackedStage,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  options: OutboxPrepareOptions = {}
): Promise<SimpleBulkResult> {
  const validationError = validateStageForSimpleBulk(stage, {
    prepareCompleted: options.prepareCompleted,
  });
  if (validationError) return validationError;

  const stageData = getStageData(stage, "L2_TO_L1_MESSAGE");
  if (!stageData?.l2TxHash) return simpleBulkError("L2 transaction hash not found");

  const readers = await getL2ToL1Messages(stageData.l2TxHash, l2Provider, l1Provider);
  if (readers.length === 0) return simpleBulkError("No L2→L1 messages found");

  // Resolve outbox address
  let outboxAddress = options.outboxAddress;
  if (!outboxAddress) {
    const network = await getArbitrumNetwork(l2Provider);
    outboxAddress = network.ethBridge.outbox;
  }

  // Extract cached sendProps from stage data (populated during tracking phase)
  const cachedSendProps = stageData.cachedSendProps as
    | { sendRootSize: string; sendRootHash: string }
    | undefined;

  logExecution("Preparing %d L2→L1 messages", readers.length);

  const prepareOptions = { ...options, outboxAddress, cachedSendProps };
  const results = await Promise.all(
    readers.map((reader) =>
      prepareL2ToL1Message(
        (reader as any).nitroReader as ChildToParentMessageReaderNitro,
        l2Provider,
        prepareOptions
      )
    )
  );

  return { total: readers.length, results };
}

// Re-export for convenience
export { ChildToParentMessageReader, ChildToParentMessageStatus };
