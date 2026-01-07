/**
 * Simulation Data Preparation
 *
 * Prepares simulation data structures for clients to use with Tenderly API.
 * Does not make API calls - returns data for client consumption.
 */

import { ethers } from "ethers";
import { Address } from "@arbitrum/sdk/dist/lib/dataEntities/address";
import type { ChainContext, DecodedCalldata } from "../types/calldata";
import type {
  RetryableSimulationData,
  TimelockSimulationData,
  CallSimulationData,
  ExtractedSimulation,
  SimulationChainType,
} from "../types/simulation";
import { ADDRESSES } from "../constants";
import { retryableChainToContext, getRetryableChainLabel } from "../calldata/retryable-ticket";

/**
 * Network IDs for supported chains
 */
export const NETWORK_IDS = {
  ethereum: "1",
  arb1: "42161",
  nova: "42170",
} as const;

/**
 * Function selectors for timelock operations
 */
export const TIMELOCK_SELECTORS = {
  schedule: "0x01d5062a",
  execute: "0x134008d3",
  scheduleBatch: "0x8f2a0bb0",
  executeBatch: "0xe38335e5",
} as const;

/**
 * Convert ChainContext to SimulationChainType
 */
export function chainContextToSimType(chain: ChainContext): SimulationChainType {
  switch (chain) {
    case "ethereum":
      return "L1";
    case "arb1":
      return "Arb1";
    case "nova":
      return "Nova";
    default:
      return "unknown";
  }
}

/**
 * Get network ID for chain
 */
export function getNetworkId(chain: ChainContext): string {
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
  l2Chain: ChainContext
): RetryableSimulationData {
  const networkId = getNetworkId(l2Chain);
  const fromAddress = new Address(ADDRESSES.L1_TIMELOCK).applyAlias().value;

  return {
    type: "retryable",
    networkId,
    from: fromAddress,
    to: l2Target,
    input: l2Calldata,
    value: l2Value || "0",
    l2Chain,
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

    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(
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
 * Compute operation ID for timelock batch
 */
function hashOperationBatch(
  targets: string[],
  values: string[],
  calldatas: string[],
  predecessor: string,
  salt: string
): string {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
    [targets, values.map((v) => ethers.BigNumber.from(v)), calldatas, predecessor, salt]
  );
  return ethers.utils.keccak256(encoded);
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
  if (calldata.toLowerCase().startsWith(TIMELOCK_SELECTORS.scheduleBatch)) {
    // Decode scheduleBatch parameters (includes delay as 6th param)
    const data = calldata.slice(10);
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
      "0x" + data
    );

    // Re-encode as executeBatch (without delay)
    const encoded = abiCoder.encode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
      [decoded[0], decoded[1], decoded[2], decoded[3], decoded[4]]
    );

    return TIMELOCK_SELECTORS.executeBatch + encoded.slice(2);
  }

  if (calldata.toLowerCase().startsWith(TIMELOCK_SELECTORS.schedule)) {
    // Decode schedule parameters (includes delay as 6th param)
    const data = calldata.slice(10);
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(
      ["address", "uint256", "bytes", "bytes32", "bytes32", "uint256"],
      "0x" + data
    );

    // Re-encode as execute (without delay)
    const encoded = abiCoder.encode(
      ["address", "uint256", "bytes", "bytes32", "bytes32"],
      [decoded[0], decoded[1], decoded[2], decoded[3], decoded[4]]
    );

    return TIMELOCK_SELECTORS.execute + encoded.slice(2);
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
  chain: ChainContext = "ethereum"
): TimelockSimulationData | null {
  const batchParams = decodeScheduleBatchParams(scheduleBatchCalldata);
  if (!batchParams) return null;

  const operationId = hashOperationBatch(
    batchParams.targets,
    batchParams.values,
    batchParams.calldatas,
    batchParams.predecessor,
    batchParams.salt
  );

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
  chain: ChainContext,
  from?: string
): CallSimulationData {
  const networkId = getNetworkId(chain);

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
    chain: chainContextToSimType(chain),
    target,
    calldata,
  };
}

/**
 * Process scheduleBatch/schedule calls for timelock simulation
 */
function processTimelockBatch(
  decoded: DecodedCalldata,
  chainContext: ChainContext
): ExtractedSimulation | null {
  if (decoded.signature?.match(/^schedule(Batch)?\(/)) {
    // Ideally we use the contract address we are decoding on as the timelock address
    const targetAddress = decoded.decodingTarget;

    // Fallback: Check for 'target' parameter if it's a simple schedule() call
    const targetParam = decoded.parameters?.find((p) => p.type === "address");

    // Use explicit target or first address arg
    // Note: For scheduleBatch, there is no single address arg, so decodingTarget is essential
    const timelockAddress = targetAddress || targetParam?.value;

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
      // Get chain from targetChain field and convert to ChainContext
      const chain = nestedCall.targetChain || "unknown";
      const l2Chain = retryableChainToContext(chain);

      const sim = prepareRetryableSimulation(
        l2TargetParam.value,
        l2CalldataParam.value,
        l2ValueParam?.value || "0",
        l2Chain
      );

      // Generate label from targetChain
      const chainLabel = getRetryableChainLabel(chain);

      return {
        simulation: sim,
        label: `Retryable Ticket → ${chainLabel}`,
        batchIndex: index,
      };
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
  chainContext: ChainContext
): ExtractedSimulation | null {
  if (nestedCall.signature && !nestedCall.isRetryable) {
    const addressArrayParam = decoded.parameters?.find((p) => p.type === "address[]");
    if (addressArrayParam) {
      const match = addressArrayParam.value.match(/\[(.*)\]/);
      if (match) {
        const addresses = match[1].split(",").map((a) => a.trim());
        const target = addresses[index];
        if (target && nestedCall.raw) {
          const sim = prepareCallSimulation(target, nestedCall.raw, "0", chainContext);
          return {
            simulation: sim,
            label: `Call: ${nestedCall.signature}`,
            batchIndex: index,
          };
        }
      }
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
  chainContext: ChainContext = "arb1"
): ExtractedSimulation[] {
  const simulations: ExtractedSimulation[] = [];

  // Use decoded chain context if available, otherwise use parameter
  const effectiveChainContext = decoded.chainContext ?? chainContext;

  // 1. Check for Timelock Batch
  const timelockSim = processTimelockBatch(decoded, effectiveChainContext);
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
            const callSim = processGenericCall(nestedCall, decoded, i, effectiveChainContext);
            if (callSim) {
              simulations.push(callSim);
            }
          }

          // Recursively check deeper (nestedCall has its own chainContext)
          simulations.push(...extractAllSimulationsFromDecoded(nestedCall, effectiveChainContext));
        }
      }

      // Check single nested call (bytes) (nested has its own chainContext)
      if (param.nested) {
        simulations.push(...extractAllSimulationsFromDecoded(param.nested, effectiveChainContext));
      }
    }
  }

  return simulations;
}
