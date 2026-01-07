/**
 * Calldata Extraction Module
 *
 * Utilities for extracting raw calldata, execution targets, and ETH values
 * from different types of tracked stages (Proposal, Timelock, etc.).
 */

import { TrackedStage, TrackedStageData, ExtractedCalldata } from "../types";

/**
 * Extract calldata, targets, and values from a tracked stage.
 * Handles different data structures for Proposals vs Timelock operations.
 * Ensures all returned arrays have the same length.
 *
 * @param stage The tracked stage to inspect
 * @returns Object containing aligned arrays of calldatas, targets, and values
 */
export function extractCalldataFromStage(stage: TrackedStage): ExtractedCalldata {
  const data = stage.data as TrackedStageData;
  const result: ExtractedCalldata = { calldatas: [], targets: [], values: [] };

  // 1. Check for explicit calldatas array (Proposals)
  // ProposalCreatedData and ProposalQueuedData use plural 'calldatas', 'targets', 'values'
  if (data.calldatas && data.calldatas.length > 0) {
    const count = data.calldatas.length;

    const targets = data.targets || [];
    const values = data.values || [];

    // Strict length checks - these are part of the logic to ensure data integrity
    if (targets.length !== count) {
      throw new Error(`Mismatch in targets length: expected ${count}, got ${targets.length}`);
    }

    if (values.length !== count) {
      throw new Error(`Mismatch in values length: expected ${count}, got ${values.length}`);
    }

    for (let i = 0; i < count; i++) {
      result.calldatas.push(data.calldatas[i]);
      result.targets.push(targets[i]);
      result.values.push(values[i]);
    }
    return result;
  }

  // 2. Check for Timelock scheduled data (L1/L2 Timelock)
  // Timelock stages usually have `callScheduledData` array containing the operations
  if (data.callScheduledData) {
    for (const scheduled of data.callScheduledData) {
      // scheduled.data and scheduled.target are strictly typed in CallScheduledData
      result.calldatas.push(scheduled.data);
      result.targets.push(scheduled.target);
      result.values.push(scheduled.value || "0");
    }
    if (result.calldatas.length > 0) {
      return result;
    }
  }

  return result;
}
