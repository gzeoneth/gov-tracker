/**
 * Cross-chain types: L2→L1 messages and retryables
 */

import { BigNumber } from "ethers";
import { ChainId, L2Chain } from "./core";

/**
 * L2 to L1 message status
 */
export type L2ToL1MessageStatus = "UNCONFIRMED" | "CONFIRMED" | "EXECUTED";

/**
 * L2 to L1 message data
 */
export interface L2ToL1MessageData {
  messageId: string;
  sender: string;
  destination: string;
  arbBlockNum: BigNumber;
  ethBlockNum: BigNumber;
  timestamp: BigNumber;
  callvalue: BigNumber;
  data: string;
  status: L2ToL1MessageStatus;
  l2TxHash: string;
  l1TxHash?: string;
  firstExecutableBlock?: number;
}

/**
 * Retryable ticket status
 */
export type RetryableStatus = "CREATED" | "REDEEMED" | "EXPIRED" | "FAILED";

/**
 * Retryable ticket data
 */
export interface RetryableData {
  ticketId: string;
  l1TxHash: string;
  l2TxHash?: string;
  from: string;
  to: string;
  value: BigNumber;
  data: string;
  status: RetryableStatus;
  createdAtBlock: number;
  redeemedAtBlock?: number;
}

/**
 * Retryable ticket info for stage data
 */
export interface RetryableTicketInfo {
  l2TxHash: string;
  targetChain: L2Chain;
  targetChainId: ChainId;
  status: string;
}

/**
 * Retryable redemption info for stage data
 */
export interface RetryableRedemptionInfo {
  l2TxHash: string;
  targetChain: L2Chain;
  targetChainId: ChainId;
  txHash: string;
  blockNumber: number;
}

/**
 * Retryable creation detail
 */
export interface RetryableCreationDetail {
  index: number;
  targetChain: L2Chain;
  targetChainId: ChainId;
  l2TxHash: string;
}

/**
 * Retryable redemption detail
 */
export interface RetryableRedemptionDetail {
  index: number;
  targetChain: L2Chain;
  targetChainId: ChainId;
  status: string;
  l2TxHash: string | null;
}
