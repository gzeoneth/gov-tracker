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
  if (data.calldatas && Array.isArray(data.calldatas) && data.calldatas.length > 0) {
    const count = data.calldatas.length;

    // Ensure targets alignment
    let targets: string[] = [];
    if (data.targets && Array.isArray(data.targets)) {
      targets = data.targets;
    } else if ((data as any).target && typeof (data as any).target === "string") {
      // Legacy/fallback: single target for multiple calldatas? Unlikely but safe to handle
      targets = Array(count).fill((data as any).target);
    }

    // Ensure values alignment
    let values: string[] = [];
    if (data.values && Array.isArray(data.values)) {
      values = data.values;
    }

    // Strict length check
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
  if (data.callScheduledData && Array.isArray(data.callScheduledData)) {
    for (const scheduled of data.callScheduledData) {
      // scheduled.data and scheduled.target are strictly typed in CallScheduledData
      if (scheduled.data && scheduled.target) {
        result.calldatas.push(scheduled.data);
        result.targets.push(scheduled.target);
        result.values.push(scheduled.value || "0");
      }
    }
    if (result.calldatas.length > 0) {
      return result;
    }
  }

  // 3. Fallback: check for single `data` field in stage data (Generic/Legacy)
  // Some stages might store a single calldata string in `data` or `calldata` field
  if (typeof (data as any).calldata === "string") {
    result.calldatas.push((data as any).calldata);
    result.targets.push((data as any).target || "0x0000000000000000000000000000000000000000");
    result.values.push((data as any).value || "0");
    return result;
  }

  return result;
}
