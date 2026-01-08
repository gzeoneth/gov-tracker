/**
 * Cross-chain types: L2→L1 messages and retryables
 */

import { ChainId, L2Chain } from "./core";

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
