import { CHAIN_IDS } from "../constants";
import type { Chain, ChainId, StageTransaction } from "../types";

/**
 * Map Chain to numeric chain ID
 */
export function chainToId(chain: Chain): ChainId | undefined {
  switch (chain) {
    case "ethereum":
      return CHAIN_IDS.ETHEREUM;
    case "arb1":
      return CHAIN_IDS.ARB_ONE;
    case "nova":
      return CHAIN_IDS.NOVA;
    case "unknown":
      return undefined;
  }
}

/**
 * @deprecated Use chainToId instead
 * Map legacy ChainType to numeric chain ID
 */
export function chainTypeToId(chain: "ethereum" | "L2" | "NOVA"): number {
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
const EXPLORER_URLS: Record<Exclude<Chain, "unknown">, string> = {
  arb1: "https://arbiscan.io",
  nova: "https://nova.arbiscan.io",
  ethereum: "https://etherscan.io",
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
  return getTxUrl(tx.chainId, tx.hash);
}

/**
 * Get block explorer URL for a transaction
 *
 * @param txHash - Transaction hash
 * @param chain - Chain context
 * @returns Full explorer URL
 */
export function getTxExplorerUrl(txHash: string, chain: Chain): string {
  const baseUrl = EXPLORER_URLS[chain as Exclude<Chain, "unknown">] ?? EXPLORER_URLS.ethereum;
  return `${baseUrl}/tx/${txHash}`;
}
