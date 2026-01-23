/**
 * Simulation Data Preparation
 *
 * Prepares simulation data structures for clients to use with Tenderly API.
 * Does not make API calls - returns data for client consumption.
 */

import { ethers } from "ethers";
import { Address } from "@arbitrum/sdk/dist/lib/dataEntities/address";
import type { DecodedCalldata } from "../types/calldata";
import { Chain, L2Chain, chainToChainId } from "../types";
import type {
  RetryableSimulationData,
  TimelockSimulationData,
  CallSimulationData,
  ExtractedSimulation,
} from "../types/simulation";
import { ADDRESSES, NETWORK_IDS, TIMELOCK_SELECTORS } from "../constants";
import { hashOperationBatch } from "../utils/operation-id";

/**
 * Get network ID for chain (internal)
 */
function getNetworkId(chain: Chain): string {
  if (chain === "unknown") return NETWORK_IDS.ethereum;
  return NETWORK_IDS[chain] ?? NETWORK_IDS.ethereum;
}

/**
 * Prepare retryable ticket simulation data
 *
 * @param l2Target - Target contract on L2
 * @param l2Calldata - Calldata to execute on L2
 * @param l2Value - ETH value to send (wei)
 * @param l2Chain - Target L2 chain
 * @returns Simulation data for client use
 */
export function prepareRetryableSimulation(
  l2Target: string,
  l2Calldata: string,
  l2Value: string,
  l2Chain: L2Chain | "unknown"
): RetryableSimulationData {
  const networkId = getNetworkId(l2Chain);
  const l2ChainId = chainToChainId(l2Chain);
  const fromAddress = new Address(ADDRESSES.L1_TIMELOCK).applyAlias().value;

  return {
    type: "retryable",
    networkId,
    from: fromAddress,
    to: l2Target,
    input: l2Calldata,
    value: l2Value || "0",
    l2Chain,
    l2ChainId,
    l2Target,
    l2Calldata,
    l2Value: l2Value || "0",
  };
}

/**
 * Decode scheduleBatch calldata to extract batch parameters
 */
function decodeScheduleBatchParams(calldata: string): {
  targets: string[];
  values: string[];
  calldatas: string[];
  predecessor: string;
  salt: string;
} | null {
  try {
    // Remove selector
    const data = calldata.slice(10);

    const decoded = ethers.utils.defaultAbiCoder.decode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
      "0x" + data
    );

    return {
      targets: (decoded[0] as string[]).map((a) => String(a)),
      values: (decoded[1] as ethers.BigNumber[]).map((v) => v.toString()),
      calldatas: decoded[2] as string[],
      predecessor: decoded[3] as string,
      salt: decoded[4] as string,
    };
  } catch {
    return null;
  }
}

/**
 * Convert scheduleBatch calldata to executeBatch
 *
 * scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)
 * executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt)
 *
 * The delay parameter is removed when converting to execute
 */
function convertScheduleToExecute(calldata: string): string {
  try {
    if (calldata.toLowerCase().startsWith(TIMELOCK_SELECTORS.scheduleBatch)) {
      // Decode scheduleBatch parameters (includes delay as 6th param)
      const data = calldata.slice(10);
      const decoded = ethers.utils.defaultAbiCoder.decode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
        "0x" + data
      );

      // Re-encode as executeBatch (without delay)
      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
        [decoded[0], decoded[1], decoded[2], decoded[3], decoded[4]]
      );

      return TIMELOCK_SELECTORS.executeBatch + encoded.slice(2);
    }

    if (calldata.toLowerCase().startsWith(TIMELOCK_SELECTORS.schedule)) {
      // Decode schedule parameters (includes delay as 6th param)
      const data = calldata.slice(10);
      const decoded = ethers.utils.defaultAbiCoder.decode(
        ["address", "uint256", "bytes", "bytes32", "bytes32", "uint256"],
        "0x" + data
      );

      // Re-encode as execute (without delay)
      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "bytes32", "bytes32"],
        [decoded[0], decoded[1], decoded[2], decoded[3], decoded[4]]
      );

      return TIMELOCK_SELECTORS.execute + encoded.slice(2);
    }
  } catch {
    // Decode failed, return original calldata
  }

  return calldata;
}

