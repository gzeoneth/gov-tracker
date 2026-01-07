/**
 * Retryable Ticket Stage Tracking and Preparation
 *
 * Stage 7: Retryable Executed
 *
 * Uses @arbitrum/sdk v4 for retryable ticket tracking.
 * Supports both Arbitrum One and Nova as target chains.
 * Includes preparation functions for retryable redemption.
 */

import { ethers } from "ethers";
import {
  ParentToChildMessageStatus,
  ParentTransactionReceipt,
  ParentToChildMessageReader,
} from "@arbitrum/sdk";
import { TrackedStage, ChainId, L2Chain, PrepareResult } from "../types";
import { getChain, getChainId } from "../utils/chain";
import { loggers } from "../utils/logger";

const log = loggers.retryables;
import { arbRetryableInterface } from "../abis";
import { ADDRESSES, EVENT_TOPICS, TIMING } from "../constants";
import { getBlockTimestamp, failPrepare } from "./base";
import { StageBuilder } from "./stage-builder";
import { queryWithRetry } from "../utils/rpc-utils";
import { countLogsByAddress } from "../utils/log-filters";
import {
  validateStageForBulkPrepare,
  bulkPrepareError,
  BulkPrepareResult,
} from "../utils/stage-helpers";

/** Creation details for a retryable ticket */
interface CreationDetail {
  index: number;
  targetChain: L2Chain;
  targetChainId: ChainId;
  l2TxHash: string;
}

/** Redemption details for a retryable ticket */
interface RedemptionDetail {
  index: number;
  targetChain: L2Chain;
  targetChainId: ChainId;
  status: string;
  l2TxHash: string | null;
}

/**
 * Result of detecting retryable target chains, including message counts
 */
export interface RetryableTargetInfo {
  chain: L2Chain;
  inboxAddress: string;
  messageCount: number;
}

/**
 * Detect ALL L2 chains that retryables target based on the delayed inboxes used,
 * including the count of messages per chain.
 *
 * The L1 transaction can send messages through multiple Delayed Inboxes:
 * - ARB1_DELAYED_INBOX (0x4Dbd4fc...) → targets Arbitrum One
 * - NOVA_DELAYED_INBOX (0xc4448b7...) → targets Arbitrum Nova
 *
 * A single L1 transaction may create retryables for BOTH chains.
 */
export async function detectAllRetryableTargetChains(
  l1TxHash: string,
  l1Provider: ethers.providers.Provider
): Promise<RetryableTargetInfo[]> {
  const receipt = await queryWithRetry(() => l1Provider.getTransactionReceipt(l1TxHash));

  if (!receipt) {
    return [];
  }

  // Count InboxMessageDelivered events grouped by inbox address
  const counts = countLogsByAddress(receipt.logs, { topic: EVENT_TOPICS.TICKET_CREATED });

  const arb1Count = counts.get(ADDRESSES.ARB1_DELAYED_INBOX.toLowerCase()) ?? 0;
  const novaCount = counts.get(ADDRESSES.NOVA_DELAYED_INBOX.toLowerCase()) ?? 0;

  const targets: RetryableTargetInfo[] = [];

  if (arb1Count > 0) {
    targets.push({
      chain: "arb1",
      inboxAddress: ADDRESSES.ARB1_DELAYED_INBOX,
      messageCount: arb1Count,
    });
  }

  if (novaCount > 0) {
    targets.push({
      chain: "nova",
      inboxAddress: ADDRESSES.NOVA_DELAYED_INBOX,
      messageCount: novaCount,
    });
  }

  return targets;
}

/**
 * Options for tracking retryables
 */
export interface TrackRetryablesOptions {
  /** Provider for Arbitrum One (l2Provider) - required for Arb1-targeting retryables */
  l2Provider: ethers.providers.Provider;
  /** Provider for Arbitrum Nova - optional for Nova-targeting retryables */
  novaProvider?: ethers.providers.Provider;
}

/**
 * Track retryable execution stage
 *
 * Automatically detects ALL L2 chains the retryables target (Arb1 and/or Nova)
 * based on which Delayed Inbox contracts were used on L1.
 * A single L1 transaction may create retryables for BOTH chains.
 *
 * @param l1ExecutionTxHash - L1 timelock execution transaction hash
 * @param l1Provider - Ethereum L1 provider
 * @param options - L2 provider options (l2Provider required, novaProvider optional)
 */
