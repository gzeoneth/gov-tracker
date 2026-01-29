/**
 * Parameter Decoder
 *
 * Decodes ABI-encoded parameters from calldata into typed values.
 * Handles complex types like tuples, arrays, and provides formatting.
 * Also includes chain-aware address labeling for known governance contracts.
 */

import { ethers } from "ethers";
import type { DecodedParameter, DecodedCalldata } from "../types/calldata";
import type { Chain } from "../types";
import { ADDRESSES } from "../constants";

const A = ADDRESSES;

/**
 * Known addresses registry organized by chain.
 * Addresses shared with constants.ts are referenced via ADDRESSES to avoid duplication.
 */
const KNOWN_ADDRESSES: Record<Exclude<Chain, "unknown">, Record<string, string>> = {
  arb1: {
    [A.CONSTITUTIONAL_GOVERNOR]: "Core Governor",
    [A.NON_CONSTITUTIONAL_GOVERNOR]: "Treasury Governor",
    [A.ELECTION_NOMINEE_GOVERNOR]: "Nominee Election Governor",
    [A.ELECTION_MEMBER_GOVERNOR]: "Member Election Governor",
    [A.L2_CONSTITUTIONAL_TIMELOCK]: "L2 Core Timelock",
    [A.L2_NON_CONSTITUTIONAL_TIMELOCK]: "L2 Treasury Timelock",
    [A.SECURITY_COUNCIL_MANAGER]: "Security Council Manager",
    [A.ARB_SYS]: "ArbSys",
    [A.ARB_RETRYABLE_TX]: "ArbRetryableTx",
    "0x912CE59144191C1204E64559FE8253a0e49E6548": "ARB Token",
    "0xCF57572261c7c2BCF21ffD220ea7d1a27D40A827": "Arb1 UpgradeExecutor",
  },
  nova: {
    "0x86a02dD71363c440b21F4c0E5B2Ad01Ffe1A7482": "Nova UpgradeExecutor",
  },
  ethereum: {
    [A.L1_TIMELOCK]: "L1 Timelock",
    [A.ARB1_DELAYED_INBOX]: "Arb1 Delayed Inbox",
    [A.NOVA_DELAYED_INBOX]: "Nova Delayed Inbox",
    [A.RETRYABLE_TICKET_MAGIC]: "Retryable Ticket Magic",
    [A.ARB1_OUTBOX]: "Arb1 Outbox",
    [A.NOVA_OUTBOX]: "Nova Outbox",
    "0x3ffFbAdAF827559da092217e474760E2b2c3CeDd": "L1 UpgradeExecutor",
  },
};

/**
 * Known addresses registry indexed by lowercase address for O(1) lookup
 */
const KNOWN_ADDRESSES_INDEXED: Record<
  Exclude<Chain, "unknown">,
  Record<string, string>
> = Object.fromEntries(
  Object.entries(KNOWN_ADDRESSES).map(([chain, addresses]) => [
    chain,
    Object.fromEntries(
      Object.entries(addresses).map(([addr, label]) => [addr.toLowerCase(), label])
    ),
  ])
) as Record<Exclude<Chain, "unknown">, Record<string, string>>;

/**
 * Get known address label
 *
 * @param address - Contract address
 * @param chain - Chain context (or undefined for unknown chains)
 * @returns Label if known, undefined otherwise
 */
export function getAddressLabel(address: string, chain: Chain | undefined): string | undefined {
  if (!chain || chain === "unknown") return undefined;
  return KNOWN_ADDRESSES_INDEXED[chain][address.toLowerCase()];
}

/**
 * Options for createParam helper
 */
interface CreateParamOptions {
  isNested?: boolean;
  nested?: DecodedCalldata;
  chain?: Chain;
  rawBytesArray?: string[];
}

/**
 * Create a DecodedParameter with sensible defaults
 *
 * @param name - Parameter name
 * @param type - Solidity type
 * @param value - Raw value (used for both rawValue and displayValue)
 * @param options - Optional nested, chain context, etc.
 * @returns DecodedParameter
 */
export function createParam(
  name: string,
  type: string,
  value: unknown,
  options: CreateParamOptions = {}
): DecodedParameter {
  const { isNested = false, nested, chain, rawBytesArray } = options;
  const param: DecodedParameter = {
    name,
    type,
    displayValue: typeof value === "string" ? value : formatDecodedValue(value, type),
    rawValue: value,
    isNested,
  };
  if (type === "address" && typeof value === "string") {
    const label = getAddressLabel(value, chain);
    if (label) param.addressLabel = label;
  }
  if (nested) param.nested = nested;
  if (rawBytesArray) param._rawBytesArray = rawBytesArray;
  return param;
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
  // Wrapped in try/catch to handle malformed calldata gracefully
  let decoded: ethers.utils.Result;
  try {
    decoded = iface.decodeFunctionData(fragment, calldata);
  } catch {
    return null;
  }

  // Format into DecodedParameter array
  const params: DecodedParameter[] = inputs.map((paramType, index) => {
    const rawValue = decoded[index];
    const type = paramType.format();
    const name = paramType.name || `arg${index}`;

    const param: DecodedParameter = {
      name,
      type,
      displayValue: formatDecodedValue(rawValue, type),
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
      param.displayValue = bytesValue;
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
