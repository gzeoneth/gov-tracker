/**
 * Simulation Data Types
 *
 * Types for simulation data preparation that clients can use
 * to call Tenderly API themselves.
 */

import type { ChainContext } from "./core";

/**
 * Type of simulation
 */
export type SimulationType = "retryable" | "timelock" | "call";

/**
 * Chain type for simulation targeting
 */
export type SimulationChainType = "L1" | "Arb1" | "Nova" | "unknown";

/**
 * Base simulation data shared by all simulation types
 */
export interface BaseSimulationData {
  /** Type of simulation */
  type: SimulationType;

  /** Network ID for Tenderly (1, 42161, 42170) */
  networkId: string;

  /** Address initiating the transaction */
  from: string;

  /** Target contract address */
  to: string;

  /** Encoded transaction input data */
  input: string;

  /** Wei value to send (default "0") */
  value: string;
}

/**
 * Retryable ticket simulation data (L1→L2 message)
 */
export interface RetryableSimulationData extends BaseSimulationData {
  type: "retryable";

  /** Target L2 chain */
  l2Chain: ChainContext;

  /** Original L2 target from retryable ticket */
  l2Target: string;

  /** Original L2 calldata */
  l2Calldata: string;

  /** Original L2 value */
  l2Value: string;
}

/**
 * Timelock batch simulation data (schedule→execute conversion)
 */
export interface TimelockSimulationData extends BaseSimulationData {
  type: "timelock";

  /** Timelock contract address */
  timelockAddress: string;

  /** Original scheduleBatch calldata */
  originalCalldata: string;

  /** Converted executeBatch calldata */
  executeCalldata: string;

  /** Computed operation ID (for storage override) */
  operationId: string;

  /** Decoded batch parameters */
  batchParams: {
    targets: string[];
    values: string[];
    calldatas: string[];
    predecessor: string;
    salt: string;
  };

  /** Storage override requirements */
  storageOverride: {
    /** Symbolic storage mapping for Tenderly encoding API */
    symbolic: Record<string, string>;
    /** Example: { "_timestamps[0x123...]": "1234567890" } */
  };
}

/**
 * Generic call simulation data
 */
export interface CallSimulationData extends BaseSimulationData {
  type: "call";

  /** Target chain */
  chain: SimulationChainType;

  /** Target contract */
  target: string;

  /** Call calldata */
  calldata: string;
}

/**
 * Union of all simulation data types
 */
export type SimulationData = RetryableSimulationData | TimelockSimulationData | CallSimulationData;

/**
 * Result of extracting simulation data from decoded calldata
 */
export interface ExtractedSimulation {
  /** Simulation data ready for client use */
  simulation: SimulationData;

  /** Human-readable label for this simulation */
  label: string;

  /** Index in batch (if part of a batch operation) */
  batchIndex?: number;
}
