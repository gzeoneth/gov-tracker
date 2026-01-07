/**
 * Calldata Decoder
 *
 * Main decoder that orchestrates recursive calldata decoding with
 * nested call handling and retryable ticket detection.
 */

import Debug from "debug";
import type { DecodedCalldata, DecodedParameter } from "../types/calldata";
import { ChainContext } from "../types";
import { lookupSignature } from "./signature-lookup";
import { decodeParameters, isLikelyCalldata } from "./parameter-decoder";
import { isRetryableTicketMagic, decodeRetryableTicket } from "./retryable-ticket";
import { getAddressLabel } from "./address-utils";

const debug = Debug("gov-tracker:calldata");

/**
 * Maximum recursion depth for nested calldata decoding
 */
const MAX_DEPTH = 3;

/**
 * Selector for sendTxToL1 - indicates L2→L1 message, nested content is on L1
 */
const SEND_TX_TO_L1_SELECTOR = "0x928c169a";

/**
 * Decode calldata with recursive nested decoding support
 *
 * @param calldata - Hex-encoded calldata string
 * @param targetAddress - Optional target contract (for context)
 * @param depth - Current recursion depth (internal, default: 0)
 * @param chainContext - Chain for address resolution (default: "arb1")
 * @returns Decoded calldata with nested calls
 */
export async function decodeCalldata(
  calldata: string,
  targetAddress?: string,
  depth = 0,
  chainContext: ChainContext = "arb1"
): Promise<DecodedCalldata> {
  // Handle empty or invalid calldata
  if (!calldata || calldata === "0x" || calldata.length < 10) {
    return {
      selector: "",
      signature: null,
      parameters: null,
      raw: calldata || "0x",
      decodingSource: "failed",
      chainContext,
    };
  }

  // Extract selector (first 4 bytes = 10 chars including 0x)
  const selector = calldata.slice(0, 10).toLowerCase();

  // Lookup signature
  const { signature, source } = await lookupSignature(selector);

  if (!signature) {
    debug("Unknown signature for selector: %s", selector);
    return {
      selector,
      signature: null,
      parameters: null,
      raw: calldata,
      decodingSource: "failed",
      chainContext,
    };
  }

  // Determine chain context for nested content
  // sendTxToL1 means nested content is on L1
  const isSendTxToL1 = selector === SEND_TX_TO_L1_SELECTOR;
  const nestedContext: ChainContext = isSendTxToL1 ? "ethereum" : chainContext;

  // Decode parameters
  const decoded = decodeParameters(calldata, signature, chainContext);

  if (!decoded) {
    debug("Failed to decode parameters for: %s", signature);
    return {
      selector,
      signature,
      parameters: null,
      raw: calldata,
      decodingSource: source,
      chainContext,
    };
  }

  const { params, decoded: rawDecoded } = decoded;

  // For sendTxToL1, fix first param (target address) to use L1 context
  if (isSendTxToL1 && params[0]?.type === "address") {
    const addr = String(rawDecoded[0]);
    const label = getAddressLabel(addr, "ethereum");
    if (label) params[0].addressLabel = label;
  }

  // Process nested content if not at max depth
  if (depth < MAX_DEPTH) {
    await processNestedParams(params, Array.from(rawDecoded), nestedContext, depth);
  }

  return {
    selector,
    signature,
    parameters: params,
    raw: calldata,
    decodingSource: source,
    decodingTarget: targetAddress,
    chainContext,
  };
}

/**
 * Process parameters to decode nested calldata
 */
