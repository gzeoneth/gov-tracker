/**
 * Chain and address utilities
 */

import { ethers } from "ethers";
import { ChainType } from "../types";
import { CHAIN_IDS } from "../constants";

/**
 * Get chain type from provider network.
 */
export async function getChainType(provider: ethers.providers.Provider): Promise<ChainType> {
  const network = await provider.getNetwork();
  if (network.chainId === CHAIN_IDS.NOVA) return "NOVA";
  if (network.chainId === CHAIN_IDS.ARB_ONE) return "L2";
  return "L1";
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