/**
 * Prepare timelock batch simulation data
 *
 * @param timelockAddress - Timelock contract address
 * @param scheduleBatchCalldata - Original scheduleBatch calldata
 * @param chain - Chain where timelock is deployed
 * @returns Simulation data for client use
 */
export function prepareTimelockSimulation(
  timelockAddress: string,
  scheduleBatchCalldata: string,
  chain: Chain = "ethereum"
): TimelockSimulationData | null {
  const batchParams = decodeScheduleBatchParams(scheduleBatchCalldata);
  if (!batchParams) return null;

  const operationId = hashOperationBatch({
    targets: batchParams.targets,
    values: batchParams.values.map((v) => ethers.BigNumber.from(v)),
    payloads: batchParams.calldatas,
    predecessor: batchParams.predecessor,
    salt: batchParams.salt,
  });

  const executeCalldata = convertScheduleToExecute(scheduleBatchCalldata);
  const networkId = getNetworkId(chain);

  return {
    type: "timelock",
    networkId,
    from: timelockAddress,
    to: timelockAddress,
    input: executeCalldata,
    value: "0",
    timelockAddress,
    originalCalldata: scheduleBatchCalldata,
    executeCalldata,
    operationId,
    batchParams,
    storageOverride: {
      symbolic: {
        [`_timestamps[${operationId}]`]: "1",
      },
    },
  };
}

/**
 * Prepare generic call simulation data
 *
 * @param target - Target contract address
 * @param calldata - Transaction calldata
 * @param value - ETH value (wei)
 * @param chain - Target chain
 * @param from - Optional sender override
 * @returns Simulation data for client use
 */
export function prepareCallSimulation(
  target: string,
  calldata: string,
  value: string,
  chain: Chain,
  from?: string
): CallSimulationData {
  const networkId = getNetworkId(chain);
  const chainId = chainToChainId(chain);

  // Default sender based on chain
  let fromAddress = from;
  if (!fromAddress) {
    if (chain === "ethereum") {
      fromAddress = ADDRESSES.L1_TIMELOCK;
    } else {
      fromAddress = new Address(ADDRESSES.L1_TIMELOCK).applyAlias().value;
    }
  }

  return {
    type: "call",
    networkId,
    from: fromAddress,
    to: target,
    input: calldata,
    value: value || "0",
    chain,
    chainId,
    target,
    calldata,
  };
}

/**
 * Process scheduleBatch/schedule calls for timelock simulation
 */
