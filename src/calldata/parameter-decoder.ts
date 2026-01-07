/**
 * Parameter Decoder
 *
 * Decodes ABI-encoded parameters from calldata into typed values.
 * Handles complex types like tuples, arrays, and provides formatting.
 */

import { ethers } from "ethers";
import type { DecodedParameter } from "../types/calldata";
import type { ChainContext } from "../types";
import { getAddressLabel } from "./address-utils";

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

  // Handle bytes - truncate middle for readability
  if (typeof value === "string" && value.startsWith("0x") && value.length > 34) {
    const prefix = value.slice(0, 18);
    const suffix = value.slice(-16);
    return `${prefix}...${suffix}`;
  }

  // Default: convert to string
  return String(value);
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
  chainContext: ChainContext
): { params: DecodedParameter[]; decoded: ethers.utils.Result } | null {
  // Use ethers Interface for robust decoding
  const iface = new ethers.utils.Interface([signature]);
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
