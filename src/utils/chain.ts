/**
 * Chain and address utilities
 */

import { BigNumber, ethers } from "ethers";
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

/**
 * Compare two BigNumbers for sorting (ascending order).
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 */
export function compareBigNumber(a: BigNumber, b: BigNumber): number {
  return a.lt(b) ? -1 : a.gt(b) ? 1 : 0;
}

/**
 * Compare two BigNumbers for sorting (descending order).
 * Returns 1 if a < b, -1 if a > b, 0 if equal.
 */
export function compareBigNumberDesc(a: BigNumber, b: BigNumber): number {
  return a.lt(b) ? 1 : a.gt(b) ? -1 : 0;
}
