/**
 * Calldata Decoder
 *
 * Main decoder that orchestrates recursive calldata decoding with
 * nested call handling and retryable ticket detection.
 */

import Debug from "debug";
import type { DecodedCalldata, DecodedParameter } from "../types/calldata";
import { Chain, TrackedStage, ExtractedCalldata } from "../types";
import { lookupSignature } from "./signature-lookup";
import { decodeParameters, isLikelyCalldata, getAddressLabel } from "./parameter-decoder";
import { isRetryableTicketMagic, decodeRetryableTicket } from "./retryable-ticket";

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
  chainContext: Chain = "arb1"
): Promise<DecodedCalldata> {
  // Handle empty or invalid calldata
  if (!calldata || calldata === "0x" || calldata.length < 10) {
    return {
      selector: "",
      signature: null,
      parameters: null,
      raw: calldata || "0x",
      decodingSource: "failed",
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
    };
  }

  // Determine chain context for nested content
  // sendTxToL1 means nested content is on L1
  const isSendTxToL1 = selector === SEND_TX_TO_L1_SELECTOR;
  const nestedContext: Chain = isSendTxToL1 ? "ethereum" : chainContext;

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
  };
}

/**
 * Process parameters to decode nested calldata
 */
async function processNestedParams(
  params: DecodedParameter[],
  rawDecoded: unknown[],
  chainContext: Chain,
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
          // Determine L2 chain context for address labeling and nested decoding
          const l2ChainContext: Chain | undefined =
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
                displayValue: retryable.targetInbox,
                rawValue: retryable.targetInbox,
                isNested: false,
                addressLabel: getAddressLabel(retryable.targetInbox, "ethereum"),
              },
              {
                name: "l2Target",
                type: "address",
                displayValue: retryable.l2Target,
                rawValue: retryable.l2Target,
                isNested: false,
                addressLabel: getAddressLabel(retryable.l2Target, l2ChainContext),
              },
              {
                name: "l2Value",
                type: "uint256",
                displayValue: retryable.l2Value,
                rawValue: retryable.l2Value,
                isNested: false,
              },
              {
                name: "gasLimit",
                type: "uint256",
                displayValue: retryable.gasLimit,
                rawValue: retryable.gasLimit,
                isNested: false,
              },
              {
                name: "maxFeePerGas",
                type: "uint256",
                displayValue: retryable.maxFeePerGas,
                rawValue: retryable.maxFeePerGas,
                isNested: false,
              },
              {
                name: "l2Calldata",
                type: "bytes",
                displayValue: retryable.l2Calldata,
                rawValue: retryable.l2Calldata,
                isNested: !!nestedL2Call,
                nested: nestedL2Call,
              },
            ],
            raw: bytesItem,
            decodingSource: "local",
            targetChain: retryable.chain, // Explicit target L2 chain field
          };

          nestedArray.push(retryableDecoded);
          continue;
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
  chainContext: Chain = "arb1"
): Promise<DecodedCalldata[]> {
  const results: DecodedCalldata[] = [];

  for (let i = 0; i < calldatas.length; i++) {
    const decoded = await decodeCalldata(calldatas[i], targets[i], 0, chainContext);
    results.push(decoded);
  }

  return results;
}

/**
 * Loose data type for extracting calldata from multiple stage types.
 * Used to access fields that exist on some but not all stage data types.
 */
interface ExtractableStageData {
  calldatas?: string[];
  targets?: string[];
  values?: string[];
  callScheduledData?: Array<{
    data: string;
    target: string;
    value?: string | { toString(): string };
  }>;
}

/**
 * Extract calldata, targets, and values from a tracked stage.
 * Handles different data structures for Proposals vs Timelock operations.
 * Ensures all returned arrays have the same length.
 *
 * @param stage The tracked stage to inspect
 * @returns Object containing aligned arrays of calldatas, targets, and values
 */
export function extractCalldataFromStage(stage: TrackedStage): ExtractedCalldata {
  // Cast to loose type for field extraction - fields may not exist on all stage types
  const data = stage.data as unknown as ExtractableStageData;
  const result: ExtractedCalldata = { calldatas: [], targets: [], values: [] };

  // 1. Check for explicit calldatas array (Proposals)
  // ProposalCreatedData and ProposalQueuedData use plural 'calldatas', 'targets', 'values'
  if (data.calldatas && data.calldatas.length > 0) {
    const count = data.calldatas.length;

    const targets = data.targets || [];
    const values = data.values || [];

    // Strict length checks - these are part of the logic to ensure data integrity
    if (targets.length !== count) {
      throw new Error(`Mismatch in targets length: expected ${count}, got ${targets.length}`);
    }

    if (values.length !== count) {
      throw new Error(`Mismatch in values length: expected ${count}, got ${values.length}`);
    }

    for (let i = 0; i < count; i++) {
      result.calldatas.push(data.calldatas[i]);
      result.targets.push(targets[i]);
      result.values.push(values[i]);
    }
    return result;
  }

  // 2. Check for Timelock scheduled data (L1/L2 Timelock)
  // Timelock stages usually have `callScheduledData` array containing the operations
  if (data.callScheduledData) {
    for (let i = 0; i < data.callScheduledData.length; i++) {
      const scheduled = data.callScheduledData[i];
      // scheduled.data and scheduled.target are strictly typed in CallScheduledData
      result.calldatas.push(scheduled.data);
      result.targets.push(scheduled.target);
      const valueStr =
        typeof scheduled.value === "string" ? scheduled.value : scheduled.value?.toString();
      if (valueStr === undefined) {
        throw new Error(`Missing value in callScheduledData at index ${i}`);
      }
      result.values.push(valueStr);
    }
    if (result.calldatas.length > 0) {
      return result;
    }
  }

  return result;
}
