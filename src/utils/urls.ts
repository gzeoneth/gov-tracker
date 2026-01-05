import { CHAIN_IDS } from "../constants";
import type { ChainType, StageTransaction } from "../types";

/**
 * Map ChainType to numeric chain ID
 */
export function chainTypeToId(chain: ChainType): number {
  switch (chain) {
    case "L1":
      return CHAIN_IDS.ETHEREUM;
    case "L2":
      return CHAIN_IDS.ARB_ONE;
    case "NOVA":
      return CHAIN_IDS.NOVA;
  }
}

export function getExplorerUrl(chainId: number, type: "tx" | "address", hash: string): string {
  switch (chainId) {
    case 1: // Ethereum
      return `https://etherscan.io/${type}/${hash}`;
    case CHAIN_IDS.ARB_ONE:
      return `https://arbiscan.io/${type}/${hash}`;
    case CHAIN_IDS.NOVA:
      return `https://nova.arbiscan.io/${type}/${hash}`;
    default:
      return `https://etherscan.io/${type}/${hash}`;
  }
}

export function getTxUrl(chainId: number, txHash: string): string {
  return getExplorerUrl(chainId, "tx", txHash);
}

/**
 * Get block explorer URL for a stage transaction
 *
 * @example
 * ```typescript
 * const stage = result.stages[0];
 * for (const tx of stage.transactions) {
 *   console.log(`${tx.hash}: ${getStageTransactionUrl(tx)}`);
 * }
 * ```
 */
export function getStageTransactionUrl(tx: StageTransaction): string {
  const chainId = chainTypeToId(tx.chain);
  return getTxUrl(chainId, tx.hash);
}
