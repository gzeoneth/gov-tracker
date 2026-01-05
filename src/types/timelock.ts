/**
 * Timelock-related types for Arbitrum Governance
 */

import { BigNumber } from "ethers";

/**
 * Timelock operation state
 */
export type TimelockOperationState = "UNKNOWN" | "PENDING" | "READY" | "DONE";

/**
 * Serialized CallScheduledData for JSON storage
 */
export interface SerializedCallScheduledData {
  operationId: string;
  index: string;
  target: string;
  value: string;
  data: string;
  predecessor: string;
  delay: string;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timelockAddress: string;
}

/**
 * Parsed CallScheduled event data
 */
export interface CallScheduledData {
  operationId: string;
  index: BigNumber;
  target: string;
  value: BigNumber;
  data: string;
  predecessor: string;
  delay: BigNumber;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timelockAddress: string;
}

/**
 * Parsed CallExecuted event data
 */
export interface CallExecutedData {
  operationId: string;
  index: BigNumber;
  target: string;
  value: BigNumber;
  data: string;
  blockNumber: number;
  txHash: string;
  logIndex: number;
}

/**
 * Parameters for a timelock operation
 */
export interface TimelockParams {
  target: string;
  value: BigNumber;
  data: string;
  predecessor: string;
  salt: string;
}

/**
 * Parameters for a batch timelock operation
 */
export interface TimelockBatchParams {
  targets: string[];
  values: BigNumber[];
  payloads: string[];
  predecessor: string;
  salt: string;
}

/**
 * Combined state of a timelock operation
 */
export interface TimelockState {
  operationId: string;
  state: TimelockOperationState;
  eta?: number;
  isReady: boolean;
  isDone: boolean;
  scheduledData?: CallScheduledData;
  allScheduledData?: CallScheduledData[];
  executedData?: CallExecutedData;
  isBatch?: boolean;
}

/**
 * Operation state from timelock contract state checks
 */
export interface OperationState {
  isOperation: boolean;
  isPending: boolean;
  isReady: boolean;
  isDone: boolean;
  state: string;
  timestamp: BigNumber;
}

/**
 * Link from proposal to timelock operation
 */
export interface TimelockLink {
  txHash: string;
  operationId: string;
  timelockAddress: string;
  queueBlockNumber: number;
}
