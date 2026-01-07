/**
 * Tracker Execute Module
 *
 * Handles transaction preparation for READY stages.
 * This module encapsulates all execution-related operations.
 */

import { ethers } from "ethers";
import { TrackedStage, PrepareResult, PrepareOptions, getStageData } from "../types";
import { prepareGovernorQueue } from "../stages/proposal-queued";
import { prepareTimelockStage } from "../stages/timelock";
import { prepareL2ToL1MessageStage } from "../stages/l2-to-l1-message";
import { prepareRetryableStage } from "../stages/retryables";
import { failPrepare } from "../stages/base";
import { loggers } from "../utils/logger";

const log = loggers.execution;

/**
 * Context for execution operations
 */
export interface ExecuteContext {
  l1Provider: ethers.providers.Provider;
  l2Provider: ethers.providers.Provider;
  novaProvider: ethers.providers.Provider;
}

/**
 * Prepare a transaction for a READY stage without sending it.
 *
 * Returns PrepareResult with the prepared transaction data.
 * Consumer is responsible for signing and sending the transaction.
 *
 * @example
 * ```typescript
 * const result = await prepareTransaction(readyStage, context, options);
 * if (result.success) {
 *   console.log(`To: ${result.prepared.to}`);
 *   console.log(`Data: ${result.prepared.data}`);
 *   console.log(`Chain: ${result.prepared.chain}`);
 *
 *   // Execute with your own signer
 *   const tx = await signer.sendTransaction({
 *     to: result.prepared.to,
 *     data: result.prepared.data,
 *     value: result.prepared.value,
 *   });
 *   await tx.wait();
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function prepareTransaction(
  stage: TrackedStage,
  context: ExecuteContext,
  options: PrepareOptions = {}
): Promise<PrepareResult> {
  const { l1Provider, l2Provider, novaProvider } = context;
  log("prepareTransaction type=%s status=%s", stage.type, stage.status);

  switch (stage.type) {
    case "PROPOSAL_QUEUED": {
      // Queue a proposal on the governor (calls governor.queue())
      const queueData = getStageData(stage, "PROPOSAL_QUEUED");
      if (!queueData) {
        return failPrepare("Stage is not a PROPOSAL_QUEUED stage");
      }

      const { governorAddress, proposalId, targets, values, calldatas, description } = queueData;

      if (!governorAddress || !proposalId || !targets || !values || !calldatas || !description) {
        return failPrepare("Missing proposal queue params in stage data");
      }

      return prepareGovernorQueue(
        governorAddress,
        proposalId,
        {
          targets,
          values: values.map((v) => ethers.BigNumber.from(v)),
          calldatas,
          descriptionHash: ethers.utils.id(description),
        },
        l2Provider
      );
    }

    case "L2_TIMELOCK": {
      return prepareTimelockStage(stage, l2Provider, options);
    }

    case "L1_TIMELOCK": {
      return prepareTimelockStage(stage, l1Provider, options);
    }

    case "L2_TO_L1_MESSAGE": {
      const { total, results } = await prepareL2ToL1MessageStage(stage, l2Provider, l1Provider, {
        prepareCompleted: options.prepareCompleted,
      });
      if (results.length === 0) {
        return failPrepare("No messages to prepare");
      }
      // Find first successful result
      const successResult = results.find((r) => r.success);
      if (successResult) {
        // If there are multiple messages, include warning about additional messages
        if (total > 1) {
          return {
            ...successResult,
            prepared: {
              ...successResult.prepared,
              description:
                successResult.prepared.description +
                ` [1/${total} messages - use prepareL2ToL1MessageStage() for all]`,
            },
          };
        }
        return successResult;
      }
      // All failed, return first result
      return results[0];
    }

    case "RETRYABLE_EXECUTED": {
      const retryableData = getStageData(stage, "RETRYABLE_EXECUTED");
      const targetChain = retryableData?.targetChains?.[0];
      // Validate target chain exists before selecting provider
      if (!targetChain) {
        return failPrepare("No target chain found in retryable stage data");
      }
      const targetProvider = targetChain === "nova" ? novaProvider : l2Provider;
      if (!targetProvider) {
        return failPrepare("Target chain provider not available");
      }
      const { total, results } = await prepareRetryableStage(stage, l1Provider, targetProvider, {
        prepareCompleted: options.prepareCompleted,
      });
      if (results.length === 0) {
        return failPrepare("No tickets to prepare");
      }
      // Find first successful result
      const successResult = results.find((r) => r.success);
      if (successResult) {
        // If there are multiple tickets, include warning
        if (total > 1) {
          return {
            ...successResult,
            prepared: {
              ...successResult.prepared,
              description:
                successResult.prepared.description +
                ` [1/${total} tickets - use prepareRetryableStage() for all]`,
            },
          };
        }
        return successResult;
      }
      // All failed, return first result
      return results[0];
    }

    default:
      return failPrepare(`Preparation not supported for stage type: ${stage.type}`);
  }
}
