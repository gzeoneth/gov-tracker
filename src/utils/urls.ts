import { CHAIN_IDS } from "../constants";
import type { ChainType, StageTransaction, ChainContext } from "../types";

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

/**
 * Explorer base URLs by chain
 */
const EXPLORER_URLS: Record<ChainContext, string> = {
  arb1: "https://arbiscan.io",
  nova: "https://nova.arbiscan.io",
  ethereum: "https://etherscan.io",
};

/**
 * Human-readable chain labels
 */
const CHAIN_LABELS: Record<ChainContext, string> = {
  arb1: "Arb1",
  nova: "Nova",
  ethereum: "L1",
};

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

/**
 * Get human-readable chain label
 *
 * @param chain - Chain context
 * @returns Chain label (e.g., "Arb1", "Nova", "L1")
 */
export function getChainLabel(chain: ChainContext): string {
  return CHAIN_LABELS[chain] ?? chain;
}

/**
 * Get block explorer URL for an address
 *
 * @param address - Contract address
 * @param chain - Chain context
 * @returns Full explorer URL
 */
export function getAddressExplorerUrl(address: string, chain: ChainContext): string {
  const baseUrl = EXPLORER_URLS[chain] ?? EXPLORER_URLS.ethereum;
  return `${baseUrl}/address/${address}`;
}

/**
 * Get block explorer URL for a transaction
 *
 * @param txHash - Transaction hash
 * @param chain - Chain context
 * @returns Full explorer URL
 */
export function getTxExplorerUrl(txHash: string, chain: ChainContext): string {
  const baseUrl = EXPLORER_URLS[chain] ?? EXPLORER_URLS.ethereum;
  return `${baseUrl}/tx/${txHash}`;
}
