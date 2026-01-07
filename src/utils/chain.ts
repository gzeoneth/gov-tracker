/**
 * Chain and address utilities
 */

import { ethers } from "ethers";
import { CHAIN_IDS } from "../constants";
import { Chain, ChainId, chainIdToChain } from "../types";

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
 * Get chain type from provider network.
 * Returns both chain name and chainId.
 */
export async function getChainType(provider: ethers.providers.Provider): Promise<Chain> {
  const network = await provider.getNetwork();
  return chainIdToChain(network.chainId);
}

/**
 * Get chain ID from provider network.
 */
export async function getChainId(provider: ethers.providers.Provider): Promise<ChainId> {
  const network = await provider.getNetwork();
  return network.chainId;
}

/**
 * Get both chain name and ID from provider.
 */
export async function getChainInfo(
  provider: ethers.providers.Provider
): Promise<{ chain: Chain; chainId: ChainId }> {
  const network = await provider.getNetwork();
  const chainId = network.chainId;
  return {
    chain: chainIdToChain(chainId),
    chainId,
  };
}

/**
 * Case-insensitive address comparison.
 */
export function addressEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Check if an address is in a set of addresses (case-insensitive).
 */
export function isAddressIn(address: string, addresses: readonly string[]): boolean {
  const normalized = address.toLowerCase();
  return addresses.some((a) => a.toLowerCase() === normalized);
}