export async function trackRetryables(
  l1ExecutionTxHash: string,
  l1Provider: ethers.providers.Provider,
  options: TrackRetryablesOptions
): Promise<{
  stage: TrackedStage;
  messages: ParentToChildMessageReader[];
  isComplete: boolean;
  /** All target chains for retryables (can be both arb1 and nova) */
  targetChains: L2Chain[];
}> {
  const { l2Provider, novaProvider } = options;

  // Detect ALL chains that the retryables target
  const targetInfos = await detectAllRetryableTargetChains(l1ExecutionTxHash, l1Provider);

  // No retryables found
  if (targetInfos.length === 0) {
    return {
      stage: new StageBuilder("RETRYABLE_EXECUTED", "arb1")
        .skip("No retryable tickets in transaction")
        .build(),
      messages: [],
      isComplete: true,
      targetChains: [],
    };
  }

  // Get L1 receipt once (shared across all chains)
  const l1Receipt = await queryWithRetry(() => l1Provider.getTransactionReceipt(l1ExecutionTxHash));
  if (!l1Receipt) {
    return {
      stage: new StageBuilder("RETRYABLE_EXECUTED", "arb1")
        .skip("L1 transaction receipt not found")
        .build(),
      messages: [],
      isComplete: true,
      targetChains: [],
    };
  }
  const l1Timestamp = await getBlockTimestamp(l1Receipt.blockNumber, l1Provider);

  // Collect results from all target chains
  const allMessages: ParentToChildMessageReader[] = [];
  const allCreationDetails: CreationDetail[] = [];
  const allRedemptionDetails: RedemptionDetail[] = [];
  const allTransactions: TrackedStage["transactions"] = [
    {
      hash: l1ExecutionTxHash,
      blockNumber: l1Receipt.blockNumber,
      chain: "ethereum",
      chainId: 1,
      timestamp: l1Timestamp,
      logIndex: 0,
      description: "L1 executed",
    },
  ];
  let allRedeemed = true;
  let anyFailed = false;

  for (const { chain: targetChain, messageCount } of targetInfos) {
    const provider = targetChain === "nova" ? novaProvider : l2Provider;
    const chainName: L2Chain = targetChain;
    const chainId = targetChain === "nova" ? 42170 : 42161;

    // Handle missing provider
    if (!provider) {
      log(
        "No provider for %s, marking %d tickets as PROVIDER_NOT_AVAILABLE",
        chainName,
        messageCount
      );
      for (let i = 0; i < messageCount; i++) {
        allCreationDetails.push({
          index: allCreationDetails.length,
          targetChain: chainName,
          targetChainId: chainId,
          l2TxHash: "unknown",
        });
        allRedemptionDetails.push({
          index: allRedemptionDetails.length,
          targetChain: chainName,
          targetChainId: chainId,
          status: "PROVIDER_NOT_AVAILABLE",
          l2TxHash: null,
        });
      }
      allRedeemed = false;
      continue;
    }

    // Get messages for this chain
    const parentReceipt = new ParentTransactionReceipt(l1Receipt);
    const messages = await parentReceipt.getParentToChildMessages(provider);
    allMessages.push(...messages);

    // Add creation details and transactions
    for (const msg of messages) {
      allCreationDetails.push({
        index: allCreationDetails.length,
        targetChain: chainName,
        targetChainId: chainId,
        l2TxHash: msg.retryableCreationId,
      });
      allTransactions.push({
        hash: msg.retryableCreationId,
        blockNumber: 0,
        chain: chainName,
        chainId,
        timestamp: l1Timestamp,
        logIndex: allTransactions.length,
        targetChain: chainName,
        targetChainId: chainId,
        description: `${chainName} created`,
      });
    }

    // Check redemption status in parallel
    // Track fetch errors separately from legitimate "not yet created" status
    type FetchError = { __fetchError: true; message: string };
    const redeemResults = await Promise.all(
      messages.map((message, idx) =>
        queryWithRetry(() => message.getSuccessfulRedeem()).catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          log("Warning: failed to get redeem status for message %d: %s", idx, errMsg);
          return { __fetchError: true, message: errMsg } as FetchError;
        })
      )
    );

    for (let i = 0; i < messages.length; i++) {
      const redeemResult = redeemResults[i];
      const isFetchError = redeemResult && "__fetchError" in redeemResult;
      if (isFetchError) {
        // Fetch error - treat as inconclusive, don't mark as redeemed
        allRedeemed = false;
        allRedemptionDetails.push({
          index: allRedemptionDetails.length,
          targetChain: chainName,
          targetChainId: chainId,
          status: "FETCH_ERROR",
          l2TxHash: null,
        });
        continue;
      }

      const status = redeemResult?.status ?? ParentToChildMessageStatus.NOT_YET_CREATED;
      const statusName = ParentToChildMessageStatus[status];
      let l2TxHash: string | null = null;

      if (
        status === ParentToChildMessageStatus.REDEEMED &&
        redeemResult &&
        "childTxReceipt" in redeemResult &&
        redeemResult.childTxReceipt
      ) {
        const { transactionHash, blockNumber } = redeemResult.childTxReceipt;
        l2TxHash = transactionHash;
        const timestamp = await getBlockTimestamp(blockNumber, provider);
        allTransactions.push({
          hash: transactionHash,
          blockNumber,
          chain: chainName,
          chainId,
          timestamp,
          logIndex: allTransactions.length,
          targetChain: chainName,
          targetChainId: chainId,
          description: `${chainName} redeemed`,
        });
      } else if (status === ParentToChildMessageStatus.EXPIRED) {
        anyFailed = true;
        allRedeemed = false;
      } else if (status !== ParentToChildMessageStatus.REDEEMED) {
        allRedeemed = false;
      }

      allRedemptionDetails.push({
        index: allRedemptionDetails.length,
        targetChain: chainName,
        targetChainId: chainId,
        status: statusName,
        l2TxHash,
      });
    }
  }

  // Collect unique target chains
  const targetChains = [...new Set(targetInfos.map((t) => t.chain))];
  const targetChainIds = [...new Set(targetInfos.map((t) => (t.chain === "nova" ? 42170 : 42161)))];

  // Determine overall status and build stage using StageBuilder
  // Note: chain is "arb1" because retryable redemption executes on L2 chains (Arb1/Nova)
  const status = anyFailed ? "FAILED" : allRedeemed ? "COMPLETED" : "READY";
  const builder = new StageBuilder("RETRYABLE_EXECUTED", "arb1")
    .status(status)
    .transactions(allTransactions)
    .timing({ startedAt: l1Timestamp })
    .data({
      ticketCount: allCreationDetails.length,
      targetChains,
      targetChainIds,
      creationDetails: allCreationDetails,
      redemptionDetails: allRedemptionDetails,
      redeemedCount: allRedemptionDetails.filter((d) => d.status === "REDEEMED").length,
      pendingCount: allRedemptionDetails.filter(
        (d) => d.status === "FUNDS_DEPOSITED_ON_CHILD" || d.status === "NOT_YET_CREATED"
      ).length,
      statuses: allRedemptionDetails.map((d) => d.status),
    });

  if (status === "READY") {
    builder.executable(true).timing({ delaySeconds: TIMING.RETRYABLE_LIFETIME_SECONDS });
  }

  return {
    stage: builder.build(),
    messages: allMessages,
    isComplete: allRedeemed,
    targetChains,
  };
}