function processTimelockBatch(
  decoded: DecodedCalldata,
  chainContext: Chain
): ExtractedSimulation | null {
  if (decoded.signature?.match(/^schedule(Batch)?\(/)) {
    const isScheduleBatch = decoded.signature?.startsWith("scheduleBatch(");

    // Prefer the contract address we are decoding on as the timelock address whenever available.
    // For scheduleBatch, there is no single timelock "target" argument, so decodingTarget is required.
    const targetAddress = decoded.decodingTarget;

    // Fallback: for simple schedule() (non-batch) calls only, derive the timelock address
    // from the first address-typed parameter (typically the "target" of the scheduled call).
    // We deliberately DO NOT apply this heuristic to scheduleBatch(), where multiple targets
    // are involved and there is no single canonical address.
    const targetParam = !isScheduleBatch
      ? decoded.parameters?.find((p) => p.type === "address")
      : undefined;

    // Use explicit decodingTarget when present, otherwise fall back to the first address arg
    // for non-batch schedule() calls as described above.
    const timelockAddress = targetAddress || (targetParam?.rawValue as string | undefined);

    if (timelockAddress && decoded.raw) {
      const sim = prepareTimelockSimulation(timelockAddress, decoded.raw, chainContext);
      if (sim) {
        return {
          simulation: sim,
          label: `Timelock: ${decoded.signature}`,
        };
      }
    }
  }
  return null;
}

/**
 * Process retryable ticket calls for L2 simulation
 */
function processRetryableTicket(
  nestedCall: DecodedCalldata,
  index: number
): ExtractedSimulation | null {
  if (nestedCall.isRetryable) {
    const l2TargetParam = nestedCall.parameters?.find((p) => p.name === "l2Target");
    const l2CalldataParam = nestedCall.parameters?.find((p) => p.name === "l2Calldata");
    const l2ValueParam = nestedCall.parameters?.find((p) => p.name === "l2Value");

    if (l2TargetParam && l2CalldataParam) {
      // Get chain from targetChain field
      const chain = nestedCall.targetChain;

      // Only create simulation if chain is known (arb1 or nova)
      if (chain === "arb1" || chain === "nova") {
        const sim = prepareRetryableSimulation(
          l2TargetParam.rawValue as string,
          l2CalldataParam.rawValue as string,
          (l2ValueParam?.rawValue as string | undefined) || "0",
          chain
        );

        // Generate label from targetChain (use raw identifier)
        return {
          simulation: sim,
          label: `Retryable Ticket → ${chain}`,
          batchIndex: index,
        };
      }
    }
  }
  return null;
}

/**
 * Process generic calls within a batch
 */
function processGenericCall(
  nestedCall: DecodedCalldata,
  decoded: DecodedCalldata,
  index: number,
  chainContext: Chain
): ExtractedSimulation | null {
  if (nestedCall.signature && !nestedCall.isRetryable) {
    const addressArrayParam = decoded.parameters?.find((p) => p.type === "address[]");
    const addresses = addressArrayParam?.rawValue as string[];
    const target = addresses?.[index];

    if (target && nestedCall.raw) {
      const sim = prepareCallSimulation(target, nestedCall.raw, "0", chainContext);
      return {
        simulation: sim,
        label: `Call: ${nestedCall.signature}`,
        batchIndex: index,
      };
    }
  }
  return null;
}

/**
 * Extract all simulation data from decoded calldata tree
 *
 * Walks the decoded calldata structure and finds all simulatable calls:
 * - Retryable tickets
 * - Timelock batches (scheduleBatch/schedule)
 * - Generic calls
 *
 * @param decoded - Decoded calldata from decodeCalldata()
 * @param chainContext - Current chain context
 * @returns Array of extracted simulations
 */
export function extractAllSimulationsFromDecoded(
  decoded: DecodedCalldata,
  chainContext: Chain = "arb1"
): ExtractedSimulation[] {
  const simulations: ExtractedSimulation[] = [];

  // 1. Check for Timelock Batch
  const timelockSim = processTimelockBatch(decoded, chainContext);
  if (timelockSim) {
    simulations.push(timelockSim);
  }

  // 2. Process nested params
  if (decoded.parameters) {
    for (const param of decoded.parameters) {
      // Check nested arrays (bytes[]) - often used in batches
      if (param.nestedArray) {
        for (let i = 0; i < param.nestedArray.length; i++) {
          const nestedCall = param.nestedArray[i];

          // Try identifying as Retryable Ticket first
          const retryableSim = processRetryableTicket(nestedCall, i);
          if (retryableSim) {
            simulations.push(retryableSim);
          } else {
            // Otherwise try as Generic Call
            const callSim = processGenericCall(nestedCall, decoded, i, chainContext);
            if (callSim) {
              simulations.push(callSim);
            }
          }

          // Recursively check deeper
          simulations.push(...extractAllSimulationsFromDecoded(nestedCall, chainContext));
        }
      }

      // Check single nested call (bytes)
      if (param.nested) {
        simulations.push(...extractAllSimulationsFromDecoded(param.nested, chainContext));
      }
    }
  }

  return simulations;
}
