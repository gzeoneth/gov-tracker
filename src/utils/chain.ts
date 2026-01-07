/**
 * Chain and address utilities
 */

import { ethers } from "ethers";
import { Chain, ChainId, chainIdToChain } from "../types";

/**
 * Get chain name from provider network.
 */
export async function getChain(provider: ethers.providers.Provider): Promise<Chain> {
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
