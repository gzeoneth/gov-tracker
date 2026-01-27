/**
 * Tenderly Payload Builders
 *
 * Dependency-free utilities for building Tenderly API request payloads.
 * These functions prepare data structures only - no HTTP calls or SDK dependencies.
 *
 * @example Basic simulation request
 * ```typescript
 * const payload = buildTenderlySimRequest(simulation);
 * const response = await fetch(
 *   `https://api.tenderly.co/api/v1/account/${account}/project/${project}/simulate`,
 *   { method: "POST", body: JSON.stringify(payload), headers: { "X-Access-Key": key } }
 * );
 * ```
 *
 * @example Timelock simulation with state override
 * ```typescript
 * // Step 1: Encode states
 * const encodePayload = buildTenderlyEncodeStatesRequest([timelockSim]);
 * const encodeResponse = await fetch(...);
 * const encodedState = encodeResponse.stateOverrides[timelockAddress].value;
 *
 * // Step 2: Simulate with encoded state
 * const simPayload = buildTenderlySimRequest(timelockSim, {
 *   state_objects: { [timelockAddress]: { storage: encodedState } }
 * });
 * ```
 */

import type { SimulationData, TimelockSimulationData } from "../types/simulation";

/**
 * Tenderly simulation request payload.
 * Matches the Tenderly API simulate endpoint schema.
 */
export interface TenderlySimRequest {
  /** Network ID (e.g., "1", "42161", "42170") */
  network_id: string;
  /** Sender address */
  from: string;
  /** Target contract address */
  to: string;
  /** Encoded calldata */
  input: string;
  /** Wei value as string */
  value: string;
  /** Save simulation to dashboard */
  save?: boolean;
  /** Save even if simulation fails */
  save_if_fails?: boolean;
  /** Simulation type: "quick" (fast) or "full" (with traces) */
  simulation_type?: "quick" | "full";
  /** Optional state overrides for storage manipulation */
  state_objects?: Record<string, { storage: Record<string, string> }>;
}

/**
 * Tenderly encode-states request payload.
 * Used to convert symbolic storage keys to actual storage slots.
 */
export interface TenderlyEncodeStatesRequest {
  /** Network ID for the encoding context */
  networkID: string;
  /** State overrides with symbolic keys */
  stateOverrides: Record<string, { value: Record<string, string> }>;
}

/**
 * Build a Tenderly simulate request payload from simulation data.
 *
 * @param simulation - Prepared simulation data from extraction functions
 * @param overrides - Optional additional fields to merge into the request
 * @returns Tenderly-compatible simulation request payload
 *
 * @example
 * ```typescript
 * const payload = buildTenderlySimRequest(simulation);
 * // { network_id: "42161", from: "0x...", to: "0x...", input: "0x...", value: "0", save: true }
 * ```
 */
export function buildTenderlySimRequest(
  simulation: SimulationData,
  overrides?: Partial<TenderlySimRequest>
): TenderlySimRequest {
  return {
    network_id: simulation.networkId,
    from: simulation.from,
    to: simulation.to,
    input: simulation.input,
    value: simulation.value,
    save: true,
    save_if_fails: true,
    simulation_type: "quick",
    ...overrides,
  };
}

/**
 * Build a Tenderly encode-states request for timelock simulations.
 *
 * Timelock operations require storage overrides to mark the operation as ready
 * for execution. This function builds the request payload for Tenderly's
 * encode-states API, which converts symbolic storage keys (like `_timestamps[opId]`)
 * to actual storage slots.
 *
 * @param simulations - Array of simulation data (filters to timelock type)
 * @returns Tenderly-compatible encode-states request payload, or null if no timelocks
 *
 * @example
 * ```typescript
 * const sims = extractAllSimulationsFromDecoded(decoded, "arb1");
 * const encodePayload = buildTenderlyEncodeStatesRequest(sims.map(s => s.simulation));
 *
 * if (encodePayload) {
 *   const response = await fetch(
 *     `https://api.tenderly.co/.../encode-states`,
 *     { method: "POST", body: JSON.stringify(encodePayload) }
 *   );
 * }
 * ```
 */
export function buildTenderlyEncodeStatesRequest(
  simulations: SimulationData[]
): TenderlyEncodeStatesRequest | null {
  const timelockSims = simulations.filter(
    (s): s is TimelockSimulationData => s.type === "timelock"
  );

  if (timelockSims.length === 0) return null;

  // Use the first timelock's network ID (they should all be same network)
  const networkID = timelockSims[0].networkId;

  // Build state overrides from all timelock simulations
  const stateOverrides: Record<string, { value: Record<string, string> }> = {};

  for (const sim of timelockSims) {
    const existing = stateOverrides[sim.timelockAddress]?.value ?? {};
    stateOverrides[sim.timelockAddress] = {
      value: { ...existing, ...sim.storageOverride.symbolic },
    };
  }

  return { networkID, stateOverrides };
}
