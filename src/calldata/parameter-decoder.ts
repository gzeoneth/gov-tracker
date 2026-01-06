/**
 * Parameter Decoder
 *
 * Decodes ABI-encoded parameters from calldata into typed values.
 * Handles complex types like tuples, arrays, and provides formatting.
 */

import { ethers } from "ethers";
import type { ChainContext, DecodedParameter } from "../types/calldata";
import { getAddressLabel } from "./address-utils";

/**
 * Parse parameter types from function signature
 * Handles nested types like tuples and arrays
 *
 * @param typesStr - Parameter types string (e.g., "address,uint256,bytes")
 * @returns Array of individual type strings
 */
export function parseParamTypes(typesStr: string): string[] {
  const types: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of typesStr) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;

    if (char === "," && depth === 0) {
      if (current.trim()) types.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) types.push(current.trim());
  return types;
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
      try {
        const ethValue = ethers.utils.formatEther(bn);
        const ethNum = parseFloat(ethValue);
        // Only show ETH conversion for values >= 0.001 ETH
        if (ethNum >= 0.001) {
          return `${strValue} (${ethValue} ETH)`;
        }
      } catch {
        // Ignore formatting errors
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
  try {
    // Extract parameter types from signature
    const match = signature.match(/\((.+)\)$/);
    if (!match) return null;

    const typesStr = match[1];
    const paramTypes = parseParamTypes(typesStr);

    // Remove selector (first 4 bytes = 10 chars including 0x)
    const encodedParams = "0x" + calldata.slice(10);

    // Decode using ethers
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(paramTypes, encodedParams);

    // Format into DecodedParameter array
    const params: DecodedParameter[] = paramTypes.map((type, index) => {
      const rawValue = decoded[index];
      const param: DecodedParameter = {
        name: `arg${index}`,
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
  } catch (_error) {
    return null;
  }
}