// Retryable Preparation Functions

/**
 * Options for preparing retryable tickets
 */
export interface RetryablePrepareOptions {
  /** Prepare completed stages (for historical validation) */
  prepareCompleted?: boolean;
}

/**
 * Prepare a retryable ticket for redemption.
 */
export async function prepareRetryableRedemption(
  message: ParentToChildMessageReader,
  l2Provider: ethers.providers.Provider,
  options: RetryablePrepareOptions = {}
): Promise<PrepareResult> {
  const ticketId = message.retryableCreationId;
  log("Preparing retryable redemption for %s", ticketId);

  const status = await queryWithRetry(() => message.status());
  log("Retryable status: %s", ParentToChildMessageStatus[status]);

  // Skip status check if prepareCompleted=true for historical validation
  if (!options.prepareCompleted) {
    if (status === ParentToChildMessageStatus.REDEEMED) {
      return failPrepare("Retryable already redeemed");
    }

    if (status === ParentToChildMessageStatus.EXPIRED) {
      return failPrepare("Retryable ticket has expired");
    }

    if (status !== ParentToChildMessageStatus.FUNDS_DEPOSITED_ON_CHILD) {
      return failPrepare(`Retryable not ready. Status: ${ParentToChildMessageStatus[status]}`);
    }
  }

  // Get chain info from provider
  const targetChain = await getChain(l2Provider);
  const targetChainId = await getChainId(l2Provider);

  const calldata = arbRetryableInterface.encodeFunctionData("redeem", [ticketId]);

  return {
    success: true,
    prepared: {
      to: ADDRESSES.ARB_RETRYABLE_TX,
      data: calldata,
      value: "0",
      chain: targetChain,
      chainId: targetChainId,
      description: `Redeem retryable ticket ${ticketId}`,
    },
  };
}

/**
 * Prepare all retryable tickets from an L1 transaction
 */
export async function prepareAllRetryables(
  l1TxHash: string,
  l1Provider: ethers.providers.Provider,
  l2Provider: ethers.providers.Provider,
  options: RetryablePrepareOptions = {}
): Promise<BulkPrepareResult> {
  const receipt = await queryWithRetry(() => l1Provider.getTransactionReceipt(l1TxHash));
  if (!receipt) return bulkPrepareError("L1 transaction receipt not found", "arb1");

  const parentReceipt = new ParentTransactionReceipt(receipt);
  const messages = await parentReceipt.getParentToChildMessages(l2Provider);
  if (messages.length === 0) return bulkPrepareError("No retryable tickets found", "arb1");

  log("Preparing %d retryable tickets", messages.length);

  const results = await Promise.all(
    messages.map((message) => prepareRetryableRedemption(message, l2Provider, options))
  );

  const targetChain = await getChain(l2Provider);
  return { total: messages.length, results, targetChain };
}

/**
 * Prepare retryable stage for execution
 */
export async function prepareRetryableStage(
  stage: TrackedStage,
  l1Provider: ethers.providers.Provider,
  l2Provider: ethers.providers.Provider,
  options: RetryablePrepareOptions = {}
): Promise<BulkPrepareResult> {
  const validationError = validateStageForBulkPrepare(stage, "arb1", {
    prepareCompleted: options.prepareCompleted,
  });
  if (validationError) return validationError;

  const l1TxHash = stage.transactions[0]?.hash;
  if (!l1TxHash) return bulkPrepareError("L1 transaction hash not found", "arb1");

  return prepareAllRetryables(l1TxHash, l1Provider, l2Provider, options);
}
