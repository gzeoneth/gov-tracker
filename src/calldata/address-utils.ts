/**
 * Address Utilities
 *
 * Chain-aware address labeling for known governance contracts.
 */

import type { ChainContext, KnownAddress } from "../types/calldata";

/**
 * Known addresses registry organized by chain
 */
const KNOWN_ADDRESSES: Record<ChainContext, Record<string, string>> = {
  arb1: {
    // Governors
    "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9": "Core Governor",
    "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4": "Treasury Governor",
    "0x8a1cDA8dee421cD06023470608605934c16A05a0": "Nominee Election Governor",
    "0x467923B9AE90BDB36BA88eCA11604D45F13b712C": "Member Election Governor",

    // Timelocks
    "0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0": "L2 Core Timelock",
    "0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58": "L2 Treasury Timelock",

    // Other contracts
    "0x912CE59144191C1204E64559FE8253a0e49E6548": "ARB Token",
    "0xCF57572261c7c2BCF21ffD220ea7d1a27D40A827": "Arb1 UpgradeExecutor",
    "0xD509E5f5aEe2A205F554f36E8a7d56094494eDFC": "Security Council Manager",

    // Precompiles
    "0x0000000000000000000000000000000000000064": "ArbSys",
    "0x000000000000000000000000000000000000006E": "ArbRetryableTx",
  },
  nova: {
    "0x86a02dD71363c440b21F4c0E5B2Ad01Ffe1A7482": "Nova UpgradeExecutor",
  },
  ethereum: {
    // Timelock
    "0xE6841D92B0C345144506576eC13ECf5103aC7f49": "L1 Timelock",

    // UpgradeExecutor
    "0x3ffFbAdAF827559da092217e474760E2b2c3CeDd": "L1 UpgradeExecutor",

    // Delayed Inboxes
    "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f": "Arb1 Delayed Inbox",
    "0xc4448b71118c9071Bcb9734A0EAc55D18A153949": "Nova Delayed Inbox",

    // Special addresses
    "0xa723C008e76E379c55599D2E4d93879BeaFDa79C": "Retryable Ticket Magic",

    // Outboxes
    "0x0B9857ae2D4A3DBe74ffE1d7DF045bb7F96E4840": "Arb1 Outbox",
    "0xD4B80C3D7240325D18E645B49e6535A3Bf95cc58": "Nova Outbox",
  },
};

/**
 * Get known address label
 *
 * @param address - Contract address
 * @param chain - Chain context
 * @returns Label if known, undefined otherwise
 */
export function getAddressLabel(address: string, chain: ChainContext): string | undefined {
  const chainAddresses = KNOWN_ADDRESSES[chain];
  if (!chainAddresses) return undefined;

  const lowerAddress = address.toLowerCase();

  for (const [addr, label] of Object.entries(chainAddresses)) {
    if (addr.toLowerCase() === lowerAddress) {
      return label;
    }
  }

  return undefined;
}

/**
 * Get all known addresses for a chain
 *
 * @param chain - Chain context
 * @returns Array of known address entries
 */
export function getKnownAddresses(chain: ChainContext): KnownAddress[] {
  const chainAddresses = KNOWN_ADDRESSES[chain];
  if (!chainAddresses) return [];

  return Object.entries(chainAddresses).map(([address, label]) => ({
    address,
    label,
    chain,
  }));
}