async function processNestedParams(
  params: DecodedParameter[],
  rawDecoded: unknown[],
  chainContext: ChainContext,
  depth: number
): Promise<void> {
  // Find address[] parameter (for batch operations, provides targets)
  const addressArrayParam = params.find((p) => p.type === "address[]");
  let targets: string[] = [];
  if (addressArrayParam) {
    const rawValue = rawDecoded[params.indexOf(addressArrayParam)];
    if (Array.isArray(rawValue)) {
      targets = rawValue.map((a) => String(a));
    }
  }

  // Find preceding address parameter for simple forwarding (e.g. sendTxToL1(address, bytes))
  // We'll update this as we iterate
  let lastAddressValue: string | undefined;

  for (let paramIdx = 0; paramIdx < params.length; paramIdx++) {
    const param = params[paramIdx];
    const rawValue = rawDecoded[paramIdx];

    // Capture address for context propagation to subsequent bytes params
    if (param.type === "address") {
      lastAddressValue = String(rawValue);
    }

    // Handle bytes[] array (e.g., scheduleBatch calldatas)
    if (param.type === "bytes[]" && param._rawBytesArray) {
      const nestedArray: DecodedCalldata[] = [];

      for (let i = 0; i < param._rawBytesArray.length; i++) {
        const bytesItem = param._rawBytesArray[i];
        const target = targets[i]; // Use target from parallel array

        // Check for retryable ticket magic
        if (target && isRetryableTicketMagic(target)) {
          const retryable = decodeRetryableTicket(bytesItem);
          if (retryable) {
            // Determine L2 chain context for address labeling and nested decoding
            const l2ChainContext: ChainContext | undefined =
              retryable.chain === "nova" ? "nova" : retryable.chain === "arb1" ? "arb1" : undefined;

            // Decode l2Calldata with L2 chain context only if chain is known
            let nestedL2Call: DecodedCalldata | undefined;
            if (l2ChainContext && isLikelyCalldata(retryable.l2Calldata)) {
              nestedL2Call = await decodeCalldata(
                retryable.l2Calldata,
                retryable.l2Target,
                depth + 1,
                l2ChainContext
              );
            }

            // Create retryable structure with decoded L2 call
            const retryableDecoded: DecodedCalldata = {
              selector: "",
              signature: null,
              isRetryable: true,
              parameters: [
                {
                  name: "inbox",
                  type: "address",
                  value: retryable.targetInbox,
                  rawValue: retryable.targetInbox,
                  isNested: false,
                  addressLabel: getAddressLabel(retryable.targetInbox, "ethereum"),
                },
                {
                  name: "l2Target",
                  type: "address",
                  value: retryable.l2Target,
                  rawValue: retryable.l2Target,
                  isNested: false,
                  addressLabel: getAddressLabel(retryable.l2Target, l2ChainContext),
                },
                {
                  name: "l2Value",
                  type: "uint256",
                  value: retryable.l2Value,
                  rawValue: retryable.l2Value,
                  isNested: false,
                },
                {
                  name: "gasLimit",
                  type: "uint256",
                  value: retryable.gasLimit,
                  rawValue: retryable.gasLimit,
                  isNested: false,
                },
                {
                  name: "maxFeePerGas",
                  type: "uint256",
                  value: retryable.maxFeePerGas,
                  rawValue: retryable.maxFeePerGas,
                  isNested: false,
                },
                {
                  name: "l2Calldata",
                  type: "bytes",
                  value: retryable.l2Calldata,
                  rawValue: retryable.l2Calldata,
                  isNested: !!nestedL2Call,
                  nested: nestedL2Call,
                },
              ],
              raw: bytesItem,
              decodingSource: "local",
              chainContext: "ethereum", // Retryable tickets are created on L1
              targetChain: retryable.chain, // Explicit target L2 chain field
            };

            nestedArray.push(retryableDecoded);
            continue;
          }
        }

        // Normal calldata decoding
        if (isLikelyCalldata(bytesItem)) {
          const decodedItem = await decodeCalldata(bytesItem, target, depth + 1, chainContext);
          nestedArray.push(decodedItem);
        }
      }

      if (nestedArray.length > 0) {
        param.nestedArray = nestedArray;
      }
    }

    // Handle single bytes parameter
    else if (param.type === "bytes" && param.isNested) {
      const rawBytes = String(rawValue);
      if (isLikelyCalldata(rawBytes)) {
        // Use lastAddressValue as target if available
        param.nested = await decodeCalldata(rawBytes, lastAddressValue, depth + 1, chainContext);
      }
    }
  }
}

/**
 * Decode multiple calldatas with their targets
 *
 * @param calldatas - Array of calldata hex strings
 * @param targets - Array of target addresses (same length as calldatas)
 * @param chainContext - Chain for address resolution
 * @returns Array of decoded calldata results
 */
export async function decodeCalldataArray(
  calldatas: string[],
  targets: string[],
  chainContext: ChainContext = "arb1"
): Promise<DecodedCalldata[]> {
  const results: DecodedCalldata[] = [];

  for (let i = 0; i < calldatas.length; i++) {
    const decoded = await decodeCalldata(calldatas[i], targets[i], 0, chainContext);
    results.push(decoded);
  }

  return results;
}
