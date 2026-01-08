/**
 * Parameter Decoder
 *
 * Decodes ABI-encoded parameters from calldata into typed values.
 * Handles complex types like tuples, arrays, and provides formatting.
 * Also includes chain-aware address labeling for known governance contracts.
 */

import { ethers } from "ethers";
import type { DecodedParameter } from "../types/calldata";
import type { Chain } from "../types";

/**
 * Known addresses registry organized by chain
 */
const KNOWN_ADDRESSES: Record<Exclude<Chain, "unknown">, Record<string, string>> = {
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
 * @param chain - Chain context (or undefined for unknown chains)
 * @returns Label if known, undefined otherwise
 */
export function getAddressLabel(address: string, chain: Chain | undefined): string | undefined {
  if (!chain || chain === "unknown") return undefined;

  const chainAddresses = KNOWN_ADDRESSES[chain];
  const normalized = address.toLowerCase();

  for (const [addr, label] of Object.entries(chainAddresses)) {
    if (addr.toLowerCase() === normalized) {
      return label;
    }
  }

  return undefined;
}

/**
 * Parse parameter types from function signature
 * Handles nested types like tuples and arrays
 *
 * @param typesStr - Parameter types string (e.g., "address,uint256,bytes")
 * @returns Array of individual type strings
 */
export function parseParamTypes(typesStr: string): string[] {
  // Use ethers to parse the types string by wrapping it in a dummy function signature
  const fragment = ethers.utils.FunctionFragment.from(`func(${typesStr})`);
  return fragment.inputs.map((p) => p.format());
}

/**
 * Check if a value looks like calldata (for nested decoding)
 *
 * @param value - Hex string to check
 * @returns True if it looks like valid calldata
 */
export function isLikelyCalldata(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  if (!value.startsWith("0x")) return false;

  // Must have at least selector (4 bytes = 8 hex chars + 0x)
  if (value.length < 10) return false;

  // Check if it's all hex
  const hexPattern = /^0x[0-9a-fA-F]+$/;
  return hexPattern.test(value);
}

/**
 * Format a decoded value for display
 *
 * @param value - The raw decoded value
 * @param type - Solidity type string
 * @returns Formatted string representation
 */
export function formatDecodedValue(value: unknown, type: string): string {
  // Handle BigNumber
  if (ethers.BigNumber.isBigNumber(value)) {
    const bn = value as ethers.BigNumber;
    const strValue = bn.toString();

    // For uint256 that might be ETH amounts, show conversion
    if (type.includes("uint256") && bn.gt(0)) {
      const ethValue = ethers.utils.formatEther(bn);
      const ethNum = parseFloat(ethValue);
      // Only show ETH conversion for values >= 0.001 ETH
      if (ethNum >= 0.001) {
        return `${strValue} (${ethValue} ETH)`;
      }
    }

    return strValue;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    const elementType = type.endsWith("[]") ? type.slice(0, -2) : type;
    const formatted = value.map((v) => formatDecodedValue(v, elementType));
    return `[${formatted.join(", ")}]`;
  }

  // Handle very long strings - only truncate if > 1000 chars to preserve data integrity
  const strValue = String(value);
  if (strValue.length > 1000) {
    const prefix = strValue.slice(0, 500);
    const suffix = strValue.slice(-500);
    return `${prefix}...${suffix}`;
  }

  return strValue;
}

/**
 * Decode parameters from calldata using signature
 *
 * @param calldata - Full calldata hex string (with selector)
 * @param signature - Function signature (e.g., "transfer(address,uint256)")
 * @param chainContext - Chain for address resolution
 * @returns Array of decoded parameters, or null if decoding fails
 */
export function decodeParameters(
  calldata: string,
  signature: string,
  chainContext: Chain
): { params: DecodedParameter[]; decoded: ethers.utils.Result } | null {
  // Use ethers Interface for robust decoding
  const iface = new ethers.utils.Interface([`function ${signature}`]);
  const fragment = iface.getFunction(signature);
  const inputs = fragment.inputs;

  // Decode using Interface - handles selector automatically
  const decoded = iface.decodeFunctionData(fragment, calldata);

  // Format into DecodedParameter array
  const params: DecodedParameter[] = inputs.map((paramType, index) => {
    const rawValue = decoded[index];
    const type = paramType.format();
    const name = paramType.name || `arg${index}`;

    const param: DecodedParameter = {
      name,
      type,
      value: formatDecodedValue(rawValue, type),
      rawValue: rawValue,
      isNested: false,
    };

    // Handle address type - add label
    if (type === "address") {
      const addr = String(rawValue);
      const label = getAddressLabel(addr, chainContext);
      if (label) param.addressLabel = label;
    }

    // Handle bytes type - check if nested calldata
    if (type === "bytes") {
      const bytesValue = String(rawValue);
      if (isLikelyCalldata(bytesValue)) {
        param.isNested = true;
      }
      param.value = bytesValue;
    }

    // Handle bytes[] - store raw array for nested processing
    if (type === "bytes[]" && Array.isArray(rawValue)) {
      param._rawBytesArray = rawValue.map((b) => String(b));
      param.isNested = true;
    }

    return param;
  });

  return { params, decoded };
}
